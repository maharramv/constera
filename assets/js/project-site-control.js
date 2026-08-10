(function initProjectSiteControl() {
  const root = document.querySelector("[data-project-site-control]");
  if (!root) return;
  const find = (selector) => root.querySelector(selector);
  const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[character]);
  const qty = (value) => Number(value || 0).toLocaleString("az-AZ");
  const labels = { accepted: "Qəbul", partial: "Qismən", rejected: "Rədd", use: "İstifadə", waste: "İsraf", return: "Qaytarma" };
  const receiptForm = find("[data-project-receipt-form]");
  const movementForm = find("[data-project-movement-form]");
  const receiptItem = find("[data-project-receipt-item]");
  const movementItem = find("[data-project-movement-item]");
  const qrInput = find("[data-project-qr-code]");
  const qrFile = find("[data-project-qr-file]");
  const qrPreview = find("[data-project-qr-preview]");
  let projectId = new URLSearchParams(location.search).get("project") || "";
  let state;

  const notify = (message, type = "") => {
    const node = find("[data-project-site-status]");
    node.textContent = message;
    node.dataset.type = type;
  };
  const preview = (receipt, qr) => {
    qrPreview.hidden = !receipt;
    qrPreview.innerHTML = receipt ? `
      <header><strong>#${receipt.number} · ${esc(receipt.title)}</strong><span class="mini-badge">${esc(labels[receipt.status])}</span></header>
      <p>${esc(receipt.code)} · ${qty(receipt.acceptedQuantity)} / ${qty(receipt.deliveredQuantity)} ${esc(receipt.unit)}</p>
      ${qr?.svg || ""}` : "";
  };
  const render = () => {
    const summary = state.summary;
    const totals = summary.totals;
    const options = '<option value="">Material seç</option>' + state.projectItems.map((item) =>
      `<option value="${esc(item.rowId)}">${esc(item.title)} · ${qty(item.quantity)} ${esc(item.unit)}</option>`
    ).join("");
    receiptItem.innerHTML = movementItem.innerHTML = options;
    find("[data-project-site-badge]").textContent = `${state.receipts.length} qəbul · ${state.movements.length} hərəkət`;
    find("[data-project-site-stats]").innerHTML = [
      [totals.accepted, "qəbul"], [totals.used, "istifadə"], [totals.available, "qalıq"],
      [totals.waste, `israf · ${qty(totals.wasteRate)}%`], [totals.rejected, "rədd"], [totals.negativeBalanceItems, "mənfi qalıq"]
    ].map(([value, label]) => `<article class="stat-card"><span class="stat-value">${qty(value)}</span><p>${esc(label)}</p></article>`).join("");
    find("[data-project-site-item-count]").textContent = `${summary.items.length} material`;
    find("[data-project-material-summary]").innerHTML = summary.items.length ? summary.items.map((item) => `
      <tr><td data-label="Material"><strong>${esc(item.title)}</strong><small>${esc(item.unit)}</small></td>
      <td data-label="Plan">${qty(item.planned)}</td><td data-label="Qəbul">${qty(item.accepted)}</td>
      <td data-label="İstifadə">${qty(item.used)}</td><td data-label="İsraf">${qty(item.waste)}<small>${qty(item.wasteRate)}%</small></td>
      <td data-label="Qalıq"><span class="mini-badge${item.hasNegativeBalance ? " is-danger" : " is-verified"}">${qty(item.available)}</span></td>
      <td data-label="İcra">${item.receiptProgress}%</td></tr>`).join("") : '<tr><td colspan="7">Material mövqeyi yoxdur.</td></tr>';
    find("[data-project-receipt-count]").textContent = `${state.receipts.length} akt`;
    find("[data-project-receipts]").innerHTML = state.receipts.length ? state.receipts.slice(0, 30).map((item) => `
      <article class="cabinet-item"><header><strong>#${item.number} · ${esc(item.title)}</strong><span class="mini-badge">${esc(labels[item.status])}</span></header>
      <p>${qty(item.acceptedQuantity)} qəbul · ${qty(item.rejectedQuantity)} rədd · ${esc(item.unit)}</p><span>${esc(item.code)}</span>
      <div class="cabinet-item-actions">${item.photoUrl ? `<a class="table-action" href="${esc(item.photoUrl)}" target="_blank" rel="noopener">Foto</a>` : ""}<button class="table-action" type="button" data-receipt-qr="${esc(item.id)}">QR</button></div></article>`).join("") : '<article class="cabinet-item"><strong>Qəbul aktı yoxdur.</strong></article>';
    find("[data-project-movement-count]").textContent = `${state.movements.length} hərəkət`;
    find("[data-project-movements]").innerHTML = state.movements.length ? state.movements.slice(0, 40).map((item) => `
      <article class="cabinet-item"><header><strong>${esc(item.title)}</strong><span class="mini-badge">${esc(labels[item.type])}</span></header>
      <p>${qty(item.quantity)} ${esc(item.unit)} · ${esc(item.workArea || "Ümumi obyekt")}</p><span>${esc(item.note || "Qeyd yoxdur")}</span></article>`).join("") : '<article class="cabinet-item"><strong>Sərfiyyat qeydi yoxdur.</strong></article>';
  };
  const load = async (id = projectId) => {
    if (!id || id === "1" || !window.ConstEraAPI?.projectSiteControl) return;
    projectId = id;
    try {
      state = (await window.ConstEraAPI.projectSiteControl(id)).data;
      render();
      notify("Material balansı sinxronlaşdırıldı.", "success");
      const requested = new URLSearchParams(location.search).get("receipt");
      if (requested) preview(state.receipts.find((item) => item.id === requested));
    } catch (error) {
      notify(error.message || "Obyekt nəzarəti yüklənmədi.", "error");
    }
  };
  const dataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  receiptForm.elements.deliveredQuantity.addEventListener("input", ({ target }) => {
    receiptForm.elements.acceptedQuantity.value = target.value;
  });
  receiptForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = receiptForm.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      const fields = Object.fromEntries(new FormData(receiptForm));
      const file = receiptForm.elements.photo.files[0];
      delete fields.photo;
      if (file) {
        if (file.size > 3e6) throw new Error("Foto maksimum 3 MB ola bilər.");
        fields.photoAssetId = (await window.ConstEraAPI.uploadMedia({ filename: file.name, contentType: file.type, fileBase64: await dataUrl(file), entityType: "project", entityId: projectId, altText: "Qəbul", licenseType: "own", licenseNote: "Foto." })).data.id;
      }
      state = (await window.ConstEraAPI.createProjectReceipt({ ...fields, projectId })).data;
      receiptForm.reset();
      receiptForm.elements.rejectedQuantity.value = 0;
      render();
      notify("Qəbul və QR hazırdır.", "success");
    } catch (error) { notify(error.message || "Qəbul saxlanmadı.", "error"); }
    finally { button.disabled = false; }
  });
  movementForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = movementForm.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      state = (await window.ConstEraAPI.createProjectMaterialMovement({ ...Object.fromEntries(new FormData(movementForm)), projectId })).data;
      movementForm.reset(); render(); notify("Material balansı yeniləndi.", "success");
    } catch (error) { notify(error.message || "Hərəkət saxlanmadı.", "error"); }
    finally { button.disabled = false; }
  });
  root.addEventListener("click", async (event) => {
    const qr = event.target.closest("[data-receipt-qr]");
    if (!qr) return;
    try {
      const receipt = state.receipts.find((item) => item.id === qr.dataset.receiptQr);
      preview(receipt, (await window.ConstEraAPI.projectReceiptQr(projectId, receipt.id)).data);
    } catch (error) { notify(error.message || "Əməliyyat alınmadı.", "error"); }
  });
  const locate = (raw) => {
    let value = String(raw || "").trim();
    try {
      const url = new URL(value);
      if (url.origin !== location.origin || !url.pathname.endsWith("project-planner.html")) return;
      if (url.searchParams.get("project") !== projectId) return location.assign(url);
      value = url.searchParams.get("code") || url.searchParams.get("receipt");
    } catch {}
    return state?.receipts.find((item) => item.code === value || item.id === value);
  };
  find("[data-project-qr-find]").addEventListener("click", () => {
    const receipt = locate(qrInput.value); preview(receipt); notify(receipt ? `${receipt.code} tapıldı.` : "Qəbul aktı tapılmadı.", receipt ? "success" : "warning");
  });
  qrFile.addEventListener("change", async () => {
    try {
      if (!("BarcodeDetector" in window)) throw new Error("Brauzer QR oxumanı dəstəkləmir.");
      const bitmap = await createImageBitmap(qrFile.files[0]);
      const result = (await new BarcodeDetector({ formats: ["qr_code"] }).detect(bitmap))[0];
      bitmap.close();
      const receipt = locate(result?.rawValue);
      if (!receipt) throw new Error("QR bu layihəyə aid deyil.");
      qrInput.value = result.rawValue; preview(receipt); notify(`${receipt.code} oxundu.`, "success");
    } catch (error) { notify(error.message || "QR oxunmadı.", "error"); }
    qrFile.value = "";
  });
  addEventListener("constera:project-workspace", (event) => load(event.detail?.projectId));
  window.ConstEraAPI?.session?.().then((session) => session.user && load()).catch(() => null);
})();
