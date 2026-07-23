from __future__ import annotations
from abc import ABC, abstractmethod
from src.core.models import CrawlResult

class BaseAdapter(ABC):
    def __init__(self, source: dict, http_client):
        self.source = source
        self.http = http_client
        self.base_url = source["base_url"]
        self.source_id = source["id"]

    @abstractmethod
    async def crawl(self) -> CrawlResult:
        raise NotImplementedError
