from __future__ import annotations

import csv
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from openpyxl import Workbook

from src.core.models import CatalogItem
from src.core.utils import normalize_key


def _quality(item: CatalogItem) -> int:
    return (
        (300 if item.price_status == "confirmed" and item.price is not None else 0)
        + (180 if item.image_urls else 0)
        + (90 if item.sku else 0)
        + (50 if item.brand else 0)
        + (40 if item.description else 0)
        + min(len(item.specifications), 20) * 4
    )


def _dedupe_key(item: CatalogItem) -> tuple[str, ...]:
    if item.sku:
        return (
            item.kind,
            "sku",
            normalize_key(item.brand),
            normalize_key(item.sku),
        )
    return (
        item.kind,
        "name",
        normalize_key(item.brand),
        normalize_key(item.name),
    )


def deduplicate(items: list[CatalogItem]) -> tuple[list[CatalogItem], list[dict[str, str]]]:
    by_source_url: dict[str, CatalogItem] = {}
    duplicates: list[dict[str, str]] = []
    for item in items:
        key = item.source_url.casefold().rstrip("/")
        current = by_source_url.get(key)
        if current is None or _quality(item) > _quality(current):
            if current:
                duplicates.append({"kept": item.id, "discarded": current.id, "reason": "source_url"})
            by_source_url[key] = item
        else:
            duplicates.append({"kept": current.id, "discarded": item.id, "reason": "source_url"})

    selected: dict[tuple[str, ...], CatalogItem] = {}
    for item in by_source_url.values():
        key = _dedupe_key(item)
        current = selected.get(key)
        if current is None or _quality(item) > _quality(current):
            if current:
                duplicates.append({"kept": item.id, "discarded": current.id, "reason": key[1]})
            selected[key] = item
        else:
            duplicates.append({"kept": current.id, "discarded": item.id, "reason": key[1]})
    clean = sorted(selected.values(), key=lambda item: (item.kind, item.name.casefold(), item.source_id))
    return clean, duplicates


def _flat_row(item: CatalogItem) -> dict[str, Any]:
    row = item.model_dump()
    row["image_urls"] = " | ".join(row["image_urls"])
    row["local_images"] = " | ".join(row["local_images"])
    row["specifications"] = json.dumps(row["specifications"], ensure_ascii=False, sort_keys=True)
    return row


def _write_csv(rows: list[dict[str, Any]], path: Path) -> None:
    fieldnames = list(CatalogItem.model_fields)
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def _write_xlsx(rows: list[dict[str, Any]], path: Path) -> None:
    workbook = Workbook(write_only=True)
    worksheet = workbook.create_sheet("ConstEra kataloq")
    fieldnames = list(CatalogItem.model_fields)
    worksheet.append(fieldnames)
    for row in rows:
        worksheet.append([row.get(field) for field in fieldnames])
    workbook.save(path)


def export_all(items: list[CatalogItem], output_dir: Path) -> dict[str, Any]:
    output_dir.mkdir(parents=True, exist_ok=True)
    clean, duplicates = deduplicate(items)
    generated_at = datetime.now(timezone.utc).isoformat()

    payload = {
        "schema_version": "4.0",
        "catalog_name": "ConstEra Master Catalog",
        "publication_status": "review_required",
        "generated_at": generated_at,
        "item_count": len(clean),
        "items": [item.model_dump() for item in clean],
    }
    (output_dir / "constera-master-catalog.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    rows = [_flat_row(item) for item in clean]
    _write_csv(rows, output_dir / "constera-master-catalog.csv")
    _write_xlsx(rows, output_dir / "constera-master-catalog.xlsx")

    counts: dict[str, int] = {}
    for kind in ["product", "service", "rental", "package"]:
        subset = [item.model_dump() for item in clean if item.kind == kind]
        counts[kind] = len(subset)
        (output_dir / f"{kind}s.json").write_text(
            json.dumps(subset, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    manifest = {
        "schema_version": "4.0",
        "generated_at": generated_at,
        "publication_status": "review_required",
        "input_count": len(items),
        "item_count": len(clean),
        "duplicate_count": len(duplicates),
        "counts": counts,
        "confirmed_price_count": sum(item.price_status == "confirmed" for item in clean),
        "request_price_count": sum(item.price_status == "request" for item in clean),
        "image_count": sum(bool(item.image_urls) for item in clean),
        "duplicates": duplicates[:500],
    }
    (output_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return manifest
