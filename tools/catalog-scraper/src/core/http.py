from __future__ import annotations
import asyncio
import time
from urllib.parse import urljoin, urlparse
from urllib.robotparser import RobotFileParser

import httpx

from src.core.utils import canonical_host


class UnsafeUrlError(ValueError):
    pass


class RobotsDeniedError(PermissionError):
    pass


class ResponseTooLargeError(ValueError):
    pass


class HttpClient:
    def __init__(
        self,
        *,
        user_agent: str,
        allowed_hosts: set[str],
        delay: float = 1.5,
        timeout: float = 30,
        max_response_bytes: int = 6_000_000,
        respect_robots: bool = True,
        fail_closed_on_robots_error: bool = True,
    ):
        self.user_agent = user_agent
        self.allowed_hosts = {canonical_host(host) for host in allowed_hosts}
        self.delay = delay
        self.max_response_bytes = max_response_bytes
        self.respect_robots = respect_robots
        self.fail_closed_on_robots_error = fail_closed_on_robots_error
        self._robots: dict[str, RobotFileParser] = {}
        self._robots_lock = asyncio.Lock()
        self._rate_lock = asyncio.Lock()
        self._last_request: dict[str, float] = {}
        self.client = httpx.AsyncClient(
            headers={"User-Agent": user_agent},
            timeout=timeout,
            follow_redirects=False,
        )

    def _validate_url(self, url: str) -> tuple[str, str]:
        parsed = urlparse(url)
        hostname = (parsed.hostname or "").casefold()
        if (
            parsed.scheme != "https"
            or canonical_host(hostname) not in self.allowed_hosts
            or parsed.username
            or parsed.password
            or parsed.port not in (None, 443)
        ):
            raise UnsafeUrlError(f"Allowlist xaricində URL bloklandı: {url}")
        origin = f"https://{hostname}"
        return hostname, origin

    async def _fetch_with_redirects(
        self,
        url: str,
        *,
        check_robots: bool,
        allowed_statuses: set[int] | None = None,
    ) -> httpx.Response:
        current_url = url
        for _ in range(6):
            host, origin = self._validate_url(current_url)
            if check_robots and self.respect_robots:
                parser = await self._load_robots(origin, host)
                if not parser.can_fetch(self.user_agent, current_url):
                    raise RobotsDeniedError(f"robots.txt sorğunu blokladı: {current_url}")

            await self._respect_rate_limit(canonical_host(host))
            response = await self.client.get(current_url)
            if response.status_code in {301, 302, 303, 307, 308}:
                location = response.headers.get("location")
                if not location:
                    raise httpx.HTTPStatusError(
                        f"Yönləndirmə ünvanı yoxdur: {current_url}",
                        request=response.request,
                        response=response,
                    )
                current_url = urljoin(current_url, location)
                continue

            if response.status_code not in (allowed_statuses or set()):
                response.raise_for_status()
            declared_size = int(response.headers.get("content-length") or 0)
            if (
                declared_size > self.max_response_bytes
                or len(response.content) > self.max_response_bytes
            ):
                raise ResponseTooLargeError(f"Cavab limiti aşdı: {current_url}")
            return response
        raise httpx.TooManyRedirects(f"Yönləndirmə limiti aşdı: {url}")

    async def _respect_rate_limit(self, host: str) -> None:
        async with self._rate_lock:
            elapsed = time.monotonic() - self._last_request.get(host, 0)
            if elapsed < self.delay:
                await asyncio.sleep(self.delay - elapsed)
            self._last_request[host] = time.monotonic()

    async def _load_robots(self, origin: str, host: str) -> RobotFileParser:
        if origin in self._robots:
            return self._robots[origin]
        async with self._robots_lock:
            if origin in self._robots:
                return self._robots[origin]
            parser = RobotFileParser(f"{origin}/robots.txt")
            try:
                response = await self._fetch_with_redirects(
                    parser.url,
                    check_robots=False,
                    allowed_statuses={404},
                )
                if response.status_code == 404:
                    parser.parse(["User-agent: *", "Allow: /"])
                else:
                    parser.parse(response.text.splitlines())
            except Exception:
                if self.fail_closed_on_robots_error:
                    raise RobotsDeniedError(f"robots.txt oxunmadığı üçün mənbə bloklandı: {origin}")
                parser.parse(["User-agent: *", "Allow: /"])
            self._robots[origin] = parser
            return parser

    async def _request(self, url: str) -> httpx.Response:
        self._validate_url(url)
        last_error: Exception | None = None
        for attempt in range(3):
            try:
                return await self._fetch_with_redirects(url, check_robots=True)
            except (httpx.RequestError, httpx.HTTPStatusError) as exc:
                last_error = exc
                if attempt == 2 or (
                    isinstance(exc, httpx.HTTPStatusError)
                    and exc.response.status_code < 500
                    and exc.response.status_code != 429
                ):
                    raise
                await asyncio.sleep(2 ** attempt)
        raise last_error or RuntimeError(f"Sorğu uğursuz oldu: {url}")

    async def get_text(self, url: str) -> str:
        return (await self._request(url)).text

    async def get_bytes(self, url: str) -> tuple[bytes, str]:
        response = await self._request(url)
        content_type = response.headers.get("content-type", "").split(";", 1)[0].strip().lower()
        if not content_type.startswith("image/"):
            raise ValueError(f"Şəkil olmayan media bloklandı: {url}")
        return response.content, content_type

    async def close(self) -> None:
        await self.client.aclose()
