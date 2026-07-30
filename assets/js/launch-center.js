(function initConsteraLaunchCenter() {
  if (document.body.dataset.page !== "admin" || !window.ConstEraAPI) return;

  const api = window.ConstEraAPI;
  const qs = (selector, root = document) => root.querySelector(selector);
  const escapeHtml = (value) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
  const formatMoney = (value, currency = "AZN") => value === null || value === undefined
    ? "Sorğu əsasında"
    : Number(value).toLocaleString("az-AZ", {
      style: "currency",
      currency,
      maximumFractionDigits: 2
    });
  const setStatus = (selector, message, type = "info") => {
    const element = qs(selector);
    if (!element) return;
    element.textContent = message;
    element.dataset.type = type;
  };
  const setBusy = (button, busy, label = "Gözlə...") => {
    if (!button) return;
    if (busy) {
      button.dataset.previousLabel = button.textContent;
      button.textContent = label;
    } else if (button.dataset.previousLabel) {
      button.textContent = button.dataset.previousLabel;
    }
    button.disabled = busy;
  };
  const openTab = (name) => {
    const button = qs(`[data-admin-tab="${CSS.escape(name)}"]`);
    button?.click();
    button?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  };

  const state = {
    launch: null,
    pilotResult: null,
    products: [],
    mediaRows: []
  };

  const readinessLabels = {
    ready: "İstehsala hazır",
    attention: "Tövsiyələr var",
    blocked: "Bloklayıcılar var"
  };
  const providerLabels = {
    payment: "Kart ödənişi",
    bankTransfer: "Bank köçürməsi",
    electronicInvoice: "Elektron qaimə",
    logistics: "Logistika provayderi",
    aiEstimate: "AI smeta",
    email: "E-poçt",
    whatsapp: "WhatsApp"
  };

  const renderLaunch = () => {
    const data = state.launch;
    if (!data) return;
    const readiness = data.readiness || {};
    const metrics = data.metrics || {};
    const score = qs("[data-launch-score]");
    if (score) {
      score.textContent = `${Number(readiness.score || 0)}%`;
      score.dataset.tone = readiness.status === "ready"
        ? "good"
        : readiness.status === "attention" ? "warning" : "critical";
    }
    setStatus(
      "[data-launch-status]",
      `${readinessLabels[readiness.status] || "Hazırlıq hesablandı"} · ${Number(readiness.blockerCount || 0)} bloklayıcı · ${Number(readiness.warningCount || 0)} tövsiyə`,
      readiness.status === "ready" ? "success" : readiness.status === "attention" ? "warning" : "error"
    );

    const kpis = qs("[data-launch-kpis]");
    if (kpis) kpis.innerHTML = [
      [metrics.eligibleProducts, "tam hazır məhsul"],
      [metrics.eligibleOffers, "aktual real təklif"],
      [metrics.onboardedSuppliers, "tam qoşulmuş təchizatçı"],
      [metrics.logisticsZones, "logistika zonası"],
      [metrics.orders, "real sifariş"],
      [metrics.paidOrders, "ödənilmiş sifariş"],
      [metrics.issuedInvoices, "verilmiş qaimə"],
      [metrics.shippedFulfillments, "göndərilmiş icra"]
    ].map(([value, label]) => `
      <article><strong>${Number(value || 0).toLocaleString("az-AZ")}</strong><span>${escapeHtml(label)}</span></article>
    `).join("");

    const sections = qs("[data-launch-sections]");
    if (sections) sections.innerHTML = (readiness.sections || []).map((section) => `
      <section class="launch-readiness-section">
        <header>
          <strong>${escapeHtml(section.label)}</strong>
          <span>${Number(section.ready || 0)} / ${Number(section.total || 0)}</span>
        </header>
        <div>
          ${(section.items || []).map((item) => `
            <button type="button" data-launch-target="${escapeHtml(item.target || "launch")}" class="${item.ready ? "is-ready" : item.required ? "is-blocked" : "is-warning"}">
              <span>
                <strong>${escapeHtml(item.label)}</strong>
                <small>${escapeHtml(item.detail)}</small>
              </span>
              <em>${item.ready ? "Hazır" : item.required ? "Bloklayır" : "Tövsiyə"}</em>
            </button>
          `).join("")}
        </div>
      </section>
    `).join("");

    const priorities = readiness.priorities || [];
    const priorityList = qs("[data-launch-priorities]");
    if (priorityList) priorityList.innerHTML = priorities.map((item, index) => `
      <article>
        <span>${index + 1}</span>
        <div><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.detail)}</small></div>
        <button class="table-action" type="button" data-launch-target="${escapeHtml(item.target || "launch")}">${escapeHtml(item.action || "Aç")}</button>
      </article>
    `).join("") || "<p>Bloklayıcı və açıq tövsiyə yoxdur.</p>";
    const priorityCount = qs("[data-launch-priority-count]");
    if (priorityCount) priorityCount.textContent = `${priorities.length} addım`;

    const operationCards = qs("[data-launch-operations]");
    if (operationCards) operationCards.innerHTML = [
      [metrics.pendingPriceReviews, "qiymət yoxlaması"],
      [metrics.pendingBankTransfers, "bank köçürməsi"],
      [metrics.readyFulfillments, "göndərişə hazır"],
      [metrics.issuedInvoices, "verilmiş qaimə"]
    ].map(([value, label]) => `
      <article><strong>${Number(value || 0).toLocaleString("az-AZ")}</strong><span>${escapeHtml(label)}</span></article>
    `).join("");

    const providers = qs("[data-launch-providers]");
    if (providers) providers.innerHTML = Object.entries(data.providers || {}).map(([key, ready]) => `
      <div><span>${escapeHtml(providerLabels[key] || key)}</span><strong class="${ready ? "is-ready" : "is-pending"}">${ready ? "Hazır" : "Qurulmayıb"}</strong></div>
    `).join("");

    const sales = data.sales || {};
    const dailySales = sales.daily || [];
    const orderCount = dailySales.reduce((sum, item) => sum + Number(item.orders || 0), 0);
    const gross = dailySales.reduce((sum, item) => sum + Number(item.gross || 0), 0);
    const paid = dailySales.reduce((sum, item) => sum + Number(item.paid || 0), 0);
    const salesKpis = qs("[data-launch-sales-kpis]");
    if (salesKpis) salesKpis.innerHTML = [
      [orderCount.toLocaleString("az-AZ"), "sifariş"],
      [formatMoney(gross), "dövriyyə"],
      [formatMoney(paid), "ödənilib"],
      [formatMoney(orderCount ? gross / orderCount : 0), "orta sifariş"]
    ].map(([value, label]) => `<article><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></article>`).join("");
    const chart = qs("[data-launch-sales-chart]");
    if (chart) {
      const recent = dailySales.slice(-14);
      const maximum = Math.max(1, ...recent.map((item) => Number(item.gross || 0)));
      chart.innerHTML = recent.map((item) => {
        const date = new Date(item.day);
        const label = Number.isFinite(date.getTime())
          ? new Intl.DateTimeFormat("az-AZ", { day: "2-digit", month: "short" }).format(date)
          : String(item.day || "");
        const height = Number(item.gross || 0) ? Math.max(8, Math.round(Number(item.gross) / maximum * 100)) : 3;
        return `<div title="${escapeHtml(`${label}: ${formatMoney(item.gross)}`)}"><span style="height:${height}%"></span><small>${escapeHtml(label)}</small></div>`;
      }).join("");
    }
    const topProducts = qs("[data-launch-top-products]");
    if (topProducts) topProducts.innerHTML = (sales.topProducts || []).slice(0, 5).map((item) => `
      <article><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.sku)} · ${Number(item.quantity || 0).toLocaleString("az-AZ")} vahid</small></div><span>${escapeHtml(formatMoney(item.revenue))}</span></article>
    `).join("") || "<p>Satış məlumatı hələ yoxdur.</p>";
    const topSuppliers = qs("[data-launch-top-suppliers]");
    if (topSuppliers) topSuppliers.innerHTML = (sales.topSuppliers || []).slice(0, 5).map((item) => `
      <article><div><strong>${escapeHtml(item.name)}</strong><small>${Number(item.orderCount || 0)} sifariş · ${Number(item.quantity || 0).toLocaleString("az-AZ")} vahid</small></div><span>${escapeHtml(formatMoney(item.revenue))}</span></article>
    `).join("") || "<p>Satış məlumatı hələ yoxdur.</p>";

    const supplierRows = qs("[data-launch-suppliers]");
    const suppliers = data.suppliers || [];
    if (supplierRows) supplierRows.innerHTML = suppliers.map((supplier) => {
      const missing = (supplier.onboarding?.checks || []).filter((item) => !item.ready);
      return `<tr>
        <td data-label="Təchizatçı"><strong>${escapeHtml(supplier.name)}</strong><small>${escapeHtml([supplier.region, supplier.contact].filter(Boolean).join(" · ") || "Əlaqə tamamlanmayıb")}</small></td>
        <td data-label="Hazırlıq"><strong>${Number(supplier.onboarding?.score || 0)}%</strong><small>${supplier.onboarding?.readyForPilot ? "Pilot üçün hazırdır" : "Tamamlanmalıdır"}</small></td>
        <td data-label="Məhsul / təklif">${Number(supplier.productCount || 0)} / ${Number(supplier.offerCount || 0)}<small>${Number(supplier.eligibleOfferCount || 0)} aktual təklif · ${Number(supplier.licensedMediaCount || 0)} media</small></td>
        <td data-label="Çatışmayan mərhələlər"><div class="admin-v2-quality-issues">${missing.map((item) => `<span>${escapeHtml(item.label)}</span>`).join("") || "<span>Tamdır</span>"}</div></td>
        <td data-label="Əməliyyat"><button class="table-action" type="button" data-launch-target="${missing.some((item) => item.key === "contract") ? "operations" : missing.some((item) => item.key === "media") ? "media" : missing.some((item) => item.key === "feed") ? "system" : "b2b"}">Düzəlt</button></td>
      </tr>`;
    }).join("") || '<tr><td colspan="5">Təchizatçı tapılmadı.</td></tr>';
    const supplierCount = qs("[data-launch-supplier-count]");
    if (supplierCount) supplierCount.textContent = `${suppliers.length} təchizatçı`;

    const candidateSelect = qs("[data-launch-pilot-candidate]");
    const candidates = data.pilotCandidates || [];
    if (candidateSelect) {
      const current = candidateSelect.value;
      candidateSelect.innerHTML = candidates.map((item, index) => `
        <option value="${index}">${escapeHtml(item.name)} · ${escapeHtml(item.supplierName)} · ${escapeHtml(formatMoney(item.unitPrice, item.currency))}</option>
      `).join("") || '<option value="">Tam hazır namizəd yoxdur</option>';
      candidateSelect.disabled = candidates.length === 0;
      if (candidates[Number(current)]) candidateSelect.value = current;
      const submit = qs("[data-launch-pilot-form] button[type='submit']");
      if (submit) submit.disabled = candidates.length === 0;
    }

    const fulfillments = data.readyFulfillments || [];
    const fulfillmentList = qs("[data-launch-fulfillments]");
    if (fulfillmentList) fulfillmentList.innerHTML = fulfillments.map((item) => `
      <article>
        <div>
          <strong>Sifariş #${Number(item.orderNumber)} · ${escapeHtml(item.supplierName)}</strong>
          <small>${escapeHtml(item.city)} · ${escapeHtml(formatMoney(item.totalAmount, item.currency))} · ödəniş: ${escapeHtml(item.paymentStatus)}</small>
        </div>
        ${data.providers?.logistics
          ? `<button class="table-action" type="button" data-launch-create-shipment="${escapeHtml(item.id)}">Provayderə göndər</button>`
          : '<button class="table-action" type="button" data-launch-target="operations">Çatdırılmanı aç</button>'}
      </article>
    `).join("") || "<p>Provayderə göndərilməyə hazır sifariş icrası yoxdur.</p>";
    const fulfillmentCount = qs("[data-launch-fulfillment-count]");
    if (fulfillmentCount) fulfillmentCount.textContent = `${fulfillments.length} göndəriş`;
  };

  const renderPilotResult = () => {
    const result = state.pilotResult;
    const container = qs("[data-launch-pilot-result]");
    if (!container) return;
    if (!result) {
      container.innerHTML = "";
      return;
    }
    container.innerHTML = `
      <header>
        <div>
          <strong>${result.ready ? "Pilot axını hazırdır" : "Pilot axınında bloklayıcı var"}</strong>
          <small>${escapeHtml(result.product.name)} · ${Number(result.product.quantity).toLocaleString("az-AZ")} vahid</small>
        </div>
        <span class="status-pill ${result.ready ? "is-success" : "is-danger"}">${result.writePerformed ? "Bazaya yazılıb" : "Bazaya yazılmayıb"}</span>
      </header>
      <div class="launch-pilot-money">
        <span><small>Aralıq məbləğ</small><strong>${escapeHtml(formatMoney(result.subtotal, result.product.currency))}</strong></span>
        <span><small>Çatdırılma</small><strong>${escapeHtml(formatMoney(result.delivery.amount, result.delivery.currency))}</strong></span>
        <span><small>Yekun</small><strong>${escapeHtml(formatMoney(result.total, result.product.currency))}</strong></span>
      </div>
      <div class="launch-pilot-checks">
        ${(result.checks || []).map((item) => `<span class="${item.ready ? "is-ready" : item.required ? "is-blocked" : "is-warning"}">${escapeHtml(item.label)}</span>`).join("")}
      </div>
      ${result.nextUrl ? `<a class="button button-secondary" href="${escapeHtml(result.nextUrl)}">Məhsul axınını aç</a>` : ""}
    `;
  };

  const loadLaunch = async () => {
    const result = await api.launchCenter();
    state.launch = result.data;
    renderLaunch();
    renderPilotResult();
  };

  qs("[data-launch-refresh]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    setBusy(button, true, "Yenilənir...");
    try {
      await loadLaunch();
    } catch (error) {
      setStatus("[data-launch-status]", error.message, "error");
    } finally {
      setBusy(button, false);
    }
  });

  qs("[data-admin-panel='launch']")?.addEventListener("click", async (event) => {
    const shipmentButton = event.target.closest("[data-launch-create-shipment]");
    if (shipmentButton) {
      const fulfillment = state.launch?.readyFulfillments?.find((item) => item.id === shipmentButton.dataset.launchCreateShipment);
      if (!fulfillment) return;
      if (!window.confirm(`Sifariş #${fulfillment.orderNumber} üzrə ${fulfillment.supplierName} göndərişi real logistika provayderinə ötürülsün?`)) return;
      setBusy(shipmentButton, true, "Göndərilir...");
      try {
        const result = await api.createProviderShipment(fulfillment.id);
        setStatus(
          "[data-launch-status]",
          `Göndəriş yaradıldı: ${result.data.provider} · ${result.data.trackingCode}.`,
          "success"
        );
        await loadLaunch();
        window.dispatchEvent(new CustomEvent("constera:admin-refresh"));
      } catch (error) {
        setStatus("[data-launch-status]", error.message, "error");
      } finally {
        setBusy(shipmentButton, false);
      }
      return;
    }
    const button = event.target.closest("[data-launch-target]");
    if (button) openTab(button.dataset.launchTarget);
  });

  qs("[data-launch-pilot-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const candidate = state.launch?.pilotCandidates?.[Number(form.elements.candidate.value)];
    if (!candidate) {
      setStatus("[data-launch-status]", "Pilot üçün tam hazır məhsul tapılmadı.", "warning");
      return;
    }
    const button = form.querySelector('button[type="submit"]');
    setBusy(button, true, "Yoxlanılır...");
    try {
      const result = await api.validatePilotOrder({
        productId: candidate.productId,
        offerId: candidate.offerId,
        quantity: form.elements.quantity.value,
        city: form.elements.city.value,
        deliveryMode: form.elements.deliveryMode.value,
        paymentMethod: form.elements.paymentMethod.value
      });
      state.pilotResult = result.data;
      renderPilotResult();
      setStatus(
        "[data-launch-status]",
        result.data.ready
          ? "Pilot axını bütün məcburi yoxlamalardan keçdi. İstehsal bazasında heç bir qeyd yaradılmadı."
          : "Pilot axınında bloklayıcılar tapıldı. Nəticə aşağıda göstərilir.",
        result.data.ready ? "success" : "warning"
      );
    } catch (error) {
      setStatus("[data-launch-status]", error.message, "error");
    } finally {
      setBusy(button, false);
    }
  });

  const fold = (value) => String(value || "")
    .trim()
    .toLocaleLowerCase("az-AZ")
    .replace(/ə/g, "e")
    .replace(/ğ/g, "g")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ş/g, "s")
    .replace(/ü/g, "u")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "");

  const parseCsvMatrix = (source) => {
    const text = String(source || "").replace(/^\uFEFF/, "").trim();
    if (!text) return [];
    const firstLine = text.split(/\r?\n/, 1)[0] || "";
    const delimiter = firstLine.includes("\t")
      ? "\t"
      : (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ";" : ",";
    const matrix = [];
    let row = [];
    let cell = "";
    let quoted = false;
    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];
      const next = text[index + 1];
      if (character === "\"" && quoted && next === "\"") {
        cell += "\"";
        index += 1;
      } else if (character === "\"") {
        quoted = !quoted;
      } else if (character === delimiter && !quoted) {
        row.push(cell.trim());
        cell = "";
      } else if ((character === "\n" || character === "\r") && !quoted) {
        if (character === "\r" && next === "\n") index += 1;
        row.push(cell.trim());
        if (row.some(Boolean)) matrix.push(row);
        row = [];
        cell = "";
      } else {
        cell += character;
      }
    }
    row.push(cell.trim());
    if (row.some(Boolean)) matrix.push(row);
    return matrix;
  };

  const normalizeObject = (item) => Object.entries(item || {}).reduce((result, [key, value]) => {
    result[fold(key)] = value;
    return result;
  }, {});

  const parseMediaSource = (source) => {
    const text = String(source || "").replace(/^\uFEFF/, "").trim();
    if (!text) return [];
    if (/^[\[{]/.test(text)) {
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error("JSON strukturu düzgün deyil.");
      }
      const rows = Array.isArray(parsed)
        ? parsed
        : ["media", "items", "rows", "data"].map((key) => parsed?.[key]).find(Array.isArray) || [];
      return rows.filter((item) => item && typeof item === "object" && !Array.isArray(item)).map(normalizeObject);
    }
    const matrix = parseCsvMatrix(text);
    if (matrix.length < 2) return [];
    const headers = matrix[0].map(fold);
    return matrix.slice(1).map((cells) => headers.reduce((item, header, index) => {
      item[header] = cells[index] || "";
      return item;
    }, {}));
  };

  const aliases = {
    sku: ["sku", "mehsulkodu", "kod"],
    url: ["imageurl", "sekilurl", "fotourl", "url"],
    sourceUrl: ["sourceurl", "menbeurl", "mehsulurl", "source"],
    altText: ["alttext", "tesvir", "alternativmetn", "ad"],
    licenseType: ["licensetype", "huquq", "license", "istifadehuququ"],
    licenseNote: ["licensenote", "huquqqeydi", "icaze", "qeyd"],
    isPrimary: ["isprimary", "esas", "primary", "esassekil"]
  };
  const readAlias = (row, key) => {
    const alias = aliases[key].find((candidate) => Object.prototype.hasOwnProperty.call(row, candidate));
    return alias ? row[alias] : "";
  };
  const parseBoolean = (value) => ["1", "true", "yes", "beli", "hə", "he", "esas"].includes(fold(value));
  const normalizeLicense = (value) => {
    const key = fold(value || "official");
    if (["official", "resmi", "istehsalci"].includes(key)) return "official";
    if (["supplier", "techizatci"].includes(key)) return "supplier";
    if (["licensed", "lisenziyali", "lisenziya"].includes(key)) return "licensed";
    if (["own", "constera", "oz"].includes(key)) return "own";
    return "";
  };
  const safeHttps = (value) => {
    try {
      const url = new URL(String(value || "").trim());
      return url.protocol === "https:" && !url.username && !url.password ? url.toString() : "";
    } catch {
      return "";
    }
  };

  const validateMediaRows = async (source) => {
    if (!state.products.length) {
      state.products = ((await api.myProducts()).data || []).filter((item) => item.status !== "archived");
    }
    const rows = parseMediaSource(source);
    if (!rows.length) throw new Error("CSV və ya JSON daxilində məlumat sətri tapılmadı.");
    if (rows.length > 200) throw new Error("Bir dəfəyə maksimum 200 media sətri yoxlanıla bilər.");
    const productsBySku = new Map(state.products.map((product) => [fold(product.sku), product]));
    const seen = new Set();
    const primaryBySku = new Set();
    return rows.map((row, index) => {
      const sku = String(readAlias(row, "sku") || "").trim();
      const product = productsBySku.get(fold(sku));
      const url = safeHttps(readAlias(row, "url"));
      const sourceUrl = safeHttps(readAlias(row, "sourceUrl"));
      const licenseType = normalizeLicense(readAlias(row, "licenseType"));
      const licenseNote = String(readAlias(row, "licenseNote") || "").trim();
      const isPrimary = parseBoolean(readAlias(row, "isPrimary"));
      const errors = [];
      const duplicateKey = `${fold(sku)}:${url}`;
      if (!sku) errors.push("SKU boşdur");
      else if (!product) errors.push("SKU kataloqda tapılmadı");
      if (!url) errors.push("Şəkil URL-i təhlükəsiz HTTPS deyil");
      if (!sourceUrl) errors.push("Mənbə URL-i təhlükəsiz HTTPS deyil");
      if (!licenseType) errors.push("İstifadə hüququ tanınmadı");
      if (["supplier", "licensed"].includes(licenseType) && !licenseNote) errors.push("Hüquq qeydi tələb olunur");
      if (seen.has(duplicateKey)) errors.push("Sətir təkrarlanır");
      if (isPrimary && primaryBySku.has(fold(sku))) errors.push("Eyni SKU üçün yalnız bir əsas şəkil seçilə bilər");
      seen.add(duplicateKey);
      if (isPrimary) primaryBySku.add(fold(sku));
      return {
        rowNumber: index + 2,
        sku,
        product,
        url,
        sourceUrl,
        altText: String(readAlias(row, "altText") || product?.name || "").trim().slice(0, 240),
        licenseType,
        licenseNote,
        isPrimary,
        errors,
        status: errors.length ? "invalid" : "ready",
        message: errors.join("; ")
      };
    });
  };

  const renderMediaPreview = () => {
    const body = qs("[data-media-bulk-preview-rows]");
    const wrap = qs("[data-media-bulk-preview-wrap]");
    const commit = qs("[data-media-bulk-commit]");
    if (!body || !wrap || !commit) return;
    wrap.hidden = state.mediaRows.length === 0;
    body.innerHTML = state.mediaRows.map((item) => `
      <tr>
        <td data-label="Sətir">${Number(item.rowNumber)}</td>
        <td data-label="Məhsul"><strong>${escapeHtml(item.product?.name || item.sku || "Naməlum")}</strong><small>${escapeHtml(item.sku)}</small></td>
        <td data-label="Şəkil">${item.url ? `<a class="source-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">URL-i aç</a>` : "Yanlışdır"}</td>
        <td data-label="Hüquq">${escapeHtml(item.licenseType || "Dəqiqləşməyib")}<small>${escapeHtml(item.licenseNote || "")}</small></td>
        <td data-label="Nəticə"><span class="status-pill ${item.status === "success" ? "is-success" : item.status === "failed" || item.status === "invalid" ? "is-danger" : ""}">${item.status === "success" ? "Qeyd edildi" : item.status === "failed" ? "Uğursuz" : item.status === "invalid" ? "Səhv" : "Hazır"}</span><small>${escapeHtml(item.message || "")}</small></td>
      </tr>
    `).join("");
    commit.disabled = !state.mediaRows.some((item) => item.status === "ready");
  };

  const readMediaInput = async () => {
    const form = qs("[data-media-bulk-form]");
    if (!form) return "";
    const file = form.elements.file.files?.[0];
    if (file) {
      const source = await file.text();
      form.elements.source.value = source;
      return source;
    }
    return form.elements.source.value;
  };

  const previewMedia = async (button) => {
    setBusy(button, true, "Yoxlanılır...");
    try {
      state.mediaRows = await validateMediaRows(await readMediaInput());
      renderMediaPreview();
      const valid = state.mediaRows.filter((item) => item.status === "ready").length;
      const invalid = state.mediaRows.length - valid;
      setStatus(
        "[data-media-bulk-status]",
        `${valid} sətir qeydiyyata hazırdır, ${invalid} sətirdə düzəliş tələb olunur.`,
        invalid ? "warning" : "success"
      );
    } catch (error) {
      state.mediaRows = [];
      renderMediaPreview();
      setStatus("[data-media-bulk-status]", error.message, "error");
    } finally {
      setBusy(button, false);
    }
  };

  qs("[data-media-bulk-preview]")?.addEventListener("click", (event) => previewMedia(event.currentTarget));
  qs("[data-media-bulk-form] input[type='file']")?.addEventListener("change", async (event) => {
    const file = event.currentTarget.files?.[0];
    const form = event.currentTarget.form;
    if (!file || !form) return;
    form.elements.source.value = await file.text();
    setStatus("[data-media-bulk-status]", `${file.name} oxundu. Ön baxışla məlumatları yoxla.`, "info");
  });
  qs("[data-media-bulk-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = qs("[data-media-bulk-commit]");
    const queue = state.mediaRows.filter((item) => item.status === "ready");
    if (!queue.length) {
      setStatus("[data-media-bulk-status]", "Əvvəlcə uyğun sətirləri ön baxışda yoxla.", "warning");
      return;
    }
    if (!window.confirm(`${queue.length} rəsmi media URL-i təhlükəsizlik yoxlamasından keçirilərək bazaya yazılsın?`)) return;
    setBusy(button, true, "Qeyd edilir...");
    let cursor = 0;
    let succeeded = 0;
    let failed = 0;
    const worker = async () => {
      while (cursor < queue.length) {
        const item = queue[cursor];
        cursor += 1;
        try {
          await api.registerExternalMedia({
            entityType: "product",
            entityId: item.product.id,
            url: item.url,
            sourceUrl: item.sourceUrl,
            altText: item.altText,
            licenseType: item.licenseType,
            licenseNote: item.licenseNote,
            isPrimary: item.isPrimary
          });
          item.status = "success";
          item.message = "Təhlükəsizlik və şəkil formatı təsdiqləndi";
          succeeded += 1;
        } catch (error) {
          item.status = "failed";
          item.message = error.message;
          failed += 1;
        }
        renderMediaPreview();
        setStatus("[data-media-bulk-status]", `${succeeded + failed}/${queue.length} sətir emal edildi.`, failed ? "warning" : "info");
      }
    };
    try {
      await Promise.all(Array.from({ length: Math.min(3, queue.length) }, worker));
      setStatus(
        "[data-media-bulk-status]",
        `${succeeded} media qeydə alındı, ${failed} sətir uğursuz oldu.`,
        failed ? "warning" : "success"
      );
      window.dispatchEvent(new CustomEvent("constera:media-updated"));
      await loadLaunch().catch(() => null);
    } finally {
      setBusy(button, false);
      renderMediaPreview();
    }
  });

  const init = async () => {
    try {
      const session = await api.session();
      if (!session.user || !["super_admin", "admin"].includes(session.user.role)) return;
      await loadLaunch();
    } catch (error) {
      setStatus("[data-launch-status]", error.message || "Buraxılış Mərkəzi yüklənmədi.", "error");
    }
  };

  window.addEventListener("constera:admin-refresh", () => loadLaunch().catch(() => null));
  init();
})();
