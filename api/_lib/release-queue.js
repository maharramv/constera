const count = (value) => Math.max(0, Number(value || 0));

const qualityLabels = {
  missing_image: "Şəkli çatışmayan real məhsullar",
  unknown_stock: "Stoku dəqiqləşdirilməyən məhsullar",
  offer_unknown_stock: "Stoku dəqiqləşdirilməyən təkliflər",
  missing_source: "Mənbəsi çatışmayan məhsullar",
  stale_price: "Yenidən təsdiqlənməli qiymətlər",
  duplicate_sku: "Təkrarlanan SKU-lar",
  broken_image: "Açılmayan məhsul şəkilləri",
  broken_source: "Açılmayan qiymət mənbələri"
};

const stagingLabels = {
  product: "Gözləyən məhsul idxalı",
  service: "Gözləyən xidmət idxalı",
  package: "Gözləyən paket idxalı",
  rental: "Gözləyən icarə idxalı"
};

const severityWeight = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4
};

const queueItem = ({
  key,
  label,
  detail,
  value = 0,
  severity = "medium",
  target = "launch",
  action = "Aç",
  external = false
}) => ({
  key,
  label,
  detail,
  value: count(value),
  severity,
  target,
  action,
  external: Boolean(external)
});

export const backupVerificationState = (backup, now = Date.now()) => {
  const timestamp = backup?.createdAt || backup?.created_at;
  const parsed = timestamp ? Date.parse(timestamp) : Number.NaN;
  const ageDays = Number.isFinite(parsed)
    ? Math.max(0, Math.floor((now - parsed) / 86_400_000))
    : null;
  return {
    status: backup?.status || "missing",
    createdAt: timestamp || null,
    ageDays,
    ready: backup?.status === "verified" && ageDays !== null && ageDays <= 7
  };
};

