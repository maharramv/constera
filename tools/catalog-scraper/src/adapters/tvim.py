from src.adapters.generic_store import GenericStoreAdapter

class TvimAdapter(GenericStoreAdapter):
    listing_paths = ["/az/tikinti-materiallari", "/az"]
    product_link_tokens = ("/az/",)
    category_name = "Tikinti materialları"
