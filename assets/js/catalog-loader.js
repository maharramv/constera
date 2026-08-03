(() => {
  const emptyCatalog = {
    categories: [],
    serviceCategories: [],
    packageCategories: [],
    rentalCategories: [],
    brands: [],
    suppliers: [],
    products: [],
    services: [],
    packages: [],
    rentals: []
  };
  const loaderScript = document.currentScript;
  const scriptUrl = new URL(loaderScript?.src || "assets/js/catalog-loader.js", window.location.href);
  const revision = scriptUrl.searchParams.get("v");
  const requestedDataFile = String(loaderScript?.dataset.catalog || "marketplace.data").trim();
  const dataFile = /^[a-z0-9-]+\.data$/i.test(requestedDataFile)
    ? requestedDataFile
    : "marketplace.data";
  const dataUrl = new URL(`../data/${dataFile}`, scriptUrl);
  if (revision) dataUrl.searchParams.set("v", revision);

  const publish = (catalog, error = null) => {
    window.CONSTERA_MARKETPLACE = catalog;
    window.dispatchEvent(new CustomEvent("constera:catalog-ready", { detail: { catalog, error } }));
    return catalog;
  };

  window.ConstEraCatalogReady = fetch(dataUrl, { credentials: "same-origin" })
    .then((response) => {
      if (!response.ok) throw new Error(`Kataloq məlumatı yüklənmədi: HTTP ${response.status}`);
      if (typeof DecompressionStream !== "function") {
        throw new Error("Bu brauzer sıxılmış kataloq məlumatını aça bilmir.");
      }
      const stream = response.body.pipeThrough(new DecompressionStream("gzip"));
      return new Response(stream).json();
    })
    .then((catalog) => publish(catalog))
    .catch((error) => {
      console.error(error);
      return publish(emptyCatalog, error);
    });
})();
