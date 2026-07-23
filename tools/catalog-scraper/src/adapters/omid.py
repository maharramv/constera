from src.adapters.generic_store import GenericStoreAdapter

class OmidAdapter(GenericStoreAdapter):
    listing_paths = ["/collections/all", "/collections/insaat-materiallari-f764"]
    product_link_tokens = ("/products/",)
    category_name = "Tikinti materialları"
