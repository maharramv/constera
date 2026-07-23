from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Any, Iterable
from urllib.parse import urlparse

from bs4 import BeautifulSoup

from src.adapters.base import BaseAdapter
from src.core.models import CatalogItem, CrawlError, CrawlResult
from src.core.utils import (
    clean_text,
    item_content_hash,
    make_id,
    make_slug,
    normalize_url,
    parse_price,
    price_text,
    url_matches_source,
)


def _walk_json(value: Any) -> Iterable[dict]:
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from _walk_json(child)
    elif isinstance(value, list):
        for child in value:
            yield from _walk_json(child)


def _safe_image(base_url: str, value: str | None) -> str | None:
    if not value:
        return None
    url = normalize_url(base_url, value)
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        return None
    lowered = parsed.path.casefold()
    if any(token in lowered for token in ("logo", "favicon", "sprite", "avatar", "banner")):
        return None
    return url if url_matches_source(url, base_url) else None


class InsaatAdapter(BaseAdapter):
    def _error(self, error: Exception, url: str | None = None) -> CrawlError:
        return CrawlError(
            source_id=self.source_id,
            url=url,
            error_type=type(error).__name__,
            message=str(error)[:1_000],
        )

    async def crawl(self) -> CrawlResult:
        result = CrawlResult(source_id=self.source_id)
        patterns = self.source.get("allowed_path_patterns") or [r"\.html$"]
        seen: set[str] = set()
        discovered: list[tuple[str, str, str]] = []

        for page in self.source.get("listing_pages") or []:
            path = page.get("path")
            kind = page.get("kind")
            category = page.get("category")
            if not path or kind not in {"service", "rental", "package"} or not category:
                continue
            listing_url = normalize_url(self.base_url, path)
            try:
                html = await self.http.get_text(listing_url)
                soup = BeautifulSoup(html, "lxml")
                for anchor in soup.select("a[href]"):
                    url = normalize_url(self.base_url, anchor.get("href", ""))
                    if url in seen or not url_matches_source(url, self.base_url, patterns):
                        continue
                    seen.add(url)
                    discovered.append((url, kind, category))
            except Exception as exc:
                result.errors.append(self._error(exc, listing_url))

        result.discovered = len(discovered)
        max_items = max(0, int(self.source.get("max_items", 300)))
        for url, kind, category in discovered[:max_items]:
            try:
                item = await self.parse_listing(url, kind, category)
                if item:
                    result.items.append(item)
                else:
                    result.skipped += 1
            except Exception as exc:
                result.errors.append(self._error(exc, url))
        result.skipped += max(0, len(discovered) - max_items)
        return result

    def _json_documents(self, soup: BeautifulSoup) -> list[dict]:
        documents: list[dict] = []
        for script in soup.select("script[type='application/ld+json']"):
            try:
                value = json.loads(script.string or script.get_text())
            except (TypeError, json.JSONDecodeError):
                continue
            documents.extend(_walk_json(value))
        return documents

    async def parse_listing(self, url: str, kind: str, category: str) -> CatalogItem | None:
        html = await self.http.get_text(url)
        soup = BeautifulSoup(html, "lxml")
        documents = self._json_documents(soup)

        h1 = soup.select_one("h1")
        name = clean_text(h1.get_text(" ", strip=True) if h1 else None)
        if not name:
            return None

        offer = next(
            (
                item
                for item in documents
                if str(item.get("@type", "")).casefold() in {"offer", "aggregateoffer"}
            ),
            None,
        )
        amount = None
        if offer and str(offer.get("priceCurrency", "AZN")).upper() == "AZN":
            amount = parse_price(offer.get("price") or offer.get("lowPrice"), require_currency=False)

        if amount is None:
            price_nodes = soup.select(
                "[itemprop='price'], [data-price], .price, .elan_price, .product-price, [class*='price']"
            )
            for node in price_nodes[:12]:
                candidate = (
                    node.get("content")
                    or node.get("data-price")
                    or node.parent.get_text(" ", strip=True)
                )
                amount = parse_price(candidate, require_currency=True)
                if amount is not None:
                    break

        description_node = soup.select_one(
            "[itemprop='description'], #description, .description, .elan_description, "
            ".infop100.fullteshow, article"
        )
        description = clean_text(description_node.get_text(" ", strip=True) if description_node else None)

        provider_node = soup.select_one(
            "[itemprop='seller'], [itemprop='author'], .author, .username, .user-name, .seller-name"
        )
        provider = clean_text(provider_node.get_text(" ", strip=True) if provider_node else None)
        city_node = soup.select_one("[itemprop='addressLocality'], .location, .city, .elan_city")
        city = clean_text(city_node.get_text(" ", strip=True) if city_node else None)
        contact_node = soup.select_one(".infocontact")
        if contact_node and (not provider or not city):
            contact_parts = [
                clean_text(str(value))
                for value in contact_node.find_all(string=True)
            ]
            contact_parts = [value for value in contact_parts if value]
            if not city:
                city = next(
                    (
                        value
                        for value in contact_parts
                        if re.search(r"\b(?:şəhəri|rayonu|qəsəbəsi)\b", value, re.IGNORECASE)
                    ),
                    None,
                )
            if not provider:
                provider = next(
                    (
                        value
                        for value in contact_parts
                        if value != city
                        and not re.search(r"\d{5,}|nömrəni göstər", value, re.IGNORECASE)
                    ),
                    None,
                )

        unit = None
        if description and amount is not None:
            rendered_amount = rf"{amount:g}".replace(".", r"[.,]")
            if re.search(
                rf"\bgünlük\s+{rendered_amount}\s*(?:AZN|₼|manat)\b",
                description,
                re.IGNORECASE,
            ):
                unit = "gün"
            elif re.search(
                rf"\baylıq\s+{rendered_amount}\s*(?:AZN|₼|manat)\b",
                description,
                re.IGNORECASE,
            ):
                unit = "ay"

        breadcrumb_labels = [
            clean_text(anchor.get_text(" ", strip=True))
            for anchor in soup.select("article p a[href]")
        ]
        breadcrumb_labels = [value for value in breadcrumb_labels if value]
        subcategory = breadcrumb_labels[-1] if breadcrumb_labels else category

        image_candidates: list[str] = []
        og_image = soup.select_one("meta[property='og:image']")
        if og_image and og_image.get("content"):
            image_candidates.append(og_image["content"])
        for image in soup.select(
            "[itemprop='image'], .elan_photos img, .gallery img, .item-gallery img, "
            ".photosopen img, article img"
        )[:20]:
            source = image.get("content") or image.get("data-src") or image.get("src")
            if source:
                image_candidates.append(source)
        image_urls = [
            normalized
            for candidate in image_candidates
            if (normalized := _safe_image(self.base_url, candidate))
        ]

        verified_at = datetime.now(timezone.utc).isoformat()
        item = CatalogItem(
            id=make_id(self.source_id, url, name),
            kind=kind,
            name=name,
            slug=make_slug(name, self.source_id),
            source_id=self.source_id,
            source_label=self.source.get("name", self.source_id),
            source_url=url,
            category=category,
            subcategory=subcategory,
            provider=provider,
            city=city,
            price=amount,
            currency="AZN",
            price_text=price_text(amount),
            price_status="confirmed" if amount is not None else "request",
            unit=unit,
            description=description,
            image_urls=list(dict.fromkeys(image_urls))[:8],
            verified_at=verified_at,
        )
        item.content_hash = item_content_hash(item.model_dump(exclude={"content_hash", "fetched_at"}))
        return item