export const buildReleaseQueue = ({
  metrics = {},
  qualityIssues = [],
  staging = [],
  searches = [],
  providers = {},
  backup = null,
  criticalTwoFactorEnforced = false
} = {}) => {
  const items = [];
  const push = (item) => {
    if (item && (item.value > 0 || item.external)) items.push(item);
  };

  for (const issue of qualityIssues) {
    const value = count(issue.count);
    push(queueItem({
      key: `quality:${issue.type}`,
      label: qualityLabels[issue.type] || `Kataloq problemi: ${issue.type}`,
      detail: `${value} açıq qeyd keyfiyyət mərkəzində yoxlanmalıdır.`,
      value,
      severity: issue.severity || "medium",
      target: "trust",
      action: "Keyfiyyəti aç"
    }));
  }

  for (const item of staging) {
    const value = count(item.count);
    push(queueItem({
      key: `staging:${item.kind}`,
      label: stagingLabels[item.kind] || "Gözləyən kataloq idxalı",
      detail: `${value} qeyd təsdiq, kateqoriya seçimi və ya rədd qərarı gözləyir.`,
      value,
      severity: item.invalidCount ? "high" : "medium",
      target: "system",
      action: "Yoxlama sahəsini aç"
    }));
  }

  const attributeGap = Math.max(0, count(metrics.realProducts) - count(metrics.structuredAttributeProducts));
  push(queueItem({
    key: "catalog:structured_attributes",
    label: "Standart texniki atribut gözləyən məhsullar",
    detail: "Ölçü, qalınlıq, həcm, güc və digər xüsusiyyətlər vahid açar-dəyər formatına keçirilməlidir.",
    value: attributeGap,
    severity: "medium",
    target: "trust",
    action: "Standartlaşdırmanı aç"
  }));

  const mediaGap = Math.max(0, count(metrics.realProducts) - count(metrics.licensedMediaProducts));
  push(queueItem({
    key: "catalog:licensed_media",
    label: "Lisenziyalı əsas şəkli çatışmayan məhsullar",
    detail: "Yalnız öz, təchizatçı, rəsmi və ya lisenziyalı media istifadəyə buraxılır.",
    value: mediaGap,
    severity: "high",
    target: "media",
    action: "Media mərkəzini aç"
  }));

  push(queueItem({
    key: "catalog:price_reviews",
    label: "Qiymət yeniləmə növbəsi",
    detail: "Köhnələn qiymətlər satışdan əvvəl mənbə ilə yenidən təsdiqlənməlidir.",
    value: metrics.pendingPriceReviews,
    severity: "high",
    target: "trust",
    action: "Qiymət monitorunu aç"
  }));

  const supplierGap = Math.max(0, count(metrics.activeSuppliers) - count(metrics.onboardedSuppliers));
  push(queueItem({
    key: "supplier:onboarding",
    label: "Pilot üçün tam qoşulmayan təchizatçılar",
    detail: "Profil, hesab, müqavilə, təklif və media mərhələləri tamamlanmalıdır.",
    value: supplierGap,
    severity: "high",
    target: "operations",
    action: "Qoşulmanı aç"
  }));

  const zeroResultSearches = searches.reduce((sum, item) => sum + count(item.zeroResults), 0);
  push(queueItem({
    key: "search:zero_results",
    label: "Nəticəsiz kataloq axtarışları",
    detail: "Sorğular sinonim, kateqoriya və məhsul boşluqlarını prioritetləşdirmək üçün toplanır.",
    value: zeroResultSearches,
    severity: "medium",
    target: "launch",
    action: "Axtarışları göstər"
  }));

  const unprotectedAdmins = Math.max(0, count(metrics.privilegedUsers) - count(metrics.adminsWithTwoFactor));
  push(queueItem({
    key: "security:admin_2fa",
    label: "2FA-sız administrator hesabları",
    detail: criticalTwoFactorEnforced
      ? "Kritik yazma əməliyyatları 2FA aktivləşdirilənədək bloklanır."
      : "Kritik əməliyyatlar üçün məcburi 2FA siyasəti aktivləşdirilməlidir.",
    value: unprotectedAdmins || (criticalTwoFactorEnforced ? 0 : 1),
    severity: unprotectedAdmins ? "critical" : "high",
    target: "system",
    action: "Təhlükəsizliyi aç"
  }));

  const backupState = backupVerificationState(backup);
  if (!backupState.ready) {
    push(queueItem({
      key: "operations:restore_verification",
      label: "Ehtiyat nüsxəsinin bərpa yoxlaması",
      detail: backupState.ageDays === null
        ? "Heç bir təsdiqli bərpa yoxlaması tapılmadı."
        : `Son yoxlama ${backupState.ageDays} gün əvvəl aparılıb.`,
      value: 1,
      severity: "critical",
      target: "backup",
      action: "Backup-ı yoxla"
    }));
  }

  for (const [key, label] of [
    ["payment", "Kart ödənişi provayderi"],
    ["electronicInvoice", "Elektron qaimə provayderi"],
    ["logistics", "Logistika provayderi"],
    ["email", "E-poçt bildiriş kanalı"],
    ["whatsapp", "WhatsApp bildiriş kanalı"]
  ]) {
    if (providers[key]) continue;
    push(queueItem({
      key: `provider:${key}`,
      label,
      detail: "Müqavilə və production giriş məlumatı təqdim edildikdə adapter aktivləşəcək.",
      value: 1,
      severity: "info",
      target: key === "logistics" || key === "electronicInvoice" ? "operations" : "system",
      action: "İnteqrasiyanı aç",
      external: true
    }));
  }

  items.sort((left, right) =>
    (severityWeight[left.severity] ?? 9) - (severityWeight[right.severity] ?? 9)
    || Number(left.external) - Number(right.external)
    || right.value - left.value
    || left.label.localeCompare(right.label, "az")
  );

  return {
    items,
    summary: {
      total: items.length,
      critical: items.filter((item) => item.severity === "critical").length,
      high: items.filter((item) => item.severity === "high").length,
      external: items.filter((item) => item.external).length
    }
  };
};
