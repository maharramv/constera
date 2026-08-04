const DAY_MS = 86_400_000;

export const PROCUREMENT_PHASES = Object.freeze([
  Object.freeze({ key: "structure", title: "Bünövrə və konstruksiya", startRatio: 0, durationRatio: 0.34, leadTimeDays: 14 }),
  Object.freeze({ key: "envelope", title: "Qapalı kontur", startRatio: 0.22, durationRatio: 0.28, leadTimeDays: 21 }),
  Object.freeze({ key: "mep", title: "MEP sistemləri", startRatio: 0.4, durationRatio: 0.3, leadTimeDays: 21 }),
  Object.freeze({ key: "finishes", title: "Tamamlama", startRatio: 0.64, durationRatio: 0.36, leadTimeDays: 14 }),
  Object.freeze({ key: "general", title: "Ümumi", startRatio: 0.08, durationRatio: 0.72, leadTimeDays: 10 })
]);

const text = (value, maximum = 600) => String(value ?? "").trim().slice(0, maximum);
const boundedNumber = (value, fallback, minimum, maximum) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
};
const unique = (items, limit = 100) => [...new Set(items.filter(Boolean))].slice(0, limit);
const phaseByTitle = new Map(PROCUREMENT_PHASES.map((phase) => [phase.title, phase]));
const phaseByKey = new Map(PROCUREMENT_PHASES.map((phase) => [phase.key, phase]));

