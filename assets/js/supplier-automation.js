(function initSupplierAutomation() {
  const root = document.querySelector("[data-supplier-feed-panel]");
  const api = window.ConstEraAPI;
  if (!root || !api?.supplierFeeds) return;

  const form = root.querySelector("[data-supplier-feed-form]");
  const list = root.querySelector("[data-supplier-feed-list]");
  const status = root.querySelector("[data-supplier-feed-status]");
  const count = root.querySelector("[data-supplier-feed-count]");
  const supplierField = root.querySelector("[data-supplier-feed-supplier-field]");
  const supplierSelect = root.querySelector("[data-supplier-feed-supplier]");
  const clearButton = root.querySelector("[data-supplier-feed-clear]");
  let feeds = [];
  let runs = [];
  let sessionUser = null;

  const escapeHtml = (value) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  const setStatus = (message, type = "") => {
    status.textContent = message;
    if (type) status.dataset.type = type;
    else delete status.dataset.type;
  };

  const formatDate = (value) => {
    if (!value || !Number.isFinite(Date.parse(value))) return "Hələ işləməyib";
    return new Date(value).toLocaleString("az-AZ", { dateStyle: "medium", timeStyle: "short" });
  };
  const endpointLabel = (value) => {
    try {
      return new URL(value).hostname;
    } catch {
      return "Feed mənbəyi";
    }
  };

  const latestRun = (feedId) => runs.find((run) => run.feedId === feedId);

  const render = () => {
    count.textContent = `${feeds.length} feed`;
    list.innerHTML = feeds.length ? feeds.map((feed) => {
      const run = latestRun(feed.id);
      const state = feed.lastStatus || "gözləyir";
      const detail = run
        ? `${run.updatedRows} yeniləndi · ${run.skippedRows} keçildi`
        : `${feed.scheduleMinutes} dəqiqədən bir`;
      return `
        <article class="supplier-feed-item">
          <div class="supplier-feed-main">
            <header>
              <strong>${escapeHtml(feed.name)}</strong>
              <span class="status-pill" data-status="${escapeHtml(state)}">${escapeHtml(state)}</span>
            </header>
            <div><a href="${escapeHtml(feed.endpointUrl)}" target="_blank" rel="noopener">${escapeHtml(endpointLabel(feed.endpointUrl))}</a></div>
            <div><span>${escapeHtml(feed.supplier)} · ${escapeHtml(feed.format.toUpperCase())} · ${escapeHtml(detail)}</span></div>
            <div><small>Son iş: ${escapeHtml(formatDate(feed.lastRunAt))}${feed.lastError ? ` · ${escapeHtml(feed.lastError)}` : ""}</small></div>
          </div>
          <div class="supplier-feed-actions">
            <button class="button button-secondary" type="button" data-supplier-feed-run="${escapeHtml(feed.id)}">İndi yenilə</button>
            <button class="button button-outline" type="button" data-supplier-feed-edit="${escapeHtml(feed.id)}">Redaktə et</button>
            <button class="table-action is-danger" type="button" data-supplier-feed-delete="${escapeHtml(feed.id)}">Arxivlə</button>
          </div>
        </article>
      `;
    }).join("") : `
      <div class="empty-state">
        <strong>Aktiv feed yoxdur.</strong>
        <p>İlk CSV və ya JSON feed ünvanını yuxarıdakı formadan əlavə et.</p>
      </div>
    `;
  };

  const resetForm = () => {
    form.reset();
    form.elements.id.value = "";
    form.elements.format.value = "csv";
    form.elements.scheduleMinutes.value = "1440";
    if (supplierSelect?.options.length) supplierSelect.selectedIndex = 0;
  };

  const loadSuppliers = async () => {
    if (!["super_admin", "admin"].includes(sessionUser?.role) || !api.suppliers) return;
    const response = await api.suppliers();
    const suppliers = response.data || [];
    supplierField.hidden = false;
    supplierSelect.innerHTML = suppliers.map((supplier) =>
      `<option value="${escapeHtml(supplier.id)}">${escapeHtml(supplier.name)}</option>`
    ).join("");
  };

  const load = async (message = "") => {
    const response = await api.supplierFeeds();
    feeds = response.data?.feeds || [];
    runs = response.data?.runs || [];
    render();
    if (message) setStatus(message, "success");
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    const data = Object.fromEntries(new FormData(form));
    button.disabled = true;
    setStatus("Feed yoxlanılır və saxlanılır...");
    try {
      await api.saveSupplierFeed(data, Boolean(data.id));
      resetForm();
      await load("Feed saxlanıldı və növbəti avtomatik işə planlandı.");
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      button.disabled = false;
    }
  });

  clearButton.addEventListener("click", resetForm);

  list.addEventListener("click", async (event) => {
    const runButton = event.target.closest("[data-supplier-feed-run]");
    const editButton = event.target.closest("[data-supplier-feed-edit]");
    const deleteButton = event.target.closest("[data-supplier-feed-delete]");
    if (editButton) {
      const feed = feeds.find((item) => item.id === editButton.dataset.supplierFeedEdit);
      if (!feed) return;
      form.elements.id.value = feed.id;
      form.elements.name.value = feed.name;
      form.elements.endpointUrl.value = feed.endpointUrl;
      form.elements.format.value = feed.format;
      form.elements.scheduleMinutes.value = String(feed.scheduleMinutes);
      form.elements.authEnvKey.value = feed.authEnvKey || "";
      if (supplierSelect && feed.supplierId) supplierSelect.value = feed.supplierId;
      form.elements.name.focus();
      return;
    }
    if (runButton) {
      runButton.disabled = true;
      setStatus("Feed yüklənir və uyğun SKU-lar yenilənir...");
      try {
        const response = await api.runSupplierFeed(runButton.dataset.supplierFeedRun);
        const result = response.data || {};
        await load(`${result.updatedRows || 0} təklif yeniləndi, ${result.skippedRows || 0} sətir keçildi.`);
      } catch (error) {
        setStatus(error.message, "error");
      } finally {
        runButton.disabled = false;
      }
      return;
    }
    if (deleteButton && window.confirm("Bu feed arxivlənsin?")) {
      deleteButton.disabled = true;
      try {
        await api.deleteSupplierFeed(deleteButton.dataset.supplierFeedDelete);
        await load("Feed arxivləndi.");
      } catch (error) {
        setStatus(error.message, "error");
      } finally {
        deleteButton.disabled = false;
      }
    }
  });

  api.session()
    .then(async (session) => {
      sessionUser = session.user;
      if (!sessionUser || !["supplier", "admin", "super_admin"].includes(sessionUser.role)) {
        throw new Error("Feed-ləri idarə etmək üçün təchizatçı və ya administrator hesabı ilə daxil ol.");
      }
      await loadSuppliers();
      await load();
    })
    .catch((error) => {
      form.querySelectorAll("input, select, button").forEach((control) => {
        control.disabled = true;
      });
      setStatus(error.message, "error");
    });
})();
