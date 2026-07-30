const count = (value) => Math.max(0, Number(value || 0));

const check = ({
  key,
  label,
  detail,
  ready,
  required = true,
  target = "",
  action = ""
}) => ({
  key,
  label,
  detail,
  ready: Boolean(ready),
  required: Boolean(required),
  target,
  action
});

const summarizeSection = (key, label, items) => ({
  key,
  label,
  ready: items.filter((item) => item.ready).length,
  total: items.length,
  blockers: items.filter((item) => item.required && !item.ready).length,
  items
});

export const buildLaunchReadiness = ({
  metrics = {},
  providers = {},
  backup = {},
  pilotCandidate = null
} = {}) => {
  const catalog = [
    check({
      key: "real_products",
      label: "Real məhsul kataloqu",
      detail: `${count(metrics.realProducts)} aktiv real məhsul`,
      ready: count(metrics.realProducts) > 0,
      target: "products",
      action: "Məhsulları aç"
    }),
    check({
      key: "eligible_listings",
      label: "Satışa tam hazır məhsullar",
      detail: `${count(metrics.eligibleProducts)} məhsul qiymət, stok, mənbə və media tələblərinə uyğundur`,
      ready: count(metrics.eligibleProducts) > 0,
      target: "overview",
      action: "Keyfiyyətə bax"
    }),
    check({
      key: "verified_offers",
      label: "Təsdiqli təchizatçı təklifləri",
      detail: `${count(metrics.eligibleOffers)} aktual və mənbəli təklif`,
      ready: count(metrics.eligibleOffers) > 0,
      target: "b2b",
      action: "Təklifləri aç"
    }),
    check({
      key: "licensed_media",
      label: "İstifadə hüququ təsdiqli media",
      detail: `${count(metrics.licensedMediaProducts)} məhsulun hüququ təsdiqli şəkli var`,
      ready: count(metrics.licensedMediaProducts) > 0,
      target: "media",
      action: "Media əlavə et"
    })
  ];

  const suppliers = [
    check({
      key: "active_suppliers",
      label: "Aktiv təchizatçılar",
      detail: `${count(metrics.activeSuppliers)} aktiv təchizatçı profili`,
      ready: count(metrics.activeSuppliers) > 0,
      target: "suppliers",
      action: "Təchizatçıları aç"
    }),
    check({
      key: "onboarded_suppliers",
      label: "Tam qoşulmuş təchizatçı",
      detail: `${count(metrics.onboardedSuppliers)} təchizatçı müqavilə və satış məlumatlarını tamamlayıb`,
      ready: count(metrics.onboardedSuppliers) > 0,
      target: "launch",
      action: "Mərhələlərə bax"
    }),
    check({
      key: "healthy_feeds",
      label: "Avtomatik qiymət və stok axını",
      detail: `${count(metrics.healthyFeeds)} sağlam məlumat axını`,
      ready: count(metrics.healthyFeeds) > 0,
      required: false,
      target: "system",
      action: "Məlumat axınlarını aç"
    })
  ];

  const commerce = [
    check({
      key: "pilot_candidate",
      label: "Pilot sifariş namizədi",
      detail: pilotCandidate
        ? `${pilotCandidate.name} real sınaq üçün seçilə bilər`
        : "Qiymət, stok, media, müqavilə və mənbəsi tam məhsul tapılmayıb",
      ready: Boolean(pilotCandidate),
      target: "launch",
      action: "Pilot yoxlaması"
    }),
    check({
      key: "logistics",
      label: "Çatdırılma tarifləri",
      detail: `${count(metrics.logisticsZones)} aktiv logistika zonası`,
      ready: count(metrics.logisticsZones) > 0,
      target: "b2b",
      action: "Logistikanı aç"
    }),
    check({
      key: "payment",
      label: "Elektron ödəniş kanalı",
      detail: providers.payment
        ? "Kart ödənişi hazırdır"
        : providers.bankTransfer
          ? "Bank köçürməsi hazırdır"
          : "Kart və bank rekvizitləri hələ qurulmayıb",
      ready: Boolean(providers.payment || providers.bankTransfer),
      required: false,
      target: "overview",
      action: "İnteqrasiyalara bax"
    }),
    check({
      key: "invoice",
      label: "Elektron qaimə inteqrasiyası",
      detail: providers.electronicInvoice
        ? "Elektron qaimə provayderi hazırdır"
        : "Manual qaimə qeydiyyatı var, provayder qoşulmayıb",
      ready: Boolean(providers.electronicInvoice),
      required: false,
      target: "operations",
      action: "Maliyyə axınını aç"
    }),
    check({
      key: "logistics_provider",
      label: "Logistika provayderi",
      detail: providers.logistics
        ? "Göndəriş provayderi hazırdır"
        : "Çatdırılma əl ilə idarə olunur",
      ready: Boolean(providers.logistics),
      required: false,
      target: "operations",
      action: "Çatdırılmanı aç"
    })
  ];

  const operations = [
    check({
      key: "backup",
      label: "İstehsal ehtiyat nüsxəsi",
      detail: backup.ready ? `${backup.label || "Bulud backup-ı"} hazırdır` : "Özəl backup kanalı qurulmayıb",
      ready: Boolean(backup.ready),
      target: "backup",
      action: "Backup-a bax"
    }),
    check({
      key: "admin_2fa",
      label: "Administrator 2FA qoruması",
      detail: `${count(metrics.adminsWithTwoFactor)} / ${count(metrics.privilegedUsers)} səlahiyyətli hesab qorunur`,
      ready: count(metrics.privilegedUsers) > 0
        && count(metrics.adminsWithTwoFactor) === count(metrics.privilegedUsers),
      target: "system",
      action: "Təhlükəsizliyi aç"
    }),
    check({
      key: "notifications",
      label: "Xarici bildiriş kanalı",
      detail: providers.email || providers.whatsapp
        ? "Ən azı bir xarici bildiriş kanalı hazırdır"
        : "Yalnız daxili bildirişlər aktivdir",
      ready: Boolean(providers.email || providers.whatsapp),
      required: false,
      target: "system",
      action: "Bildirişlərə bax"
    }),
    check({
      key: "critical_security",
      label: "Kritik təhlükəsizlik hadisələri",
      detail: count(metrics.criticalSecurityEvents)
        ? `${count(metrics.criticalSecurityEvents)} açıq yüksək riskli hadisə var`
        : "Son 30 gündə açıq kritik hadisə yoxdur",
      ready: count(metrics.criticalSecurityEvents) === 0,
      target: "operations",
      action: "Hadisələrə bax"
    })
  ];

  const sections = [
    summarizeSection("catalog", "Kataloq", catalog),
    summarizeSection("suppliers", "Təchizatçılar", suppliers),
    summarizeSection("commerce", "Satış axını", commerce),
    summarizeSection("operations", "İstehsal nəzarəti", operations)
  ];
  const items = sections.flatMap((section) => section.items);
  const maximum = items.reduce((sum, item) => sum + (item.required ? 2 : 1), 0);
  const achieved = items.reduce((sum, item) => sum + (item.ready ? (item.required ? 2 : 1) : 0), 0);
  const blockers = items.filter((item) => item.required && !item.ready);
  const warnings = items.filter((item) => !item.required && !item.ready);
  const score = maximum ? Math.round(achieved / maximum * 100) : 100;

  return {
    score,
    status: blockers.length ? "blocked" : warnings.length ? "attention" : "ready",
    blockerCount: blockers.length,
    warningCount: warnings.length,
    sections,
    priorities: [...blockers, ...warnings].slice(0, 8)
  };
};