const parseDate = (value) => {
  const source = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(source)) return null;
  const date = new Date(`${source}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === source ? date : null;
};

const dateString = (date) => date.toISOString().slice(0, 10);
const addDays = (date, days) => new Date(date.getTime() + Math.round(days) * DAY_MS);
const differenceInDays = (later, earlier) => Math.round((later.getTime() - earlier.getTime()) / DAY_MS);

const safeProjectStart = (value) => parseDate(value) || addDays(new Date(), 7);
const chunks = (items, size) => Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
  items.slice(index * size, (index + 1) * size));

export const prepareProcurementEstimateRows = (estimate = {}) => {
  const selectedRows = (Array.isArray(estimate?.rows) ? estimate.rows : [])
    .filter((row) => row?.included !== false && Number(row?.quantity || 0) > 0)
    .slice(0, 120);
  const seenKeys = new Set();
  return selectedRows.map((row, index) => {
    let planRowKey = text(row?.key || `material-${index + 1}`, 120);
    if (seenKeys.has(planRowKey)) planRowKey = `${planRowKey}-${index + 1}`.slice(0, 120);
    seenKeys.add(planRowKey);
    return { ...row, planRowKey };
  });
};

const rowBudget = (row) => {
  const source = row?.catalog?.lineTotal;
  if (source === null || source === undefined || source === "") return null;
  const amount = Number(source);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) / 100 : null;
};

const waveRisk = (rows, unpricedCount) => {
  const criticalities = rows.map((row) => text(row?.criticality, 40).toLocaleLowerCase("az-AZ"));
  if (criticalities.some((value) => value === "yüksək") || unpricedCount > rows.length / 2) return "high";
  if (criticalities.some((value) => value === "orta") || unpricedCount > 0) return "medium";
  return "low";
};

export const buildDeterministicProcurementPlan = ({ estimate = {}, projectStartDate = "", durationDays = 150 } = {}) => {
  const startDate = safeProjectStart(projectStartDate);
  const safeDuration = Math.round(boundedNumber(durationDays, 150, 30, 730));
  const endDate = addDays(startDate, safeDuration - 1);
  const selectedRows = prepareProcurementEstimateRows(estimate);
  const rowsByPhase = new Map(PROCUREMENT_PHASES.map((phase) => [phase.key, []]));
  selectedRows.forEach((row) => {
    const phase = phaseByTitle.get(text(row?.phase, 120)) || phaseByKey.get(text(row?.phaseKey, 80)) || phaseByKey.get("general");
    rowsByPhase.get(phase.key).push(row);
  });

  let sequence = 0;
  const waves = PROCUREMENT_PHASES.flatMap((phase) => {
    const phaseRows = rowsByPhase.get(phase.key) || [];
    const phaseChunks = chunks(phaseRows, 20);
    return phaseChunks.map((rows, chunkIndex) => {
      sequence += 1;
      const phaseStart = addDays(startDate, Math.round(safeDuration * phase.startRatio) + chunkIndex * 3);
      const phaseDuration = Math.max(7, Math.round(safeDuration * phase.durationRatio));
      const phaseEnd = addDays(phaseStart, phaseDuration - 1);
      const amounts = rows.map(rowBudget);
      const knownAmounts = amounts.filter((amount) => amount !== null);
      const unpricedCount = rows.length - knownAmounts.length;
      const budget = knownAmounts.length
        ? Math.round(knownAmounts.reduce((sum, amount) => sum + amount, 0) * 100) / 100
        : null;
      const suffix = phaseChunks.length > 1 ? ` · dalğa ${chunkIndex + 1}` : "";
      return {
        key: `${phase.key}-${chunkIndex + 1}`,
        phaseKey: phase.key,
        title: `${phase.title}${suffix}`,
        sequence,
        startDate: dateString(phaseStart),
        endDate: dateString(phaseEnd > endDate ? endDate : phaseEnd),
        needByDate: dateString(addDays(phaseStart, -phase.leadTimeDays)),
        leadTimeDays: phase.leadTimeDays,
        budget,
        currency: text(estimate?.catalogPricing?.currency || "AZN", 3).toUpperCase(),
        riskLevel: waveRisk(rows, unpricedCount),
        rowKeys: rows.map((row) => row.planRowKey),
        rowCount: rows.length,
        unpricedCount,
        included: true,
        status: "planned",
        reason: "Deterministik tikinti ardıcıllığı və material mərhələsi əsasında hesablanıb.",
        checks: unpricedCount ? [`${unpricedCount} mövqe üçün qiymət təchizatçı sorğusu ilə dəqiqləşdirilməlidir.`] : []
      };
    });
  });

  const pricedBudget = waves.reduce((sum, wave) => sum + Number(wave.budget || 0), 0);
  const unpricedRows = waves.reduce((sum, wave) => sum + wave.unpricedCount, 0);
  return {
    projectStartDate: dateString(startDate),
    targetEndDate: dateString(endDate),
    durationDays: safeDuration,
    currency: text(estimate?.catalogPricing?.currency || "AZN", 3).toUpperCase(),
    totalBudget: Math.round(pricedBudget * 100) / 100,
    pricedRows: selectedRows.length - unpricedRows,
    unpricedRows,
    selectedRows: selectedRows.length,
    summary: `${selectedRows.length} material mövqeyi ${waves.length} satınalma dalğasına bölündü.`,
    warnings: unpricedRows ? [`${unpricedRows} mövqenin təsdiqli qiyməti yoxdur.`] : [],
    waves
  };
};

const safeSuggestedDate = (value, fallback, minimum, maximum) => {
  const candidate = parseDate(value);
  if (!candidate || candidate < minimum || candidate > maximum) return fallback;
  return candidate;
};

export const normalizeAiProcurementPlan = ({ plan = {}, baseline = {} } = {}) => {
  const allowedWaves = new Map((Array.isArray(baseline?.waves) ? baseline.waves : []).map((wave) => [wave.key, wave]));
  const suggestions = new Map((Array.isArray(plan?.waves) ? plan.waves : [])
    .map((wave) => [text(wave?.key, 120), wave])
    .filter(([key]) => allowedWaves.has(key)));
  const projectStart = parseDate(baseline.projectStartDate) || safeProjectStart("");
  const targetEnd = parseDate(baseline.targetEndDate) || addDays(projectStart, 149);
  const minimumDate = addDays(projectStart, -120);
  const maximumDate = addDays(targetEnd, 60);
  const waves = [...allowedWaves.values()].map((wave) => {
    const suggestion = suggestions.get(wave.key) || {};
    const fallbackStart = parseDate(wave.startDate) || projectStart;
    const suggestedStart = safeSuggestedDate(suggestion.startDate, fallbackStart, projectStart, maximumDate);
    const fallbackEnd = parseDate(wave.endDate) || suggestedStart;
    let suggestedEnd = safeSuggestedDate(suggestion.endDate, fallbackEnd, suggestedStart, maximumDate);
    if (suggestedEnd < suggestedStart) suggestedEnd = suggestedStart;
    const leadTimeDays = Math.round(boundedNumber(suggestion.leadTimeDays, wave.leadTimeDays, 1, 90));
    const fallbackNeedBy = addDays(suggestedStart, -leadTimeDays);
    let needBy = safeSuggestedDate(suggestion.needByDate, fallbackNeedBy, minimumDate, suggestedStart);
    if (needBy > suggestedStart) needBy = fallbackNeedBy;
    const riskLevel = ["low", "medium", "high"].includes(suggestion.riskLevel)
      ? suggestion.riskLevel
      : wave.riskLevel;
    return {
      ...wave,
      startDate: dateString(suggestedStart),
      endDate: dateString(suggestedEnd),
      needByDate: dateString(needBy),
      leadTimeDays,
      riskLevel,
      reason: text(suggestion.reason || wave.reason, 600),
      checks: unique([
        ...(Array.isArray(wave.checks) ? wave.checks : []),
        ...(Array.isArray(suggestion.checks) ? suggestion.checks.map((item) => text(item, 300)) : [])
      ], 8)
    };
  });
  const confidence = boundedNumber(plan?.confidence, 0.6, 0, 1);
  return {
    output: {
      ...baseline,
      summary: text(plan?.summary || baseline.summary, 1_000),
      confidence,
      warnings: unique([
        ...(Array.isArray(baseline?.warnings) ? baseline.warnings : []),
        ...(Array.isArray(plan?.warnings) ? plan.warnings.map((item) => text(item, 400)) : [])
      ], 16),
      waves
    },
    confidence,
    warnings: unique((Array.isArray(plan?.warnings) ? plan.warnings.map((item) => text(item, 400)) : []), 16)
  };
};

export const procurementPlanDurationDays = (startDate, endDate) => {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  return start && end && end >= start ? differenceInDays(end, start) + 1 : 0;
};
