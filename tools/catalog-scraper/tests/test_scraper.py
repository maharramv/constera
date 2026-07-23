from __future__ import annotations

import json
import unittest

import httpx

from src.adapters.elem import ElemAdapter
from src.adapters.generic_store import GenericStoreAdapter
from src.adapters.insaat import InsaatAdapter
from src.core.http import HttpClient, UnsafeUrlError
from src.core.utils import parse_price
from src.exporters.export import deduplicate


class FakeHttp:
    def __init__(self, pages: dict[str, str]):
        self.pages = pages

    async def get_text(self, url: str) -> str:
        return self.pages[url]


class PriceParserTests(unittest.TestCase):
    def test_requires_currency_for_visible_text(self):
        self.assertIsNone(parse_price("Telefon: 050 123 45 67, tarix 23.07.2026"))
        self.assertEqual(parse_price("Qiymət 92,90 AZN"), 92.9)
        self.assertEqual(parse_price("14.10 ₼"), 14.1)

    def test_structured_price_can_be_currency_free(self):
        self.assertEqual(parse_price("1,250.50", require_currency=False), 1250.5)

    def test_http_client_blocks_unknown_hosts(self):
        client = HttpClient(user_agent="test", allowed_hosts={"omid.az"})
        with self.assertRaises(UnsafeUrlError):
            client._validate_url("https://example.com/products/fake")

    def test_http_client_accepts_www_alias_for_allowlisted_host(self):
        client = HttpClient(user_agent="test", allowed_hosts={"elem.az"})
        host, _ = client._validate_url("https://www.elem.az/catalog/product/demo")
        self.assertEqual(host, "www.elem.az")


