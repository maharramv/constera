const count = (value) => Math.max(0, Number(value || 0));
const cappedProgress = (current, target) => target > 0
  ? Math.min(100, Math.round(count(current) / target * 100))
  : 100;

export const commercialLaunchTargets = Object.freeze({
  suppliers: 3,
  products: 100,
  customers: 10,
  completedOrders: 1
});

const milestone = ({ key, label, current, target, targetTab, action }) => ({
  key,
  label,
  current: count(current),
  target,
  progress: cappedProgress(current, target),
  ready: count(current) >= target,
  targetTab,
  action
});

const control = ({ key, label, detail, ready, targetTab, action }) => ({
  key,
  label,
  detail,
  ready: Boolean(ready),
  targetTab,
  action
});

export const buildCommercialLaunchProgram = ({
  metrics = {},
  providers = {},
  backup = {},
  monitoring = {},
  assortment = []
} = {}) => {
  const milestones = [
    milestone({
      key: "suppliers",
      label: "Pilot təchizatçıları",
      current: metrics.onboardedSuppliers,
      target: commercialLaunchTargets.suppliers,
      targetTab: "launch",
      action: "Qoşulmanı tamamla"
    }),
    milestone({
      key: "products",
      label: "Satışa tam hazır assortiment",
      current: metrics.eligibleProducts,
      target: commercialLaunchTargets.products,
      targetTab: "trust",
      action: "Məhsulları hazırla"
    }),
    milestone({
      key: "customers",
      label: "Son 90 gündə aktiv pilot müştəriləri",
      current: metrics.pilotEngagedCustomers,
      target: commercialLaunchTargets.customers,
      targetTab: "crm",
      action: "Pilot müştəriləri aç"
    }),
    milestone({
      key: "completed_orders",
      label: "Tamamlanmış pilot sifarişi",
      current: metrics.completedOrders,
      target: commercialLaunchTargets.completedOrders,
      targetTab: "requests",
      action: "Sifariş axınını aç"
    })
  ];

  const controls = [
    control({
      key: "admin_2fa",
      label: "Administrator 2FA",
      detail: `${count(metrics.adminsWithTwoFactor)} / ${count(metrics.privilegedUsers)} səlahiyyətli hesab qorunur`,
      ready: count(metrics.privilegedUsers) > 0
        && count(metrics.adminsWithTwoFactor) === count(metrics.privilegedUsers)
        && Boolean(metrics.criticalTwoFactorEnforced),
      targetTab: "system",
      action: "2FA-nı tamamla"
    }),
    control({
      key: "logistics_tariff",
      label: "Təsdiqlənmiş logistika tarifi",
      detail: `${count(metrics.verifiedLogisticsZones)} mənbəli və etibarlı zona`,
      ready: count(metrics.verifiedLogisticsZones) > 0,
      targetTab: "b2b",
      action: "Tarifləri təsdiqlə"
    }),
    control({
      key: "backup",
      label: "Bərpası yoxlanmış backup",
      detail: backup.recentVerified ? "Son 7 gündə bərpa yoxlaması aparılıb" : "Yeni bərpa yoxlaması tələb olunur",
      ready: Boolean(backup.ready && backup.recentVerified),
      targetTab: "backup",
      action: "Backup-ı yoxla"
    }),
    control({
      key: "monitoring",
      label: "Xarici production monitoru",
      detail: monitoring.externalAlert
        ? "Webhook xəbərdarlığı aktivdir"
        : monitoring.scheduledWorkflow ? "GitHub incident monitoru aktivdir" : "Xarici xəbərdarlıq qurulmayıb",
      ready: Boolean(monitoring.externalAlert || monitoring.scheduledWorkflow),
      targetTab: "system",
      action: "Monitoru aç"
    }),
    control({
      key: "security_events",
      label: "Kritik təhlükəsizlik hadisəsi yoxdur",
      detail: count(metrics.criticalSecurityEvents)
        ? `${count(metrics.criticalSecurityEvents)} açıq yüksək riskli hadisə var`
        : "Son 30 gündə açıq yüksək riskli hadisə yoxdur",
      ready: count(metrics.criticalSecurityEvents) === 0,
      targetTab: "operations",
      action: "Hadisələri aç"
    })
  ];

  const optionalControls = [
    control({
      key: "notifications",
      label: "Müştəri bildiriş kanalı",
      detail: providers.email || providers.whatsapp ? "Ən azı bir xarici kanal aktivdir" : "E-poçt və WhatsApp qurulmayıb",
      ready: Boolean(providers.email || providers.whatsapp),
      targetTab: "system",
      action: "Bildirişləri qur"
    }),
    control({
      key: "payment",
      label: "Avtomatlaşdırılmış ödəniş kanalı",
      detail: providers.payment || providers.bankTransfer ? "Ödəniş adapteri aktivdir" : "Pilot hesab-faktura rejimində işləyəcək",
      ready: Boolean(providers.payment || providers.bankTransfer),
      targetTab: "overview",
      action: "Ödənişi qur"
    }),
    control({
      key: "electronic_invoice",
      label: "Elektron qaimə",
      detail: providers.electronicInvoice ? "Elektron qaimə adapteri aktivdir" : "Qaimə manual qeydiyyata düşəcək",
      ready: Boolean(providers.electronicInvoice),
      targetTab: "operations",
      action: "Qaiməni qur"
    })
  ];

  const controlsReady = controls.every((item) => item.ready);
  const pilotMinimumReady = controlsReady
    && count(metrics.onboardedSuppliers) > 0
    && count(metrics.eligibleProducts) > 0
    && count(metrics.pilotEngagedCustomers) > 0;
  const canGoLive = controlsReady && milestones.every((item) => item.ready);
  const milestoneScore = milestones.reduce((sum, item) => sum + item.progress, 0) / milestones.length;
  const controlScore = controls.filter((item) => item.ready).length / controls.length * 100;
  const score = Math.round(milestoneScore * 0.6 + controlScore * 0.4);
  const decision = canGoLive ? "go" : pilotMinimumReady ? "pilot" : "no_go";
  const phase = canGoLive
    ? "live"
    : pilotMinimumReady
      ? "pilot"
      : controlsReady ? "preparation" : "foundation";
  const blockers = [
    ...controls.filter((item) => !item.ready).map((item) => ({ ...item, type: "control" })),
    ...milestones.filter((item) => !item.ready).map((item) => ({
      ...item,
      type: "milestone",
      detail: `${item.current} / ${item.target} tamamlanıb`
    }))
  ];
  const assortmentItems = Array.isArray(assortment) ? assortment.slice(0, commercialLaunchTargets.products) : [];

  return {
    decision,
    phase,
    score,
    canStartPilot: pilotMinimumReady,
    canGoLive,
    targets: commercialLaunchTargets,
    milestones,
    controls,
    optionalControls,
    blockers,
    assortment: {
      target: commercialLaunchTargets.products,
      readyCount: assortmentItems.filter((item) => item.ready).length,
      reviewCount: assortmentItems.filter((item) => !item.ready).length,
      items: assortmentItems
    }
  };
};
