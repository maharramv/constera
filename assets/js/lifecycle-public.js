(function initPublicLifecycle() {
  if (document.body?.dataset.page !== "product-detail" || !window.ConstEraAPI) return;
  const productId = new URLSearchParams(window.location.search).get("product");
  const detailRoot = document.querySelector("[data-product-detail]");
  if (!productId || !detailRoot) return;

  const escapeHtml = (value) => String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  const safeLink = (url, label) => {
    if (!/^https:\/\//i.test(String(url || ""))) return "";
    return `<a class="button button-outline" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
  };
  const certificateText = (value) => Array.isArray(value)
    ? value.map((item) => item?.label || item?.name || item).filter(Boolean).join(", ")
    : "";

  window.ConstEraAPI.publicProductPassport(productId)
    .then((result) => {
      const passport = result.data;
      if (!passport) return;
      const environment = passport.environmentalData || {};
      const section = document.createElement("section");
      section.className = "section product-passport-section";
      section.dataset.publicProductPassport = "";
      section.innerHTML = `
        <div class="market-section-heading">
          <div><p class="eyebrow">İstehsalçı sənədləri ilə yoxlanıb</p><h2>Rəqəmsal məhsul pasportu</h2></div>
          <span class="data-badge" data-state="published">${escapeHtml(passport.completeness?.score || 0)}% tamlıq</span>
        </div>
        <div class="product-passport-layout">
          <div class="product-passport-code">
            <span>Pasport kodu</span><strong>${escapeHtml(passport.passportCode)}</strong>
            <small>Son yenilənmə: ${escapeHtml(new Intl.DateTimeFormat("az-AZ", { dateStyle: "medium" }).format(new Date(passport.updatedAt)))}</small>
          </div>
          <dl class="product-passport-facts">
            <div><dt>İstehsalçı</dt><dd>${escapeHtml(passport.manufacturer)}</dd></div>
            <div><dt>Mənşə ölkəsi</dt><dd>${escapeHtml(passport.originCountry || "Göstərilməyib")}</dd></div>
            <div><dt>Model / GTIN</dt><dd>${escapeHtml([passport.modelCode, passport.gtin].filter(Boolean).join(" · ") || "Göstərilməyib")}</dd></div>
            <div><dt>Zəmanət</dt><dd>${escapeHtml(passport.warrantyMonths || 0)} ay</dd></div>
            <div><dt>Partiya izlənməsi</dt><dd>${passport.batchTracking ? "Tələb olunur" : "Tələb olunmur"}</dd></div>
            <div><dt>Sertifikatlar</dt><dd>${escapeHtml(certificateText(passport.certificateData) || "Göstərilməyib")}</dd></div>
            <div><dt>Karbon göstəricisi</dt><dd>${environment.carbonKgCo2e === null || environment.carbonKgCo2e === undefined ? "Göstərilməyib" : `${escapeHtml(environment.carbonKgCo2e)} kq CO₂e`}</dd></div>
            <div><dt>Təkrar emal</dt><dd>${environment.recycledPercent === null || environment.recycledPercent === undefined ? "Göstərilməyib" : `${escapeHtml(environment.recycledPercent)}%`}</dd></div>
          </dl>
        </div>
        <div class="product-passport-actions">
          ${safeLink(passport.declarationUrl, "Uyğunluq bəyannaməsi")}
          ${safeLink(passport.safetyUrl, "Təhlükəsizlik sənədi")}
          ${safeLink(passport.installationUrl, "Quraşdırma təlimatı")}
          ${safeLink(environment.epdUrl, "EPD sənədi")}
        </div>`;
      detailRoot.insertAdjacentElement("afterend", section);
    })
    .catch((error) => {
      console.warn("Məhsul pasportu yüklənmədi.");
    });
})();