class AdapterTests(unittest.IsolatedAsyncioTestCase):
    async def test_redirect_cannot_leave_allowlisted_host(self):
        requested: list[str] = []

        def handler(request: httpx.Request) -> httpx.Response:
            requested.append(str(request.url))
            return httpx.Response(
                302,
                headers={"location": "https://example.com/steal"},
                request=request,
            )

        client = HttpClient(
            user_agent="test",
            allowed_hosts={"elem.az"},
            respect_robots=False,
        )
        await client.client.aclose()
        client.client = httpx.AsyncClient(
            transport=httpx.MockTransport(handler),
            follow_redirects=False,
        )
        with self.assertRaises(UnsafeUrlError):
            await client.get_text("https://elem.az/catalog/product/demo")
        self.assertEqual(requested, ["https://elem.az/catalog/product/demo"])
        await client.close()

    async def test_product_json_ld_is_parsed_as_review_record(self):
        url = "https://omid.az/products/alfa"
        html = """
        <html><head>
          <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "Product",
            "name": "ALFA boya 15 L",
            "sku": "106.5000.72",
            "brand": {"@type": "Brand", "name": "Alfa"},
            "image": ["https://omid.az/cdn/shop/files/alfa.webp"],
            "offers": {
              "@type": "Offer",
              "price": "92.90",
              "priceCurrency": "AZN",
              "availability": "https://schema.org/InStock"
            }
          }
          </script>
        </head><body><h1>ALFA boya 15 L</h1></body></html>
        """
        adapter = GenericStoreAdapter(
            {"id": "omid", "name": "OMID", "base_url": "https://omid.az"},
            FakeHttp({url: html}),
        )
        item = await adapter.parse_product(url)
        self.assertIsNotNone(item)
        self.assertEqual(item.price, 92.9)
        self.assertEqual(item.price_status, "confirmed")
        self.assertEqual(item.status, "pending")
        self.assertEqual(item.sku, "106.5000.72")
        self.assertEqual(item.image_urls, ["https://omid.az/cdn/shop/files/alfa.webp"])

    async def test_generic_product_prefers_real_specification_brand(self):
        url = "https://omid.az/products/spiral"
        html = """
        <html><head>
          <script type="application/ld+json">
          {
            "@type": "Product",
            "name": "Spiral boru",
            "brand": {"name": "My Store"},
            "offers": {"price": "12.80", "priceCurrency": "AZN"}
          }
          </script>
        </head><body>
          <h1>Spiral boru</h1>
          <table class="specifications"><tr><td>Brend</td><td>HILL FAN</td></tr></table>
        </body></html>
        """
        adapter = GenericStoreAdapter(
            {"id": "omid", "name": "OMID", "base_url": "https://omid.az"},
            FakeHttp({url: html}),
        )
        item = await adapter.parse_product(url)
        self.assertEqual(item.brand, "HILL FAN")

    async def test_elem_next_data_product_is_parsed(self):
        url = "https://elem.az/az/catalog/product/material/seben"
        state = {
            "props": {
                "pageProps": {
                    "initialState": {
                        "product": {
                            "product": {
                                "amount": 999,
                                "barcode": "2000000014111",
                                "description": {
                                    "title": "Şeben",
                                    "description": "Quru tikinti qarışığı",
                                    "attributes": [
                                        {"key": "Brend", "value": "DİGƏR"},
                                        {"key": "İstehsalçı ölkə", "value": "Azərbaycan"},
                                    ],
                                },
                                "preview": "Goods/2000000014111/1.jpg",
                                "price": 28,
                                "sellStatus": "available",
                                "unit": "шт",
                            }
                        }
                    }
                }
            }
        }
        html = f"""
        <html><body>
          <a href="/">Ev</a>
          <a href="/catalog/tikinti-materiallari">Tikinti materialları</a>
          <a href="/catalog/tikinti-materiallari/quru-qarisiqlar">Quru qarışıqlar</a>
          <h2>Şeben</h2>
          <script id="__NEXT_DATA__" type="application/json">{json.dumps(state)}</script>
        </body></html>
        """
        adapter = ElemAdapter(
            {"id": "elem", "name": "ELEM", "base_url": "https://elem.az"},
            FakeHttp({url: html}),
        )
        item = await adapter.parse_product(url)
        self.assertEqual(item.price, 28)
        self.assertEqual(item.sku, "2000000014111")
        self.assertEqual(item.brand, "DİGƏR")
        self.assertEqual(item.unit, "ədəd")
        self.assertEqual(
            item.image_urls,
            ["https://elem.az/web/1cweb-pictures/Goods/2000000014111/1.jpg"],
        )

    async def test_insaat_does_not_treat_phone_as_price(self):
        url = "https://insaat.az/xidmet-1.html"
        html = """
        <html><body>
          <h1>Kamera quraşdırılması</h1>
          <article><p>Telefon: 050 123 45 67</p><p>23.07.2026</p></article>
        </body></html>
        """
        adapter = InsaatAdapter(
            {"id": "insaat", "name": "INSAAT.AZ", "base_url": "https://insaat.az"},
            FakeHttp({url: html}),
        )
        item = await adapter.parse_listing(url, "service", "Mühəndis sistemləri")
        self.assertIsNone(item.price)
        self.assertEqual(item.price_status, "request")

    async def test_insaat_accepts_explicit_azn_price(self):
        url = "https://insaat.az/xidmet-2.html"
        html = """
        <html><body>
          <h1>Kamera quraşdırılması</h1>
          <div class="price">20 AZN</div>
          <article><p>Telefon: 050 123 45 67</p></article>
        </body></html>
        """
        adapter = InsaatAdapter(
            {"id": "insaat", "name": "INSAAT.AZ", "base_url": "https://insaat.az"},
            FakeHttp({url: html}),
        )
        item = await adapter.parse_listing(url, "service", "Mühəndis sistemləri")
        self.assertEqual(item.price, 20)
        self.assertEqual(item.price_status, "confirmed")

    async def test_insaat_maps_provider_city_and_daily_unit(self):
        url = "https://insaat.az/bobcat-1.html"
        html = """
        <html><body>
          <article>
            <h1>Bobcat icarəsi</h1>
            <p><a href="/texnika-icaresi">Texnika icarəsi</a><br>
               <a href="/tikinti-texnikasi-icaresi">Tikinti Texnikası</a></p>
            <span class="pricecolor">220 AZN</span>
            <div class="infocontact">Coşqun<br>Bakı şəhəri<br>0553594XXX</div>
            <p class="infop100 fullteshow">Günlük 220 AZN, aylıq qiymət razılaşma ilə.</p>
          </article>
        </body></html>
        """
        adapter = InsaatAdapter(
            {"id": "insaat", "name": "INSAAT.AZ", "base_url": "https://insaat.az"},
            FakeHttp({url: html}),
        )
        item = await adapter.parse_listing(url, "rental", "Tikinti texnikası icarəsi")
        self.assertEqual(item.provider, "Coşqun")
        self.assertEqual(item.city, "Bakı şəhəri")
        self.assertEqual(item.unit, "gün")
        self.assertEqual(item.subcategory, "Tikinti Texnikası")


class DeduplicationTests(unittest.TestCase):
    def test_higher_quality_duplicate_wins(self):
        from src.core.models import CatalogItem

        base = {
            "kind": "product",
            "name": "Demo",
            "slug": "demo",
            "category": "Material",
            "brand": "Demo",
            "sku": "SKU-1",
        }
        request = CatalogItem(
            **base,
            id="one",
            source_id="omid",
            source_label="OMID",
            source_url="https://omid.az/products/one",
        )
        confirmed = CatalogItem(
            **base,
            id="two",
            source_id="tvim",
            source_label="TVIM",
            source_url="https://tvim.az/az/two",
            price=10,
            price_status="confirmed",
            price_text="10,00 AZN",
        )
        items, duplicates = deduplicate([request, confirmed])
        self.assertEqual([item.id for item in items], ["two"])
        self.assertEqual(len(duplicates), 1)


if __name__ == "__main__":
    unittest.main()
