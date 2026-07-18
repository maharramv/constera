(function initConsteraProductionLayer() {
  class ConsteraApiError extends Error {
    constructor(message, status = 0, code = "request_failed") {
      super(message);
      this.name = "ConsteraApiError";
      this.status = status;
      this.code = code;
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
        payload.error?.code
      );
    }
    return payload;
  };

  const api = {
    health: () => request("/api/health"),
    session: () => request("/api/auth?action=session"),
    login: (credentials) => request("/api/auth?action=login", { method: "POST", body: JSON.stringify(credentials) }),
    setup: (credentials) => request("/api/auth?action=setup", {
      method: "POST",
      headers: { Authorization: `Bearer ${credentials.setupToken}` },
      body: JSON.stringify(credentials)
    }),
    logout: () => request("/api/auth?action=logout", { method: "POST", body: "{}" }),
    catalog: () => request("/api/catalog?limit=1000"),
    sync: (data) => request("/api/sync", { method: "POST", body: JSON.stringify(data) }),
    createRfq: (data) => request("/api/rfqs", { method: "POST", body: JSON.stringify(data) }),
    saveProduct: (data, update = false) => request("/api/products", {
      method: update ? "PATCH" : "POST",
      body: JSON.stringify(data)
    }),
    saveSupplier: (data, update = false) => request("/api/suppliers", {
      method: update ? "PATCH" : "POST",
      body: JSON.stringify(data)
    })
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
    const status = document.querySelector("[data-auth-status]");
    const sessionPanel = document.querySelector("[data-auth-session]");
    const sessionName = document.querySelector("[data-auth-session-name]");
    const logoutButton = document.querySelector("[data-auth-logout]");
    if (!loginForm || !status) return;

    const setStatus = (message, type = "info") => {
      status.textContent = message;
      status.dataset.type = type;
    };
    const showSession = (user) => {
      sessionPanel.hidden = !user;
      loginForm.hidden = Boolean(user);
      if (setupForm) setupForm.closest("details").hidden = Boolean(user);
      if (sessionName && user) sessionName.textContent = `${user.name} · ${user.role}`;
    };

    try {
      const health = await api.health();
      if (health.database !== "ready") {
        setStatus("PostgreSQL hələ qoşulmayıb. Əvvəl Vercel Marketplace-dən Neon bazası əlavə edilməlidir.", "warning");
        return;
      }
      const session = await api.session();
      showSession(session.user);
      setStatus(session.user ? "Aktiv sessiya tapıldı." : "İdarəetmə hesabına daxil ol.", "success");
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
        window.setTimeout(() => window.location.assign(safeNextUrl()), 350);
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