export const buildSupplierOnboarding = (row = {}) => {
  const requiredChecks = [
    {
      key: "profile",
      label: "Profil və əlaqə",
      ready: Boolean(String(row.contact || "").trim() && String(row.website || "").startsWith("https://"))
    },
    {
      key: "account",
      label: "Təchizatçı hesabı",
      ready: count(row.supplier_user_count) > 0
    },
    {
      key: "contract",
      label: "Aktiv müqavilə",
      ready: count(row.active_contract_count) > 0
    },
    {
      key: "offer",
      label: "Aktual real təklif",
      ready: count(row.eligible_offer_count) > 0
    },
    {
      key: "media",
      label: "Hüququ təsdiqli media",
      ready: count(row.licensed_media_count) > 0
    }
  ];
  const optionalChecks = [{
    key: "feed",
    label: "Sağlam avtomatik məlumat axını",
    ready: count(row.healthy_feed_count) > 0
  }];
  const checks = [
    ...requiredChecks.map((item) => ({ ...item, required: true })),
    ...optionalChecks.map((item) => ({ ...item, required: false }))
  ];
  const maximum = requiredChecks.length * 2 + optionalChecks.length;
  const achieved = checks.reduce((sum, item) => sum + (item.ready ? (item.required ? 2 : 1) : 0), 0);
  return {
    score: maximum ? Math.round(achieved / maximum * 100) : 100,
    readyForPilot: requiredChecks.every((item) => item.ready),
    checks
  };
};
