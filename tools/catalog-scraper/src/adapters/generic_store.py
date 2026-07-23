from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Iterable
from urllib.parse import urlparse
from xml.etree import ElementTree

from bs4 import BeautifulSoup

from src.adapters.base import BaseAdapter
from src.core.models import CatalogItem, CrawlError, CrawlResult
from src.core.utils import (
    clean_text,
    item_content_hash,
    make_id,
    make_slug,
    normalize_url,
    normalize_key,
    parse_number,
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


def _type_matches(value: Any, expected: str) -> bool:
    values = value if isinstance(value, list) else [value]
    return any(str(item).casefold() == expected.casefold() for item in values)


def _https_media_url(base_url: str, value: str | None) -> str | None:
    if not value:
        return None
    url = normalize_url(base_url, value)
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        return None
    return url if url_matches_source(url, base_url) else None


class GenericStoreAdapter(BaseAdapter):
    listing_paths: list[str] = ["/"]
    product_link_tokens: tuple[str, ...] = ("/product", "/catalog/")
    category_name: str = "Tikinti materialları"

    def _error(self, error: Exception, url: str | None = None) -> CrawlError:
        return CrawlError(
            source_id=self.source_id,
            url=url,
            error_type=type(error).__name__,
            message=str(error)[:1_000],
        )

    async def _sitemap_urls(self, sitemap_url: str, depth: int = 0) -> list[tuple[str, bool, float]]:
        if depth > 2:
            return []
        xml = await self.http.get_text(sitemap_url)
        root = ElementTree.fromstring(xml)
        namespace = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
        if root.tag.endswith("sitemapindex"):
            children = [
                clean_text(node.text)
                for node in root.findall(".//sm:sitemap/sm:loc", namespace)
                if clean_text(node.text)
            ]
            results: list[tuple[str, bool, float]] = []
            for child in children[:50]:
                if url_matches_source(child, self.base_url):
                    results.extend(await self._sitemap_urls(child, depth + 1))
            return results

        entries: list[tuple[str, bool, float]] = []
        for node in root.findall(".//sm:url", namespace):
            loc = clean_text(node.findtext("sm:loc", default="", namespaces=namespace))
            if not loc:
                continue
            image_node = next((child for child in node.iter() if child.tag.endswith("loc") and "image" in child.tag), None)
            priority = parse_number(node.findtext("sm:priority", default="", namespaces=namespace)) or 0
            entries.append((loc, image_node is not None, priority))
        return entries

    async def discover_product_urls(self) -> list[str]:
        patterns = self.source.get("allowed_path_patterns") or []
        candidates: list[str] = []
        for sitemap in self.source.get("sitemaps") or []:
            entries = await self._sitemap_urls(normalize_url(self.base_url, sitemap))
            require_image = bool(self.source.get("sitemap_require_image"))
            min_priority = float(self.source.get("sitemap_min_priority") or 0)
            for url, has_image, priority in entries:
                if require_image and not has_image:
                    continue
                if priority < min_priority:
                    continue
                if url_matches_source(url, self.base_url, patterns):
                    candidates.append(normalize_url(self.base_url, url))

        if not candidates:
            for path in self.listing_paths:
                html = await self.http.get_text(normalize_url(self.base_url, path))
                soup = BeautifulSoup(html, "lxml")
                for anchor in soup.select("a[href]"):
                    url = normalize_url(self.base_url, anchor.get("href", ""))
                    if (
                        any(token in url for token in self.product_link_tokens)
                        and url_matches_source(url, self.base_url, patterns)
                    ):
                        candidates.append(url)
        return list(dict.fromkeys(candidates))

    async def crawl(self) -> CrawlResult:
        result = CrawlResult(source_id=self.source_id)
        try:
            product_urls = await self.discover_product_urls()
        except Exception as exc:
            result.errors.append(self._error(exc, self.base_url))
            return result

        result.discovered = len(product_urls)
        max_items = max(0, int(self.source.get("max_items", 500)))
        for url in product_urls[:max_items]:
            try:
                item = await self.parse_product(url)
                if item:
                    result.items.append(item)
                else:
                    result.skipped += 1
            except Exception as exc:
                result.errors.append(self._error(exc, url))
        result.skipped += max(0, len(product_urls) - max_items)
        return result

    def _json_documents(self, soup: BeautifulSoup) -> list[dict]:
        documents: list[dict] = []
        for script in soup.select("script[type='application/ld+json']"):
            try:
                data = json.loads(script.string or script.get_text())
            except (TypeError, json.JSONDecodeError):
                continue
            documents.extend(_walk_json(data))
        return documents

    async def parse_product(self, url: str) -> CatalogItem | None:
        html = await self.http.get_text(url)
        soup = BeautifulSoup(html, "lxml")
        documents = self._json_documents(soup)
        product = next((item for item in documents if _type_matches(item.get("@type"), "Product")), None)

        h1 = soup.select_one("h1")
        name = clean_text(str(product.get("name"))) if product and product.get("name") else None
        name = name or clean_text(h1.get_text(" ", strip=True) if h1 else None)
        if not name:
            return None

        offers = product.get("offers") if product else None
        if isinstance(offers, list):
            offers = next((item for item in offers if isinstance(item, dict)), None)
        if not isinstance(offers, dict):
            offers = next((item for item in documents if _type_matches(item.get("@type"), "Offer")), None)

        currency = str((offers or {}).get("priceCurrency") or "AZN").upper()
        structured_price = parse_price((offers or {}).get("price"), require_currency=False)
        if currency != "AZN":
            structured_price = None

        page_price = None
        price_node = (
            soup.select_one("[itemprop='price']")
            or soup.select_one("[data-price]")
            or soup.select_one(".product-price")
            or soup.select_one(".price")
        )
        if price_node:
            price_currency = soup.select_one("[itemprop='priceCurrency']")
            currency_value = (
                price_currency.get("content")
                if price_currency and price_currency.has_attr("content")
                else price_currency.get_text(" ", strip=True) if price_currency else ""
            )
            price_value = price_node.get("content") or price_node.get("data-price")
            if price_value and str(currency_value or "AZN").upper() == "AZN":
                page_price = parse_price(price_value, require_currency=False)
            if page_price is None:
                page_price = parse_price(price_node.parent.get_text(" ", strip=True), require_currency=True)

        amount = structured_price if structured_price is not None else page_price
        price_status = "confirmed" if amount is not None else "request"

        brand_value = product.get("brand") if product else None
        if isinstance(brand_value, dict):
            brand_value = brand_value.get("name")
        brand = clean_text(str(brand_value)) if brand_value else None
        if normalize_key(brand) in {"mystore", "store", "shop", "magaza", "unknown", "na"}:
            brand = None
        if not brand:
            brand_node = soup.select_one("[itemprop='brand'], .product-brand, .brand")
            brand = clean_text(brand_node.get_text(" ", strip=True) if brand_node else None)

        sku = clean_text(str(product.get("sku"))) if product and product.get("sku") else None
        if not sku:
            sku_node = soup.select_one("[itemprop='sku'], [data-sku]")
            sku = clean_text(
                (sku_node.get("content") or sku_node.get("data-sku") or sku_node.get_text(" ", strip=True))
                if sku_node
                else None
            )

        breadcrumbs = [
            clean_text(item.get_text(" ", strip=True))
            for item in soup.select(".breadcrumb a, .breadcrumbs a, [aria-label='breadcrumb'] a")
        ]
        breadcrumbs = [item for item in breadcrumbs if item]
        category = breadcrumbs[-2] if len(breadcrumbs) > 1 else self.category_name
        subcategory = breadcrumbs[-1] if breadcrumbs else None

        description = clean_text(str(product.get("description"))) if product and product.get("description") else None
        if not description:
            description_node = soup.select_one("[itemprop='description'], .product-description, .description")
            description = clean_text(description_node.get_text(" ", strip=True) if description_node else None)

        image_candidates: list[str] = []
        product_images = product.get("image") if product else None
        if isinstance(product_images, str):
            image_candidates.append(product_images)
        elif isinstance(product_images, list):
            image_candidates.extend(str(item.get("url") if isinstance(item, dict) else item) for item in product_images)
        elif isinstance(product_images, dict) and product_images.get("url"):
            image_candidates.append(str(product_images["url"]))
        og_image = soup.select_one("meta[property='og:image']")
        if og_image and og_image.get("content"):
            image_candidates.append(og_image["content"])
        for image in soup.select("[itemprop='image'], .product-image img, .product-images img, .gallery img"):
            source = image.get("content") or image.get("data-src") or image.get("src")
            if source:
                image_candidates.append(source)
        image_urls = [
            normalized
            for candidate in image_candidates
            if (normalized := _https_media_url(self.base_url, candidate))
        ]

        specifications: dict[str, str] = {}
        for row in soup.select(".specifications tr, .product-specifications tr, table tr")[:60]:
            cells = [clean_text(cell.get_text(" ", strip=True)) for cell in row.select("th, td")]
            cells = [cell for cell in cells if cell]
            if len(cells) >= 2:
                specifications[cells[0][:120]] = cells[1][:500]
        for entry in soup.select(".specifications dt, .product-specifications dt")[:60]:
            value = entry.find_next_sibling("dd")
            key = clean_text(entry.get_text(" ", strip=True))
            val = clean_text(value.get_text(" ", strip=True) if value else None)
            if key and val:
                specifications[key[:120]] = val[:500]
        specification_brand = next(
            (
                value
                for key, value in specifications.items()
                if normalize_key(key) in {"brend", "brand", "marka"}
            ),
            None,
        )
        if specification_brand and (
            not brand
            or normalize_key(brand) in {"mystore", "store", "shop", "magaza", "unknown", "na"}
        ):
            brand = specification_brand

        availability = str((offers or {}).get("availability") or "")
        stock_status = (
            "Stokda var"
            if "InStock" in availability
            else "Stokda yoxdur"
            if "OutOfStock" in availability
            else "Stok sorğu ilə"
        )
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
            sku=sku,
            price=amount,
            currency="AZN",
            price_text=price_text(amount),
            price_status=price_status,
            stock_status=stock_status,
            description=description,
            image_urls=list(dict.fromkeys(image_urls))[:8],
            specifications=specifications,
            verified_at=verified_at,
        )
        item.content_hash = item_content_hash(item.model_dump(exclude={"content_hash", "fetched_at"}))
        return item
