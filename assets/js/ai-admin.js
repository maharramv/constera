(function initConsteraAiAdmin() {
  if (document.body.dataset.page !== "admin" || !window.ConstEraAPI) return;
  const root = document.querySelector("[data-ai-foundation-panel]");
  if (!root) return;

  const api = window.ConstEraAPI;
  const badge = root.querySelector("[data-ai-foundation-badge]");
  const status = root.querySelector("[data-ai-foundation-status]");
  const metrics = root.querySelector("[data-ai-foundation-metrics]");
  const configuration = root.querySelector("[data-ai-foundation-config]");
  const rows = root.querySelector("[data-ai-foundation-runs]");
  const refreshButton = root.querySelector("[data-ai-foundation-refresh]");
  let loading = false;

  const escapeHtml = (value) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
  const formatDate = (value) => {
    const date = new Date(value);
    return Number.isFinite(date.getTime())
      ? new Intl.DateTimeFormat("az-AZ", { dateStyle: "medium", timeStyle: "short" }).format(date)
      : "-";
  };
  const number = (value) => Number(value || 0).toLocaleString("az-AZ");
  const percent = (value) => `${Math.round(Number(value || 0) * 100)}%`;
  const featureLabels = {
    estimate_review: "Smeta yoxlaması",
    estimate_document: "Smeta sənədi",
    catalog_enrichment: "Kataloq zənginləşdirilməsi",
    rfq_draft: "RFQ qaralaması",
    offer_comparison: "Təklif müqayisəsi"
  };
  const approvalLabels = {
    pending: "Təsdiq gözləyir",
    approved: "Təsdiqlənib",
    rejected: "Rədd edilib",
    not_required: "Təsdiq tələb etmir"
  };

  const setStatus = (message, type = "info") => {
    if (!status) return;
    status.textContent = message;
    status.dataset.type = type;
  };

  const render = (data) => {
    const readiness = data.readiness || {};
    const limits = data.limits || {};
    const usage = data.usage || {};
    const summary = data.summary || {};
    if (badge) {
      badge.textContent = readiness.ready ? "AI hazırdır" : "AI qurulmayıb";
      badge.className = `status-pill ${readiness.ready ? "is-success" : "is-danger"}`;
    }
    if (metrics) {
      metrics.innerHTML = [
        [summary.total, "cəmi AI işi"],
        [summary.pending, "təsdiq gözləyən"],
        [summary.failed, "uğursuz"],
        [summary.totalTokens, "istifadə olunan token"]
      ].map(([value, label]) => `<article><strong>${number(value)}</strong><span>${escapeHtml(label)}</span></article>`).join("");
    }
    if (configuration) {
      configuration.innerHTML = `
        <div><span>Provayder</span><strong>${escapeHtml(readiness.provider === "openai" ? "OpenAI" : readiness.provider === "webhook" ? "Ehtiyat webhook" : "Qurulmayıb")}</strong></div>
        <div><span>Model</span><strong>${escapeHtml(readiness.model || "-")}</strong></div>
        <div><span>Strukturlaşdırılmış cavab</span><strong>${readiness.structuredOutput ? "Aktiv" : "Yalnız webhook"}</strong></div>
        <div><span>İnsan təsdiqi</span><strong>${readiness.humanApproval ? "Məcburidir" : "Deaktiv"}</strong></div>
        <div><span>Gündəlik istifadə, cəmi</span><strong>${number(usage.dailyRequests)} · limit ${number(limits.dailyRequests)}/istifadəçi</strong></div>
        <div><span>Aylıq sorğu, cəmi</span><strong>${number(usage.monthlyRequests)} · limit ${number(limits.monthlyRequests)}/istifadəçi</strong></div>
        <div><span>Aylıq token, cəmi</span><strong>${number(usage.monthlyTokens)} · limit ${number(limits.monthlyTokens)}/istifadəçi</strong></div>
        <div><span>Saxlanma müddəti</span><strong>${number(limits.retentionDays)} gün</strong></div>
      `;
    }
    if (rows) {
      rows.innerHTML = (data.runs || []).map((run) => `
        <tr>
          <td data-label="Vaxt"><strong>${escapeHtml(formatDate(run.createdAt))}</strong><small>${escapeHtml(run.id)}</small></td>
          <td data-label="İstifadəçi">${escapeHtml(run.userName || run.userId || "-")}</td>
          <td data-label="Funksiya"><strong>${escapeHtml(featureLabels[run.feature] || run.feature)}</strong><small>${escapeHtml(run.provider)} · ${escapeHtml(run.model || "-")}</small></td>
          <td data-label="İstifadə">${number(run.totalTokens)} token</td>
          <td data-label="Etibar">${run.confidence === null ? "-" : percent(run.confidence)}</td>
          <td data-label="Vəziyyət"><span class="status-pill">${escapeHtml(run.status === "failed" ? "Uğursuz" : run.status === "running" ? "Emal olunur" : approvalLabels[run.approvalStatus] || run.status)}</span></td>
          <td data-label="Əməliyyat">${run.approvalStatus === "pending" ? `
            <div class="admin-v2-row-actions">
              <button class="table-action" type="button" data-ai-review="approve" data-run-id="${escapeHtml(run.id)}">Təsdiqlə</button>
              <button class="table-action is-danger" type="button" data-ai-review="reject" data-run-id="${escapeHtml(run.id)}">Rədd et</button>
            </div>
          ` : "-"}</td>
        </tr>
      `).join("") || '<tr><td colspan="7">Hələ AI işi yoxdur.</td></tr>';
    }
    setStatus(readiness.ready
      ? "OpenAI server tərəfdə aktivdir. Nəticələr strukturlaşdırılır, limitlənir və təsdiqdən əvvəl qaralama kimi saxlanılır."
      : "OpenAI açarı production mühitində qurulmayıb; AI funksiyaları bağlıdır.", readiness.ready ? "success" : "warning");
  };

  const refresh = async () => {
    if (loading) return;
    loading = true;
    if (refreshButton) refreshButton.disabled = true;
    setStatus("AI idarəetmə məlumatları yüklənir...");
    try {
      const response = await api.aiDashboard("all");
      render(response.data || {});
    } catch (error) {
      setStatus(error.message || "AI idarəetmə məlumatları alınmadı.", "error");
    } finally {
      loading = false;
      if (refreshButton) refreshButton.disabled = false;
    }
  };

  root.addEventListener("click", async (event) => {
    const reviewButton = event.target.closest("[data-ai-review]");
    if (!reviewButton) return;
    const decision = reviewButton.dataset.aiReview;
    const note = decision === "reject"
      ? window.prompt("Rədd səbəbini yaz:", "Məlumat ekspert yoxlaması tələb edir.")
      : "Administrator tərəfindən yoxlanıldı.";
    if (decision === "reject" && note === null) return;
    reviewButton.disabled = true;
    try {
      await api.reviewAiRun(reviewButton.dataset.runId, decision, note || "");
      await refresh();
    } catch (error) {
      setStatus(error.message || "AI nəticəsi yoxlanmadı.", "error");
    } finally {
      reviewButton.disabled = false;
    }
  });
  refreshButton?.addEventListener("click", refresh);
  document.querySelector('[data-admin-tab="system"]')?.addEventListener("click", refresh);

  api.session().then((session) => {
    if (["super_admin", "admin"].includes(session.user?.role)) refresh();
  }).catch(() => {});
})();
