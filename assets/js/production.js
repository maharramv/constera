(function initConsteraProductionLayer() {
  class ConsteraApiError extends Error {
    constructor(message, status = 0, code = "request_failed", details = null) {
      super(message);
      this.name = "ConsteraApiError";
      this.status = status;
      this.code = code;
      this.details = details;
    }
  }

  const request = async (path, options = {}) => {
    const response = await fetch(path, {
      credentials: "same-origin",
      ...options,
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {})
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new ConsteraApiError(
        payload.error?.message || "Server sorğunu tamamlaya bilmədi.",
        response.status,
        payload.error?.code,
        payload.error?.details || null
      );
    }
    return payload;
  };

  const api = {
    request,
    health: () => request("/api/health"),
    session: () => request("/api/auth?action=session"),
    login: (credentials) => request("/api/auth?action=login", { method: "POST", body: JSON.stringify(credentials) }),
    requestPasswordReset: (email) => request("/api/auth?action=request-reset", {
      method: "POST",
      body: JSON.stringify({ email })
    }),
    resetPassword: (token, password) => request("/api/auth?action=reset-password", {
      method: "POST",
      body: JSON.stringify({ token, password })
    }),
    setup: (credentials) => request("/api/auth?action=setup", {
      method: "POST",
      headers: { Authorization: `Bearer ${credentials.setupToken}` },
      body: JSON.stringify(credentials)
    }),
    logout: () => request("/api/auth?action=logout", { method: "POST", body: "{}" }),
    cabinet: () => request("/api/cabinet"),
    syncSavedProducts: (listType, productIds) => request("/api/cabinet", {
      method: "POST",
      body: JSON.stringify({ action: "sync-list", listType, productIds })
    }),
    saveProject: (data) => request("/api/cabinet", {
      method: "POST",
      body: JSON.stringify({ action: "save-project", ...data })
    }),
    deleteProject: (id) => request("/api/cabinet", {
      method: "DELETE",
      body: JSON.stringify({ action: "delete-project", id })
    }),
    saveEstimate: (data) => request("/api/cabinet", {
      method: "POST",
      body: JSON.stringify({ action: "save-estimate", ...data })
    }),
    syncEstimates: (estimates) => request("/api/cabinet", {
      method: "POST",
      body: JSON.stringify({ action: "sync-estimates", estimates })
    }),
    deleteEstimate: (id) => request("/api/cabinet", {
      method: "DELETE",
      body: JSON.stringify({ action: "delete-estimate", id })
    }),
    catalog: (filters = { limit: "1000" }) => {
      const params = new URLSearchParams(filters);
      return request(`/api/catalog?${params}`);
    },
    product: (id) => request(`/api/products?id=${encodeURIComponent(id)}&limit=1`),
    sync: (data) => request("/api/sync", { method: "POST", body: JSON.stringify(data) }),
    createRfq: (data) => request("/api/rfqs", { method: "POST", body: JSON.stringify(data) }),
    saveProduct: (data, update = false) => request("/api/products", {
      method: update ? "PATCH" : "POST",
      body: JSON.stringify(data)
    }),
    myProducts: () => request("/api/products?scope=mine&limit=1000"),
    inventory: (filters = {}) => {
      const params = new URLSearchParams({ limit: "1000", ...filters });
      return request(`/api/inventory?${params}`);
    },
    updateInventory: (items, supplierId = "") => request("/api/inventory", {
      method: "PATCH",
      body: JSON.stringify({ items, supplierId })
    }),
    saveSupplier: (data, update = false) => request("/api/suppliers", {
      method: update ? "PATCH" : "POST",
      body: JSON.stringify(data)
    }),
    account: () => request("/api/account"),
    updateAccount: (data) => request("/api/account", { method: "PATCH", body: JSON.stringify(data) }),
    analytics: () => request("/api/analytics"),
    users: () => request("/api/users?limit=500"),
    saveUser: (data, update = false) => request("/api/users", { method: update ? "PATCH" : "POST", body: JSON.stringify(data) }),
    categories: (kind = "") => request(`/api/categories?includeArchived=true${kind ? `&kind=${encodeURIComponent(kind)}` : ""}`),
    saveCategory: (data, update = false) => request("/api/categories", { method: update ? "PATCH" : "POST", body: JSON.stringify(data) }),
    deleteCategory: (data) => request("/api/categories", { method: "DELETE", body: JSON.stringify(data) }),
    entities: (kind = "") => request(`/api/entities?limit=1000${kind ? `&kind=${encodeURIComponent(kind)}` : ""}`),
    saveEntity: (data, update = false) => request("/api/entities", { method: update ? "PATCH" : "POST", body: JSON.stringify(data) }),
    deleteEntity: (id) => request("/api/entities", { method: "DELETE", body: JSON.stringify({ id }) }),
    rfqs: () => request("/api/rfqs?limit=500"),
    updateRfq: (id, status) => request("/api/rfqs", { method: "PATCH", body: JSON.stringify({ id, status }) }),
    tenders: () => request("/api/tenders?limit=500"),
    saveTender: (data, update = false) => request("/api/tenders", { method: update ? "PATCH" : "POST", body: JSON.stringify(data) }),
    deleteTender: (id) => request("/api/tenders", { method: "DELETE", body: JSON.stringify({ id }) }),
    tenderBids: (tenderId = "") => request(`/api/tender-bids?limit=500${tenderId ? `&tenderId=${encodeURIComponent(tenderId)}` : ""}`),
    saveTenderBid: (data, update = false) => request("/api/tender-bids", { method: update ? "PATCH" : "POST", body: JSON.stringify(data) }),
    imports: () => request("/api/imports?limit=100"),
    runImport: (data) => request("/api/imports", { method: "POST", body: JSON.stringify(data) }),
    media: (filters = {}) => {
      const params = new URLSearchParams({ limit: "500", ...filters });
      return request(`/api/media?${params}`);
    },
    uploadMedia: (data) => request("/api/media", { method: "POST", body: JSON.stringify(data) }),
    deleteMedia: (id) => request("/api/media", { method: "DELETE", body: JSON.stringify({ id }) }),
    notifications: () => request("/api/notifications?limit=200"),
    orders: () => request("/api/orders?limit=500"),
    createOrder: (data) => request("/api/orders", { method: "POST", body: JSON.stringify(data) }),
    updateOrder: (id, data) => request("/api/orders", { method: "PATCH", body: JSON.stringify({ id, ...data }) }),
    processNotifications: () => request("/api/notifications", { method: "POST", body: JSON.stringify({ action: "process" }) }),
    updateNotification: (id, action) => request("/api/notifications", { method: "PATCH", body: JSON.stringify({ id, action }) }),
    audit: () => request("/api/audit?limit=200"),
    cloudBackup: () => request("/api/backup")
  };
  window.ConstEraAPI = api;

  const safeNextUrl = () => {
    const value = new URLSearchParams(window.location.search).get("next") || "admin.html";
    return /^[a-z0-9-]+\.html(?:\?[^#]*)?$/i.test(value) ? value : "admin.html";
  };

  const setButtonBusy = (button, busy, busyText) => {
    if (!button) return;
    if (busy) {
      button.dataset.originalText = button.textContent;
      button.textContent = busyText;
    } else if (button.dataset.originalText) {
      button.textContent = button.dataset.originalText;
    }
    button.disabled = busy;
  };

  const initLogin = async () => {
    const loginForm = document.querySelector("[data-login-form]");
    const setupForm = document.querySelector("[data-setup-form]");
    const resetRequestForm = document.querySelector("[data-password-reset-request-form]");
    const resetForm = document.querySelector("[data-password-reset-form]");
    const recoveryPanel = document.querySelector("[data-password-recovery]");
    const resetTokenInput = document.querySelector("[data-password-reset-token]");
    const status = document.querySelector("[data-auth-status]");
    const sessionPanel = document.querySelector("[data-auth-session]");
    const sessionName = document.querySelector("[data-auth-session-name]");
    const logoutButton = document.querySelector("[data-auth-logout]");
    if (!loginForm || !status) return;
    let resetToken = new URLSearchParams(window.location.search).get("reset") || "";

    const setStatus = (message, type = "info") => {
      status.textContent = message;
      status.dataset.type = type;
    };
    const showSession = (user) => {
      sessionPanel.hidden = !user;
      loginForm.hidden = Boolean(user) || Boolean(resetToken);
      if (recoveryPanel) recoveryPanel.hidden = Boolean(user) || Boolean(resetToken);
      if (resetForm) resetForm.hidden = Boolean(user) || !resetToken;
      if (resetTokenInput) resetTokenInput.value = resetToken;
      if (setupForm) setupForm.closest("details").hidden = Boolean(user) || Boolean(resetToken);
      if (sessionName && user) sessionName.textContent = `${user.name} · ${user.role}`;
    };
    showSession(null);

    try {
      const health = await api.health();
      if (health.database !== "ready") {
        setStatus("PostgreSQL hələ qoşulmayıb. Əvvəl Vercel Marketplace-dən Neon bazası əlavə edilməlidir.", "warning");
        return;
      }
      const session = await api.session();
      showSession(session.user);
      setStatus(session.user
        ? "Aktiv sessiya tapıldı."
        : resetToken
          ? "Yeni güclü şifrəni iki dəfə yaz."
          : "İdarəetmə hesabına daxil ol.", "success");
    } catch (error) {
      setStatus(error.message || "API hazırda əlçatan deyil.", "warning");
    }

    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submit = loginForm.querySelector('button[type="submit"]');
      setButtonBusy(submit, true, "Yoxlanılır...");
      try {
        const fields = Object.fromEntries(new FormData(loginForm).entries());
        const result = await api.login(fields);
        showSession(result.user);
        setStatus("Giriş uğurludur. Yönləndirilirsən...", "success");
        if (result.user?.mustChangePassword) {
          try {
            localStorage.setItem("constera-admin-active-tab", "system");
          } catch {
            // Tab yaddaşı könüllüdür.
          }
        }
        window.setTimeout(() => window.location.assign(safeNextUrl()), 350);
      } catch (error) {
        setStatus(error.message, "error");
      } finally {
        setButtonBusy(submit, false);
      }
    });

    resetRequestForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submit = resetRequestForm.querySelector('button[type="submit"]');
      setButtonBusy(submit, true, "Göndərilir...");
      try {
        const fields = Object.fromEntries(new FormData(resetRequestForm).entries());
        const result = await api.requestPasswordReset(fields.email);
        resetRequestForm.reset();
        setStatus(result.message || "Hesab mövcuddursa, bərpa təlimatı göndərildi.", "success");
      } catch (error) {
        setStatus(error.message, "error");
      } finally {
        setButtonBusy(submit, false);
      }
    });

    resetForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submit = resetForm.querySelector('button[type="submit"]');
      const fields = Object.fromEntries(new FormData(resetForm).entries());
      if (fields.password !== fields.confirmPassword) {
        setStatus("Yeni şifrələr eyni olmalıdır.", "error");
        return;
      }
      setButtonBusy(submit, true, "Yenilənir...");
      try {
        const result = await api.resetPassword(fields.token, fields.password);
        resetToken = "";
        window.history.replaceState({}, "", "login.html");
        resetForm.reset();
        showSession(null);
        setStatus(result.message || "Şifrə yeniləndi.", "success");
      } catch (error) {
        setStatus(error.message, "error");
      } finally {
        setButtonBusy(submit, false);
      }
    });

    setupForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submit = setupForm.querySelector('button[type="submit"]');
      setButtonBusy(submit, true, "Yaradılır...");
      try {
        const fields = Object.fromEntries(new FormData(setupForm).entries());
        const result = await api.setup(fields);
        showSession(result.user);
        setStatus("İlk super administrator yaradıldı.", "success");
      } catch (error) {
        setStatus(error.message, "error");
      } finally {
        setButtonBusy(submit, false);
      }
    });

    logoutButton?.addEventListener("click", async () => {
      await api.logout().catch(() => null);
      showSession(null);
      setStatus("Sessiya bağlandı.", "success");
    });
  };

  const initCloudPanel = async () => {
    const panel = document.querySelector("[data-cloud-panel]");
    const status = document.querySelector("[data-cloud-status]");
    const userLabel = document.querySelector("[data-cloud-user]");
    const pushButton = document.querySelector("[data-cloud-push]");
    const pullButton = document.querySelector("[data-cloud-pull]");
    const logoutButton = document.querySelector("[data-cloud-logout]");
    if (!panel || !status) return;

    const setStatus = (message, type = "info") => {
      status.textContent = message;
      status.dataset.type = type;
    };
    const setControls = (enabled) => {
      if (pushButton) pushButton.disabled = !enabled;
      if (pullButton) pullButton.disabled = !enabled;
      if (logoutButton) logoutButton.hidden = !enabled;
    };

    setControls(false);
    try {
      const health = await api.health();
      if (health.database !== "ready") {
        setStatus("Lokal rejim aktivdir. PostgreSQL qoşulduqdan sonra bulud sinxronizasiyası açılacaq.", "warning");
        return;
      }
      const session = await api.session();
      const allowed = ["super_admin", "admin"].includes(session.user?.role);
      if (!allowed) {
        setStatus("Baza hazırdır. Sinxronizasiya üçün administrator hesabına daxil ol.", "warning");
        if (userLabel) userLabel.innerHTML = '<a href="login.html?next=admin.html">Daxil ol</a>';
        return;
      }
      setControls(true);
      if (userLabel) userLabel.textContent = `${session.user.name} · ${session.user.role}`;
      setStatus("PostgreSQL və administrator sessiyası hazırdır.", "success");
    } catch (error) {
      setStatus("API əlçatan deyil. Lokal idarəetmə rejimi işləməyə davam edir.", "warning");
    }

    pushButton?.addEventListener("click", async () => {
      const data = window.CONSTERA_MARKETPLACE || {};
      setButtonBusy(pushButton, true, "Yazılır...");
      setStatus("Kataloq PostgreSQL bazasına yazılır. Səhifəni bağlama.");
      try {
        const result = await api.sync({
          categories: data.categories || [],
          serviceCategories: data.serviceCategories || [],
          packageCategories: data.packageCategories || [],
          rentalCategories: data.rentalCategories || [],
          suppliers: data.suppliers || [],
          products: data.products || [],
          services: data.services || [],
          packages: data.packages || [],
          rentals: data.rentals || []
        });
        const total = Object.values(result.data || {}).reduce((sum, value) => sum + Number(value || 0), 0);
        setStatus(`${total.toLocaleString("az-AZ")} qeyd PostgreSQL bazası ilə sinxronlaşdırıldı.`, "success");
      } catch (error) {
        setStatus(error.message, "error");
      } finally {
        setButtonBusy(pushButton, false);
      }
    });

    pullButton?.addEventListener("click", async () => {
      setButtonBusy(pullButton, true, "Oxunur...");
      try {
        const result = await api.catalog();
        const data = result.data || {};
        localStorage.setItem("constera-admin-products", JSON.stringify(data.products || []));
        localStorage.setItem("constera-admin-suppliers", JSON.stringify(data.suppliers || []));
        localStorage.setItem("constera-admin-services", JSON.stringify(data.services || []));
        localStorage.setItem("constera-admin-packages", JSON.stringify(data.packages || []));
        localStorage.setItem("constera-admin-rentals", JSON.stringify(data.rentals || []));
        setStatus("Bulud məlumatları brauzerə yükləndi. Səhifə yenilənir.", "success");
        window.setTimeout(() => window.location.reload(), 400);
      } catch (error) {
        setStatus(error.message, "error");
        setButtonBusy(pullButton, false);
      }
    });

    logoutButton?.addEventListener("click", async () => {
      await api.logout().catch(() => null);
      setControls(false);
      if (userLabel) userLabel.innerHTML = '<a href="login.html?next=admin.html">Daxil ol</a>';
      setStatus("Sessiya bağlandı. Lokal rejim aktivdir.", "warning");
    });
  };

  initLogin();
  initCloudPanel();
})();
