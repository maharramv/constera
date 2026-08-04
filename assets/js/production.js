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
    verifyTwoFactor: (challengeToken, code) => request("/api/auth?action=verify-2fa", {
      method: "POST",
      body: JSON.stringify({ challengeToken, code })
    }),
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
    catalog: (filters = {}) => {
      const params = new URLSearchParams({ scope: "products", ...filters });
      if (!params.has("pageSize") && !params.has("limit")) params.set("pageSize", "96");
      return request(`/api/catalog?${params}`);
    },
    product: (id) => request(`/api/products?id=${encodeURIComponent(id)}&limit=1`),
    products: (ids) => request(`/api/products?ids=${encodeURIComponent(ids.join(","))}`),
    productOffers: (productId, scope = "") => request(`/api/product-offers?productId=${encodeURIComponent(productId)}${scope ? `&scope=${encodeURIComponent(scope)}` : ""}`),
    managedProductOffers: () => request("/api/product-offers?scope=manage&limit=1000"),
    saveProductOffer: (data, update = false) => request("/api/product-offers", {
      method: update ? "PATCH" : "POST",
      body: JSON.stringify(data)
    }),
    deleteProductOffer: (id) => request("/api/product-offers", {
      method: "DELETE",
      body: JSON.stringify({ id })
    }),
    landedCost: (productId, quantity, city, mode = "delivery") => {
      const params = new URLSearchParams({ productId, quantity: String(quantity), city, mode });
      return request(`/api/landed-cost?${params}`);
    },
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
    launchCenter: () => request("/api/launch-center"),
    validatePilotOrder: (data) => request("/api/launch-center", {
      method: "POST",
      body: JSON.stringify({ action: "validate-pilot", ...data })
    }),
    runLaunchDailyChecks: () => request("/api/launch-center", {
      method: "POST",
      body: JSON.stringify({ action: "run-daily-checks" })
    }),
    updateInventory: (items, supplierId = "") => request("/api/inventory", {
      method: "PATCH",
      body: JSON.stringify({ items, supplierId })
    }),
    importInventory: (source, action = "validate", supplierId = "", format = "auto") => request("/api/inventory", {
      method: "POST",
      body: JSON.stringify({ source, action, supplierId, format })
    }),
    saveSupplier: (data, update = false) => request("/api/suppliers", {
      method: update ? "PATCH" : "POST",
      body: JSON.stringify(data)
    }),
    suppliers: () => request("/api/suppliers"),
    applyAsSupplier: (data) => request("/api/suppliers?action=apply", {
      method: "POST",
      body: JSON.stringify({ action: "apply", ...data })
    }),
    supplierApplications: (status = "pending") => request(`/api/suppliers?scope=applications&status=${encodeURIComponent(status)}`),
    reviewSupplierApplication: (applicationId, action, decisionNote = "") => request("/api/suppliers", {
      method: "PATCH",
      body: JSON.stringify({ applicationId, action, decisionNote })
    }),
    account: () => request("/api/account"),
    updateAccount: (data) => request("/api/account", { method: "PATCH", body: JSON.stringify(data) }),
    analytics: () => request("/api/analytics"),
    users: () => request("/api/users?limit=500"),
    saveUser: (data, update = false) => request("/api/users", { method: update ? "PATCH" : "POST", body: JSON.stringify(data) }),
    categories: (kind = "") => request(`/api/categories?includeArchived=true${kind ? `&kind=${encodeURIComponent(kind)}` : ""}`),
    crm: () => request("/api/crm?limit=1000"),
    createCrmLead: (data) => request("/api/crm", { method: "POST", body: JSON.stringify({ action: "lead", ...data }) }),
    createCrmActivity: (data) => request("/api/crm", { method: "POST", body: JSON.stringify({ action: "activity", ...data }) }),
    contact: (data) => request("/api/contact", { method: "POST", body: JSON.stringify(data) }),
    updateCrmLead: (id, data) => request("/api/crm", { method: "PATCH", body: JSON.stringify({ id, ...data }) }),
    saveCategory: (data, update = false) => request("/api/categories", { method: update ? "PATCH" : "POST", body: JSON.stringify(data) }),
    deleteCategory: (data) => request("/api/categories", { method: "DELETE", body: JSON.stringify(data) }),
    catalogStaging: (status = "pending") => request(`/api/catalog-staging?limit=200&status=${encodeURIComponent(status)}`),
    reviewCatalogItem: (data) => request("/api/catalog-staging", { method: "PATCH", body: JSON.stringify(data) }),
    entities: (kind = "") => request(`/api/entities?limit=1000${kind ? `&kind=${encodeURIComponent(kind)}` : ""}`),
    saveEntity: (data, update = false) => request("/api/entities", { method: update ? "PATCH" : "POST", body: JSON.stringify(data) }),
    deleteEntity: (id) => request("/api/entities", { method: "DELETE", body: JSON.stringify({ id }) }),
    rfqs: () => request("/api/rfqs?limit=500"),
    updateRfq: (id, statusOrData) => request("/api/rfqs", {
      method: "PATCH",
      body: JSON.stringify({
        id,
        ...(typeof statusOrData === "string" ? { status: statusOrData } : statusOrData || {})
      })
    }),
    offers: (rfqId) => request(`/api/offers?rfqId=${encodeURIComponent(rfqId)}`),
    saveOffer: (data) => request("/api/offers", { method: "POST", body: JSON.stringify(data) }),
    updateOffer: (id, status) => request("/api/offers", {
      method: "PATCH",
      body: JSON.stringify({ id, status })
    }),
    proposals: (rfqId = "") => request(`/api/proposals?limit=500${rfqId ? `&rfqId=${encodeURIComponent(rfqId)}` : ""}`),
    proposal: (id) => request(`/api/proposals?id=${encodeURIComponent(id)}`),
    createProposal: (data) => request("/api/proposals", {
      method: "POST",
      body: JSON.stringify(data)
    }),
    updateProposal: (id, status) => request("/api/proposals", {
      method: "PATCH",
      body: JSON.stringify({ id, status })
    }),
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
    registerExternalMedia: (data) => request("/api/media", {
      method: "POST",
      body: JSON.stringify({ action: "register-external", ...data })
    }),
    updateMedia: (data) => request("/api/media", { method: "PATCH", body: JSON.stringify(data) }),
    reviewMediaRightsBatch: (ids, data) => request("/api/media", {
      method: "PATCH",
      body: JSON.stringify({ action: "review-rights-batch", ids, ...data })
    }),
    deleteMedia: (id) => request("/api/media", { method: "DELETE", body: JSON.stringify({ id }) }),
    notifications: () => request("/api/notifications?limit=200"),
    myNotifications: () => request("/api/notifications?scope=mine&limit=100"),
    pushSettings: () => request("/api/notifications?scope=push"),
    subscribePush: (subscription) => request("/api/notifications", {
      method: "POST",
      body: JSON.stringify({ action: "subscribe-push", subscription })
    }),
    unsubscribePush: (endpoint = "") => request("/api/notifications", {
      method: "POST",
      body: JSON.stringify({ action: "unsubscribe-push", endpoint })
    }),
    orders: () => request("/api/orders?limit=500"),
    order: (id) => request(`/api/orders?id=${encodeURIComponent(id)}`),
    createOrder: (data) => request("/api/orders", { method: "POST", body: JSON.stringify(data) }),
    updateOrder: (id, data) => request("/api/orders", { method: "PATCH", body: JSON.stringify({ id, ...data }) }),
    deliveryQuote: (data) => request("/api/logistics", {
      method: "POST",
      body: JSON.stringify({ action: "quote", ...data })
    }),
    logisticsZones: (manage = false) => request(`/api/logistics${manage ? "?scope=manage" : ""}`),
    saveLogisticsZone: (data, update = false) => request("/api/logistics", {
      method: update ? "PATCH" : "POST",
      body: JSON.stringify(data)
    }),
    procurement: (orderId = "") => request(`/api/procurement${orderId ? `?orderId=${encodeURIComponent(orderId)}` : "?limit=500"}`),
    requestProcurementApproval: (data) => request("/api/procurement", {
      method: "POST",
      body: JSON.stringify({ action: "request", ...data })
    }),
    decideProcurement: (id, decision, note = "") => request("/api/procurement", {
      method: "PATCH",
      body: JSON.stringify({ id, action: "decide", decision, note })
    }),
    cancelProcurement: (id) => request("/api/procurement", {
      method: "PATCH",
      body: JSON.stringify({ id, action: "cancel" })
    }),
    fulfillments: (orderId = "") => request(`/api/fulfillments?limit=500${orderId ? `&orderId=${encodeURIComponent(orderId)}` : ""}`),
    purchaseOrders: (orderId = "") => request(`/api/purchase-orders?limit=500${orderId ? `&orderId=${encodeURIComponent(orderId)}` : ""}`),
    updateFulfillment: (id, data) => request("/api/fulfillments", {
      method: "PATCH",
      body: JSON.stringify({ id, ...data })
    }),
    rentalBookings: () => request("/api/rental-bookings?limit=500"),
    rentalAvailability: (rentalId, startDate, endDate) => {
      const params = new URLSearchParams({ rentalId, startDate, endDate });
      return request(`/api/rental-bookings?${params}`);
    },
    createRentalBooking: (data) => request("/api/rental-bookings", { method: "POST", body: JSON.stringify(data) }),
    updateRentalBooking: (id, data) => request("/api/rental-bookings", {
      method: "PATCH",
      body: JSON.stringify({ id, ...data })
    }),
    integrationReadiness: () => request("/api/integrations"),
    createPayment: (orderId, idempotencyKey = "") => request("/api/integrations", {
      method: "POST",
      body: JSON.stringify({ action: "create-payment", orderId, idempotencyKey })
    }),
    submitBankTransfer: (orderId, data) => request("/api/integrations", {
      method: "POST",
      body: JSON.stringify({ action: "submit-bank-transfer", orderId, ...data })
    }),
    reviewBankTransfer: (transactionId, decision, note = "") => request("/api/integrations", {
      method: "POST",
      body: JSON.stringify({ action: "review-bank-transfer", transactionId, decision, note })
    }),
    issueElectronicInvoice: (orderId) => request("/api/integrations", {
      method: "POST",
      body: JSON.stringify({ action: "issue-invoice", orderId })
    }),
    registerInvoice: (orderId, documentUrl, reference, note = "") => request("/api/integrations", {
      method: "POST",
      body: JSON.stringify({ action: "register-invoice", orderId, documentUrl, reference, note })
    }),
    createProviderShipment: (fulfillmentId) => request("/api/integrations", {
      method: "POST",
      body: JSON.stringify({ action: "create-shipment", fulfillmentId })
    }),
    aiEstimate: (input, deterministicEstimate) => request("/api/ai", {
      method: "POST",
      body: JSON.stringify({ feature: "estimate_review", input, deterministicEstimate })
    }),
    aiDashboard: (scope = "mine") => request(`/api/ai?scope=${encodeURIComponent(scope)}&limit=50`),
    reviewAiRun: (runId, decision, note = "") => request("/api/ai", {
      method: "PATCH",
      body: JSON.stringify({ runId, decision, note })
    }),
    importEstimateDocument: (file) => request("/api/integrations", {
      method: "POST",
      body: JSON.stringify({ action: "estimate-document", ...file })
    }),
    catalogEstimate: (rows) => request("/api/integrations", {
      method: "POST",
      body: JSON.stringify({ action: "catalog-estimate", rows })
    }),
    testNotification: (channel, recipient) => request("/api/integrations", {
      method: "POST",
      body: JSON.stringify({ action: "test-notification", channel, recipient })
    }),
    reviews: (targetType, targetId) => request(`/api/reviews?targetType=${encodeURIComponent(targetType)}&targetId=${encodeURIComponent(targetId)}`),
    myReviews: () => request("/api/reviews?scope=mine&limit=100"),
    reviewModeration: () => request("/api/reviews?scope=moderation&limit=200"),
    createReview: (data) => request("/api/reviews", { method: "POST", body: JSON.stringify(data) }),
    updateReview: (data) => request("/api/reviews", { method: "PATCH", body: JSON.stringify(data) }),
    supportCases: (filters = {}) => request(`/api/support?${new URLSearchParams({ limit: "200", ...filters })}`),
    createSupportCase: (data) => request("/api/support", { method: "POST", body: JSON.stringify(data) }),
    updateSupportCase: (data) => request("/api/support", { method: "PATCH", body: JSON.stringify(data) }),
    catalogQuality: () => request("/api/catalog-quality?limit=200"),
    scanCatalogQuality: () => request("/api/catalog-quality", { method: "POST", body: "{}" }),
    previewCatalogRemediation: (issueIds = []) => request("/api/catalog-quality", {
      method: "POST",
      body: JSON.stringify({ action: "preview-remediation", issueIds })
    }),
    previewCatalogAttributes: () => request("/api/catalog-quality", {
      method: "POST",
      body: JSON.stringify({ action: "preview-attributes" })
    }),
    normalizeCatalogAttributes: () => request("/api/catalog-quality", {
      method: "POST",
      body: JSON.stringify({ action: "normalize-attributes" })
    }),
    remediateCatalogQuality: (issueIds = []) => request("/api/catalog-quality", {
      method: "POST",
      body: JSON.stringify({ action: "remediate", issueIds })
    }),
    updateCatalogQuality: (data) => request("/api/catalog-quality", { method: "PATCH", body: JSON.stringify(data) }),
    updateCatalogQualityBatch: (issueIds, action) => request("/api/catalog-quality", {
      method: "PATCH",
      body: JSON.stringify({ issueIds, action })
    }),
    supplierPerformance: () => request("/api/supplier-performance"),
    supplierFeeds: (supplierId = "") => request(`/api/supplier-feeds?limit=100${supplierId ? `&supplierId=${encodeURIComponent(supplierId)}` : ""}`),
    saveSupplierFeed: (data, update = false) => request("/api/supplier-feeds", {
      method: update ? "PATCH" : "POST",
      body: JSON.stringify(data)
    }),
    runSupplierFeed: (id) => request("/api/supplier-feeds", {
      method: "POST",
      body: JSON.stringify({ action: "run", id })
    }),
    previewSupplierFeed: (id) => request("/api/supplier-feeds", {
      method: "POST",
      body: JSON.stringify({ action: "preview", id })
    }),
    rollbackSupplierFeed: (runId) => request("/api/supplier-feeds", {
      method: "POST",
      body: JSON.stringify({ action: "rollback", runId })
    }),
    deleteSupplierFeed: (id) => request("/api/supplier-feeds", {
      method: "DELETE",
      body: JSON.stringify({ id })
    }),
    trackEvent: (data) => request("/api/events", { method: "POST", body: JSON.stringify(data) }),
    priceMonitor: () => request("/api/price-monitor"),
    scanPriceMonitor: () => request("/api/price-monitor", { method: "POST", body: "{}" }),
    remindDuePrices: () => request("/api/price-monitor", {
      method: "POST",
      body: JSON.stringify({ action: "remind-due" })
    }),
    updatePriceReview: (id, action, note = "") => request("/api/price-monitor", {
      method: "PATCH",
      body: JSON.stringify({ id, action, note })
    }),
    processNotifications: () => request("/api/notifications", { method: "POST", body: JSON.stringify({ action: "process" }) }),
    updateNotification: (id, action) => request("/api/notifications", { method: "PATCH", body: JSON.stringify({ id, action }) }),
    audit: () => request("/api/audit?limit=200"),
    cloudBackup: () => request("/api/backup"),
    operationsCenter: () => request("/api/operations-center"),
    saveSupplierContract: (data) => request("/api/operations-center", {
      method: "POST",
      body: JSON.stringify({ action: "save-contract", ...data })
    }),
    generateSupplierSettlement: (data) => request("/api/operations-center", {
      method: "POST",
      body: JSON.stringify({ action: "generate-settlement", ...data })
    }),
    updateSupplierSettlement: (data) => request("/api/operations-center", {
      method: "POST",
      body: JSON.stringify({ action: "update-settlement", ...data })
    }),
    addDeliveryTracking: (data) => request("/api/operations-center", {
      method: "POST",
      body: JSON.stringify({ action: "add-tracking", ...data })
    }),
    verifyCloudBackup: () => request("/api/operations-center", {
      method: "POST",
      body: JSON.stringify({ action: "verify-backup" })
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
    const twoFactorForm = document.querySelector("[data-two-factor-form]");
    const twoFactorChallenge = document.querySelector("[data-two-factor-challenge]");
    const twoFactorCancel = document.querySelector("[data-two-factor-cancel]");
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
    let twoFactorToken = "";

    const setStatus = (message, type = "info") => {
      status.textContent = message;
      status.dataset.type = type;
    };
    const showSession = (user) => {
      sessionPanel.hidden = !user;
      loginForm.hidden = Boolean(user) || Boolean(resetToken) || Boolean(twoFactorToken);
      if (twoFactorForm) twoFactorForm.hidden = Boolean(user) || Boolean(resetToken) || !twoFactorToken;
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
      const adminNeedsTwoFactor = ["super_admin", "admin"].includes(session.user?.role)
        && !session.user?.twoFactorEnabled;
      setStatus(session.user
        ? adminNeedsTwoFactor
          ? "Aktiv sessiya tapıldı. Kritik əməliyyatlar üçün Sistem bölməsində 2FA-nı aktivləşdir."
          : "Aktiv sessiya tapıldı."
        : resetToken
          ? "Yeni güclü şifrəni iki dəfə yaz."
          : "İdarəetmə hesabına daxil ol.", adminNeedsTwoFactor ? "warning" : "success");
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
        if (result.twoFactorRequired) {
          twoFactorToken = result.challengeToken;
          if (twoFactorChallenge) twoFactorChallenge.value = twoFactorToken;
          showSession(null);
          twoFactorForm?.elements.code?.focus();
          setStatus("Şifrə düzgündür. İndi Authenticator kodunu təsdiqlə.", "success");
          return;
        }
        showSession(result.user);
        const adminNeedsTwoFactor = ["super_admin", "admin"].includes(result.user?.role)
          && !result.user?.twoFactorEnabled;
        setStatus(
          adminNeedsTwoFactor
            ? "Giriş uğurludur. Sistem bölməsində 2FA aktivləşdirilməlidir."
            : "Giriş uğurludur. Yönləndirilirsən...",
          adminNeedsTwoFactor ? "warning" : "success"
        );
        if (result.user?.mustChangePassword || adminNeedsTwoFactor) {
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

    twoFactorForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submit = twoFactorForm.querySelector('button[type="submit"]');
      const fields = Object.fromEntries(new FormData(twoFactorForm).entries());
      setButtonBusy(submit, true, "Təsdiqlənir...");
      try {
        const result = await api.verifyTwoFactor(twoFactorToken || fields.challengeToken, fields.code);
        twoFactorToken = "";
        twoFactorForm.reset();
        showSession(result.user);
        setStatus("Təhlükəsiz giriş uğurludur. Yönləndirilirsən...", "success");
        window.setTimeout(() => window.location.assign(safeNextUrl()), 350);
      } catch (error) {
        setStatus(error.message, "error");
      } finally {
        setButtonBusy(submit, false);
      }
    });

    twoFactorCancel?.addEventListener("click", () => {
      twoFactorToken = "";
      twoFactorForm?.reset();
      showSession(null);
      setStatus("E-poçt və şifrə ilə yenidən daxil ol.", "info");
      loginForm.elements.email?.focus();
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
        window.history.replaceState({}, "", `login.html?next=${encodeURIComponent(safeNextUrl())}`);
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
        const result = await api.catalog({ limit: "1000", scope: "full" });
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
