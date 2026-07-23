from __future__ import annotations
import hashlib
import json
import re
from decimal import Decimal, InvalidOperation
from urllib.parse import urljoin, urlparse, urlunparse
from slugify import slugify


def canonical_host(value: str | None) -> str:
    host = (value or "").casefold().rstrip(".")
    return host[4:] if host.startswith("www.") else host


def clean_text(value: str | None) -> str | None:
    if not value:
        return None
    value = re.sub(r"\s+", " ", value).strip()
    return value or None


def parse_number(value: str | int | float | None) -> float | None:
    if value is None:
        return None
    raw = str(value).strip().replace("\u00a0", " ").replace(" ", "")
    if not raw:
        return None
    raw = re.sub(r"[^0-9,.-]", "", raw)
    if not raw or raw in {"-", ".", ","}:
        return None
    if "," in raw and "." in raw:
        decimal_separator = "," if raw.rfind(",") > raw.rfind(".") else "."
        thousands_separator = "." if decimal_separator == "," else ","
        raw = raw.replace(thousands_separator, "").replace(decimal_separator, ".")
    elif "," in raw:
        tail = raw.rsplit(",", 1)[1]
        raw = raw.replace(",", "") if len(tail) == 3 else raw.replace(",", ".")
    elif "." in raw:
        tail = raw.rsplit(".", 1)[1]
        if len(tail) == 3 and raw.count(".") == 1:
            raw = raw.replace(".", "")
    try:
        parsed = Decimal(raw)
    except InvalidOperation:
        return None
    if not parsed.is_finite() or parsed <= 0 or parsed > Decimal("10000000"):
        return None
    return float(parsed)


def parse_price(value: str | int | float | None, *, require_currency: bool = True) -> float | None:
    if not value:
        return None
    raw = clean_text(str(value)) or ""
    currency_pattern = r"(?:AZN|₼|manat)"
    if require_currency:
        match = re.search(
            rf"(?<!\d)(\d[\d\s.,]*?)\s*{currency_pattern}(?!\w)|{currency_pattern}\s*(\d[\d\s.,]*)(?!\d)",
            raw,
            re.IGNORECASE,
        )
        if not match:
            return None
        return parse_number(match.group(1) or match.group(2))
    return parse_number(raw)


def price_text(price: float | None, currency: str = "AZN") -> str:
    if price is None:
        return "Qiymət sorğu əsasında"
    rendered = f"{price:,.2f}".replace(",", "_").replace(".", ",").replace("_", " ")
    return f"{rendered} {currency}"

def make_id(source_id: str, url: str, name: str) -> str:
    raw = f"{source_id}|{url}|{name}".encode("utf-8")
    return f"{source_id}-{hashlib.sha1(raw).hexdigest()[:16]}"

def make_slug(name: str, source_id: str) -> str:
    return slugify(f"{name}-{source_id}", lowercase=True)

def normalize_url(base_url: str, url: str) -> str:
    joined = urljoin(f"{base_url.rstrip('/')}/", str(url or "").strip())
    parsed = urlparse(joined)
    path = re.sub(r"/{2,}", "/", parsed.path or "/")
    return urlunparse((parsed.scheme.lower(), parsed.netloc.lower(), path, "", parsed.query, ""))


def url_matches_source(url: str, base_url: str, patterns: list[str] | None = None) -> bool:
    parsed = urlparse(url)
    base = urlparse(base_url)
    if (
        parsed.scheme != "https"
        or canonical_host(parsed.hostname) != canonical_host(base.hostname)
    ):
        return False
    if parsed.username or parsed.password or (parsed.port not in (None, 443)):
        return False
    return not patterns or any(re.search(pattern, parsed.path, re.IGNORECASE) for pattern in patterns)


def normalize_key(value: str | None) -> str:
    return re.sub(r"[^a-z0-9əöüğışç]+", "", (value or "").casefold())


def item_content_hash(payload: dict) -> str:
    stable = json.dumps(payload, ensure_ascii=False, sort_keys=True, default=str)
    return hashlib.sha256(stable.encode("utf-8")).hexdigest()
