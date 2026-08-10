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

(function initProjectSiteJournal() {
  const root = document.querySelector("[data-project-site-journal]");
  if (!root) return;
  const $ = (selector) => root.querySelector(selector);
  const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[character]);
  const n = (value) => Number(value || 0).toLocaleString("az-AZ");
  const issueLabel = { open: "Açıq", in_progress: "İcrada", resolved: "Həll edildi", verified: "Təsdiqləndi" };
  const severityLabel = { low: "Aşağı", medium: "Orta", high: "Yüksək", critical: "Kritik" };
  const documentLabel = { draft: "Qaralama", pending: "Təsdiq gözləyir", accepted: "Qəbul edildi", rejected: "Rədd edildi", superseded: "Köhnə reviziya" };
  const typeLabel = { hidden_work: "Gizli iş aktı", inspection: "Texniki baxış", handover: "Təhvil aktı", drawing_revision: "Çertyoj" };
  const weatherLabel = { clear: "Açıq", cloudy: "Buludlu", rain: "Yağış", wind: "Külək", hot: "İsti", cold: "Soyuq" };
  const dailyForm = $("[data-daily-log-form]");
  const issueForm = $("[data-quality-issue-form]");
  const documentForm = $("[data-control-document-form]");
  let projectId = new URLSearchParams(location.search).get("project") || "";
  let state;

  const notify = (message, type = "") => {
    const node = $("[data-journal-status]");
    node.textContent = message;
    node.dataset.type = type;
  };
  const actionButton = (kind, item) => {
    const next = kind === "issue"
      ? { open: ["in_progress", "İcraya al"], in_progress: ["resolved", "Həll edildi"], resolved: ["verified", "Təsdiqlə"] }[item.status]
      : { draft: ["pending", "Təsdiqə göndər"], pending: ["accepted", "Qəbul et"], rejected: ["pending", "Yenidən göndər"] }[item.status];
    return next ? `<button class="table-action" type="button" data-journal-status-action="${kind}" data-entry-id="${esc(item.id)}" data-next-status="${next[0]}">${next[1]}</button>` : "";
  };
  const render = () => {
    const summary = state.summary;
    $("[data-journal-badge]").textContent = `${summary.workdays} iş günü · ${summary.openIssues} açıq qüsur`;
    $("[data-journal-report]").href = `/api/project-site-journal?projectId=${encodeURIComponent(projectId)}&report=weekly`;
    $("[data-journal-stats]").innerHTML = [
      [summary.workdays, "iş günü"], [summary.workerShifts, "işçi-növbə"], [summary.workerHours, "iş saatı"],
      [summary.equipmentHours, "texnika saatı"], [summary.delayHours, "gecikmə saatı"],
      [summary.openIssues, "açıq qüsur"], [summary.overdueIssues, "gecikmiş qüsur"], [summary.acceptedActs, "qəbul aktı"]
    ].map(([value, label]) => `<article class="stat-card"><span class="stat-value">${n(value)}</span><p>${label}</p></article>`).join("");
    $("[data-daily-log-count]").textContent = `${state.logs.length} qeyd`;
    $("[data-daily-logs]").innerHTML = state.logs.length ? state.logs.slice(0, 30).map((item) => `
      <article class="cabinet-item"><header><strong>${esc(item.workDate)} · ${esc(item.crewName)}</strong><span class="mini-badge">${esc(weatherLabel[item.weather])}</span></header>
      <p>${n(item.workerCount)} işçi · ${n(item.workerHours)} saat · ${esc(item.workSummary)}</p>
      <span>${item.delayMinutes ? `${n(item.delayMinutes)} dəq. gecikmə · ${esc(item.delayReason || "Səbəb yazılmayıb")}` : "Gecikmə yoxdur"}${item.safetyNote ? ` · Təhlükəsizlik: ${esc(item.safetyNote)}` : ""}</span>
      ${item.photoUrl ? `<div class="cabinet-item-actions"><a class="table-action" href="${esc(item.photoUrl)}" target="_blank" rel="noopener">Foto</a></div>` : ""}</article>`).join("") : '<article class="cabinet-item"><strong>Bu həftə gündəlik qeydi yoxdur.</strong></article>';
    const openCount = state.issues.filter((item) => !["resolved", "verified"].includes(item.status)).length;
    $("[data-quality-issue-count]").textContent = `${openCount} açıq`;
    $("[data-quality-issues]").innerHTML = state.issues.length ? state.issues.slice(0, 40).map((item) => `
      <article class="cabinet-item"><header><strong>${esc(item.code)} · ${esc(item.title)}</strong><span class="mini-badge${item.severity === "critical" ? " is-danger" : ""}">${esc(severityLabel[item.severity])}</span></header>
      <p>${esc(item.workArea || "Ümumi obyekt")} · ${esc(issueLabel[item.status])}${item.dueDate ? ` · son tarix ${esc(item.dueDate)}` : ""}</p><span>${esc(item.assigneeName || "Məsul şəxs seçilməyib")}</span>
      <div class="cabinet-item-actions">${item.photoUrl ? `<a class="table-action" href="${esc(item.photoUrl)}" target="_blank" rel="noopener">Foto</a>` : ""}${actionButton("issue", item)}</div></article>`).join("") : '<article class="cabinet-item"><strong>Qüsur qeydi yoxdur.</strong></article>';
    $("[data-control-document-count]").textContent = `${state.documents.length} sənəd`;
    $("[data-control-documents]").innerHTML = state.documents.length ? state.documents.slice(0, 40).map((item) => `
      <article class="cabinet-item"><header><strong>${esc(item.code)} · ${esc(item.title)}</strong><span class="mini-badge">${esc(documentLabel[item.status])}</span></header>
      <p>${esc(typeLabel[item.type])}${item.revisionCode ? ` · ${esc(item.revisionCode)}` : ""} · ${esc(item.inspectionDate)}</p><span>${esc(item.workArea || "Ümumi obyekt")}</span>
      <div class="cabinet-item-actions">${item.fileUrl ? `<a class="table-action" href="${esc(item.fileUrl)}" target="_blank" rel="noopener">Sənəd</a>` : ""}${actionButton("document", item)}</div></article>`).join("") : '<article class="cabinet-item"><strong>Akt və çertyoj qeydi yoxdur.</strong></article>';
  };
  const load = async (id = projectId) => {
    if (!id || id === "1" || !window.ConstEraAPI?.projectSiteJournal) return;
    projectId = id;
    try {
      state = (await window.ConstEraAPI.projectSiteJournal(id)).data;
      render();
      notify("Obyekt jurnalı sinxronlaşdırıldı.", "success");
    } catch (error) { notify(error.message || "Obyekt jurnalı yüklənmədi.", "error"); }
  };
  const dataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const upload = async (file, altText) => {
    if (!file?.size) return null;
    if (file.size > 3e6) throw new Error("Fayl maksimum 3 MB ola bilər.");
    return (await window.ConstEraAPI.uploadMedia({
      filename: file.name, contentType: file.type, fileBase64: await dataUrl(file),
      entityType: "project", entityId: projectId, altText, licenseType: "own", licenseNote: "Obyekt jurnalı sübutu."
    })).data.id;
  };
  const submit = (form, action, fileName, assetName, success) => form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      const fields = Object.fromEntries(new FormData(form));
      const file = form.elements[fileName]?.files?.[0];
      delete fields[fileName];
      if (file) fields[assetName] = await upload(file, success);
      state = (await window.ConstEraAPI.projectJournalMutation({ action, projectId, ...fields })).data;
      form.reset();
      setDates(); render(); notify(success, "success");
    } catch (error) { notify(error.message || "Qeyd saxlanmadı.", "error"); }
    finally { button.disabled = false; }
  });
  const setDates = () => {
    const today = new Date().toISOString().slice(0, 10);
    if (!dailyForm.elements.workDate.value) dailyForm.elements.workDate.value = today;
    if (!documentForm.elements.inspectionDate.value) documentForm.elements.inspectionDate.value = today;
  };
  submit(dailyForm, "create-daily-log", "photo", "photoAssetId", "Gündəlik və davamiyyət saxlanıldı.");
  submit(issueForm, "create-issue", "photo", "photoAssetId", "Qüsur düzəliş reyestrinə əlavə edildi.");
  submit(documentForm, "create-document", "document", "mediaAssetId", "Akt və ya çertyoj versiyası saxlanıldı.");
  root.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-journal-status-action]");
    if (!button) return;
    button.disabled = true;
    try {
      const issue = button.dataset.journalStatusAction === "issue";
      state = (await window.ConstEraAPI.projectJournalMutation({
        action: issue ? "update-issue-status" : "update-document-status",
        projectId, id: button.dataset.entryId, status: button.dataset.nextStatus
      })).data;
      render(); notify("Status yeniləndi.", "success");
    } catch (error) { notify(error.message || "Status yenilənmədi.", "error"); }
    finally { button.disabled = false; }
  });
  setDates();
  addEventListener("constera:project-workspace", (event) => load(event.detail?.projectId));
  window.ConstEraAPI?.session?.().then((session) => session.user && load()).catch(() => null);
})();
