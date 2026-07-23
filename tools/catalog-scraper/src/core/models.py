from __future__ import annotations
from datetime import datetime, timezone
from typing import Any, Literal
from pydantic import BaseModel, Field

ItemKind = Literal["product", "service", "rental", "package"]
ReviewStatus = Literal["pending", "approved", "rejected", "merged"]


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

class CatalogItem(BaseModel):
    id: str
    kind: ItemKind
    name: str
    slug: str
    source_id: str
    source_label: str
    source_url: str
    category: str | None = None
    subcategory: str | None = None
    brand: str | None = None
    sku: str | None = None
    provider: str | None = None
    city: str | None = None
    price: float | None = None
    price_min: float | None = None
    price_max: float | None = None
    currency: str = "AZN"
    price_text: str = "Qiymət sorğu əsasında"
    price_status: Literal["confirmed", "request"] = "request"
    unit: str | None = None
    stock_status: str | None = None
    stock_quantity: float | None = None
    description: str | None = None
    image_urls: list[str] = Field(default_factory=list)
    local_images: list[str] = Field(default_factory=list)
    specifications: dict[str, Any] = Field(default_factory=dict)
    status: ReviewStatus = "pending"
    verified_at: str | None = None
    fetched_at: str = Field(default_factory=utc_now_iso)
    content_hash: str | None = None


class CrawlError(BaseModel):
    source_id: str
    url: str | None = None
    error_type: str
    message: str
    created_at: str = Field(default_factory=utc_now_iso)

class CrawlResult(BaseModel):
    source_id: str
    items: list[CatalogItem] = Field(default_factory=list)
    discovered: int = 0
    skipped: int = 0
    errors: list[CrawlError] = Field(default_factory=list)
