from __future__ import annotations

import argparse
import asyncio
import json
import os
from pathlib import Path
from urllib.parse import urlparse

from src.adapters.elem import ElemAdapter
from src.adapters.insaat import InsaatAdapter
from src.adapters.omid import OmidAdapter
from src.adapters.tvim import TvimAdapter
from src.core.http import HttpClient
from src.core.utils import canonical_host
from src.exporters.export import export_all

ADAPTERS = {
    "elem": ElemAdapter,
    "tvim": TvimAdapter,
    "omid": OmidAdapter,
    "insaat": InsaatAdapter,
}
PROJECT_ROOT = Path(__file__).resolve().parents[1]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="ConstEra review kataloqu toplayıcısı")
    parser.add_argument("--config", default="config/sources.json")
    parser.add_argument("--source", action="append", choices=sorted(ADAPTERS))
    parser.add_argument("--max-items", type=int)
    parser.add_argument("--output-dir", default="data/output")
    parser.add_argument("--validate-config", action="store_true")
    return parser.parse_args()


def load_and_validate_config(path: Path) -> dict:
    config = json.loads(path.read_text(encoding="utf-8"))
    if not config.get("respect_robots_txt"):
        raise ValueError("respect_robots_txt production scraper üçün true olmalıdır")
    if float(config.get("request_delay_seconds", 0)) < 1:
        raise ValueError("request_delay_seconds ən azı 1 saniyə olmalıdır")

    sources = config.get("sources")
    if not isinstance(sources, list) or not sources:
        raise ValueError("Ən azı bir mənbə konfiqurasiyası tələb olunur")
    seen: set[str] = set()
    for source in sources:
        source_id = str(source.get("id") or "")
        if not source_id or source_id in seen:
            raise ValueError(f"Mənbə ID-si boş və ya təkrardır: {source_id}")
        seen.add(source_id)
        if source.get("adapter") not in ADAPTERS:
            raise ValueError(f"Naməlum adapter: {source.get('adapter')}")
        parsed = urlparse(str(source.get("base_url") or ""))
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError(f"Yalnız təhlükəsiz HTTPS mənbəsi qəbul olunur: {source.get('base_url')}")
        max_items = int(source.get("max_items", 0))
        if max_items < 1 or max_items > 5_000:
            raise ValueError(f"{source_id} üçün max_items 1-5000 aralığında olmalıdır")
    return config


async def run(args: argparse.Namespace) -> dict:
    config_path = (PROJECT_ROOT / args.config).resolve()
    config = load_and_validate_config(config_path)
    selected = set(args.source or [])
    sources = [
        dict(source)
        for source in config["sources"]
        if source.get("enabled", True) and (not selected or source["id"] in selected)
    ]
    if not sources:
        raise ValueError("Seçilmiş aktiv mənbə tapılmadı")
    if args.max_items is not None:
        if args.max_items < 1 or args.max_items > 5_000:
            raise ValueError("--max-items 1-5000 aralığında olmalıdır")
        for source in sources:
            source["max_items"] = min(int(source.get("max_items", args.max_items)), args.max_items)

    allowed_hosts = {
        canonical_host(urlparse(str(source["base_url"])).hostname)
        for source in sources
        if urlparse(str(source["base_url"])).hostname
    }
    client = HttpClient(
        user_agent=config.get("user_agent", "ConstEraCatalogBot/1.1 (+https://constera.az)"),
        allowed_hosts=allowed_hosts,
        delay=float(config.get("request_delay_seconds", 1.5)),
        timeout=float(config.get("request_timeout_seconds", 30)),
        max_response_bytes=int(config.get("max_response_bytes", 6_000_000)),
        respect_robots=True,
        fail_closed_on_robots_error=bool(config.get("fail_closed_on_robots_error", True)),
    )

    all_items = []
    all_errors = []
    source_summaries = []
    try:
        for source in sources:
            adapter = ADAPTERS[source["adapter"]](source, client)
            print(f"[BAŞLADI] {source['name']}")
            result = await adapter.crawl()
            all_items.extend(result.items)
            all_errors.extend(error.model_dump() for error in result.errors)
            source_summaries.append(
                {
                    "source_id": source["id"],
                    "discovered": result.discovered,
                    "collected": len(result.items),
                    "skipped": result.skipped,
                    "errors": len(result.errors),
                }
            )
            print(
                f"[BİTDİ] {source['name']}: {len(result.items)} qeyd, "
                f"{result.skipped} buraxıldı, {len(result.errors)} xəta"
            )
    finally:
        await client.close()

    output_dir = (PROJECT_ROOT / args.output_dir).resolve()
    manifest = export_all(all_items, output_dir)
    logs_dir = PROJECT_ROOT / "logs"
    logs_dir.mkdir(parents=True, exist_ok=True)
    (logs_dir / "errors.json").write_text(
        json.dumps(all_errors, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    run_summary = {
        **manifest,
        "sources": source_summaries,
        "error_count": len(all_errors),
    }
    (logs_dir / "last-run.json").write_text(
        json.dumps(run_summary, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"Review kataloqu yaradıldı: {manifest['item_count']} qeyd")
    return run_summary


def main() -> None:
    os.chdir(PROJECT_ROOT)
    args = parse_args()
    config = load_and_validate_config((PROJECT_ROOT / args.config).resolve())
    if args.validate_config:
        active = [source["id"] for source in config["sources"] if source.get("enabled", True)]
        print(f"Konfiqurasiya düzgündür. Aktiv mənbələr: {', '.join(active)}")
        return
    asyncio.run(run(args))


if __name__ == "__main__":
    main()
