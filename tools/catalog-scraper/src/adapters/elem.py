from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Iterable

from bs4 import BeautifulSoup

from src.adapters.generic_store import GenericStoreAdapter
from src.core.models import CatalogItem, CrawlResult
from src.core.utils import (
    clean_text,
    item_content_hash,
    make_id,
    make_slug,
    normalize_key,
    normalize_url,
    parse_price,
    price_text,
    url_matches_source,
)


def _walk(value: Any) -> Iterable[dict]:
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from _walk(child)
    elif isinstance(value, list):
        for child in value:
            yield from _walk(child)


class ElemAdapter(GenericStoreAdapter):
    category_name = "Tikinti materialları"

    @staticmethod
    def _next_data(soup: BeautifulSoup) -> dict:
        script = soup.select_one("#__NEXT_DATA__")
        if not script:
            return {}
        try:
            value = json.loads(script.string or script.get_text())
        except (TypeError, json.JSONDecodeError):
            return {}
        return value if isinstance(value, dict) else {}

    @staticmethod
    def _initial_state(data: dict) -> dict:
        state = (
            data.get("props", {})
            .get("pageProps", {})
            .get("initialState", {})
        )
        return state if isinstance(state, dict) else {}

    def _category_seed_urls(self, data: dict) -> list[str]:
        sections = (
            self._initial_state(data)
            .get("section", {})
            .get("headerMenuSections", {})
            .get("sections", [])
        )
        urls: list[str] = []
        for section in sections if isinstance(sections, list) else []:
            if not isinstance(section, dict):
                continue
            section_slug = clean_text(str(section.get("slug") or ""))
            if not section_slug:
                continue
            categories = section.get("categories")
            if isinstance(categories, list) and categories:
                for category in categories:
                    if not isinstance(category, dict):
                        continue
                    category_slug = clean_text(str(category.get("slug") or ""))
                    if category_slug:
                        urls.append(
                            normalize_url(
                                self.base_url,
                                f"/az/catalog/{section_slug}/{category_slug}",
                            )
                        )
            else:
                urls.append(
                    normalize_url(self.base_url, f"/az/catalog/{section_slug}")
                )
        return list(dict.fromkeys(urls))

    def _product_links(self, data: dict) -> list[str]:
        patterns = self.source.get("allowed_path_patterns") or []
        links: list[str] = []
        for node in _walk(data):
            for key in ("link", "href"):
                value = node.get(key)
                if not isinstance(value, str) or "/catalog/product/" not in value:
                    continue
                url = normalize_url(self.base_url, value)
                if url_matches_source(url, self.base_url, patterns):
                    links.append(url)
        return list(dict.fromkeys(links))

    async def discover_product_urls(self) -> list[str]:
        index_url = normalize_url(
            self.base_url,
            self.source.get("discovery_index") or "/az/catalog/brands",
        )
        index_html = await self.http.get_text(index_url)
        index_data = self._next_data(BeautifulSoup(index_html, "lxml"))
        candidates = self._product_links(index_data)
        page_limit = max(1, int(self.source.get("discovery_page_limit", 120)))
        max_items = max(1, int(self.source.get("max_items", 500)))
        discovery_target = min(5_000, max_items * 2)

        for category_url in self._category_seed_urls(index_data)[:page_limit]:
            if len(candidates) >= discovery_target:
                break
            try:
                html = await self.http.get_text(category_url)
            except Exception:
                continue
            data = self._next_data(BeautifulSoup(html, "lxml"))
            candidates.extend(self._product_links(data))
            candidates = list(dict.fromkeys(candidates))
        return candidates

    async def crawl(self) -> CrawlResult:
        result = CrawlResult(source_id=self.source_id)
        try:
            product_urls = await self.discover_product_urls()
        except Exception as exc:
            result.errors.append(self._error(exc, self.base_url))
            return result

        result.discovered = len(product_urls)
        max_items = max(1, int(self.source.get("max_items", 500)))
        seen_products: set[str] = set()
        processed = 0
        for url in product_urls:
            if len(result.items) >= max_items:
                break
            processed += 1
            try:
                item = await self.parse_product(url)
                if not item:
                    result.skipped += 1
                    continue
                identity = (
                    f"sku:{normalize_key(item.sku)}"
                    if item.sku
                    else f"url:{item.source_url}"
                )
                if identity in seen_products:
                    result.skipped += 1
                    continue
                seen_products.add(identity)
                result.items.append(item)
            except Exception as exc:
                result.errors.append(self._error(exc, url))
        result.skipped += max(0, len(product_urls) - processed)
        return result

    @staticmethod
    def _media_url(base_url: str, value: Any) -> str | None:
        if isinstance(value, dict):
            value = value.get("url") or value.get("src") or value.get("path")
        if not isinstance(value, str) or not value.strip():
            return None
        if value.startswith(("https://", "http://")):
            url = normalize_url(base_url, value)
        else:
            url = normalize_url(
                base_url,
                f"/web/1cweb-pictures/{value.lstrip('/')}",
            )
        return url if url_matches_source(url, base_url) else None

    async def parse_product(self, url: str) -> CatalogItem | None:
        html = await self.http.get_text(url)
        soup = BeautifulSoup(html, "lxml")
        state = self._initial_state(self._next_data(soup))
        product = state.get("product", {}).get("product")
        if not isinstance(product, dict):
            return None

        description_data = product.get("description")
        description_data = description_data if isinstance(description_data, dict) else {}
        h1 = soup.select_one("h1, h2")
        name = (
            clean_text(str(description_data.get("title") or ""))
            or clean_text(h1.get_text(" ", strip=True) if h1 else None)
        )
        if not name:
            return None

        specifications: dict[str, str] = {}
        attributes = description_data.get("attributes")
        for attribute in attributes if isinstance(attributes, list) else []:
            if not isinstance(attribute, dict):
                continue
            key = clean_text(str(attribute.get("key") or ""))
            value = clean_text(str(attribute.get("value") or ""))
            if key and value:
                specifications[key[:120]] = value[:500]

        brand = next(
            (
                value
                for key, value in specifications.items()
                if normalize_key(key) in {"brend", "brand", "marka"}
            ),
            None,
        )
        amount = parse_price(
            product.get("discountPrice")
            or product.get("price")
            or product.get("metaPrice"),
            require_currency=False,
        )
        category_links = [
            clean_text(anchor.get_text(" ", strip=True))
            for anchor in soup.select("a[href*='/catalog/']")
            if "/catalog/product/" not in (anchor.get("href") or "")
        ]
        category_links = [
            value for value in category_links
            if value and normalize_key(value) not in {"ev", "mehsulkataloqu"}
        ]
        category_node = product.get("category")
        fallback_subcategory = (
            clean_text(str(category_node.get("title") or ""))
            if isinstance(category_node, dict)
            else None
        )
        category = category_links[0] if category_links else self.category_name
        subcategory = category_links[-1] if category_links else fallback_subcategory

        media_candidates: list[Any] = [product.get("preview")]
        gallery = product.get("gallery")
        if isinstance(gallery, list):
            media_candidates.extend(gallery)
        image_urls = [
            image_url
            for candidate in media_candidates
            if (image_url := self._media_url(self.base_url, candidate))
        ]

        stock_value = str(product.get("sellStatus") or "").casefold()
        stock_status = (
            "Stokda var"
            if stock_value in {"available", "instock", "in_stock"}
            else "Stokda yoxdur"
            if stock_value in {"unavailable", "outofstock", "out_of_stock"}
            else "Stok sorğu ilə"
        )
        unit_map = {"шт": "ədəd", "кг": "kq", "л": "litr"}
        unit = clean_text(str(product.get("unit") or ""))
        unit = unit_map.get((unit or "").casefold(), unit)
        verified_at = datetime.now(timezone.utc).isoformat()
        item = CatalogItem(
            id=make_id(self.source_id, url, name),
            kind="product",
            name=name,
            slug=make_slug(name, self.source_id),
            source_id=self.source_id,
            source_label=self.source.get("name", self.source_id),
            source_url=url,
            category=category,
            subcategory=subcategory,
            brand=brand,
            sku=clean_text(str(product.get("barcode") or "")),
            price=amount,
            currency="AZN",
            price_text=price_text(amount),
            price_status="confirmed" if amount is not None else "request",
            unit=unit,
            stock_status=stock_status,
            stock_quantity=product.get("amount") if isinstance(product.get("amount"), int) else None,
            description=clean_text(str(description_data.get("description") or "")),
            image_urls=list(dict.fromkeys(image_urls))[:8],
            specifications=specifications,
            verified_at=verified_at,
        )
        item.content_hash = item_content_hash(
            item.model_dump(exclude={"content_hash", "fetched_at"})
        )
        return item
