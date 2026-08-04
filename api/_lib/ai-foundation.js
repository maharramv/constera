import { createHash, randomUUID } from "node:crypto";
import { assertCriticalTwoFactor } from "./auth.js";
import { query, recordAudit } from "./db.js";
import { ApiError } from "./http.js";
import {
  createOpenAiCatalogAdvice,
  createOpenAiEstimate,
  createOpenAiRfqDraft,
  openAiConfiguration
} from "./openai.js";
import { generateProviderEstimate } from "./provider-adapters.js";

const allRoles = ["super_admin", "admin", "sales", "supplier", "customer"];
const elevatedRoles = ["super_admin", "admin"];

export const AI_FEATURE_POLICIES = Object.freeze({
  estimate_review: Object.freeze({ roles: allRoles, requiresApproval: true, label: "Smeta yoxlaması" }),
  estimate_document: Object.freeze({ roles: allRoles, requiresApproval: true, label: "Smeta sənədinin oxunması" }),
  catalog_enrichment: Object.freeze({ roles: allRoles, requiresApproval: true, label: "AI kataloq məsləhətçisi" }),
  rfq_draft: Object.freeze({ roles: allRoles, requiresApproval: true, label: "RFQ qaralaması" })
});

const boundedInteger = (name, fallback, minimum, maximum) => {
  const value = Number.parseInt(String(process.env[name] || ""), 10);
  return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;
};

const boundedRate = (name) => {
  const source = String(process.env[name] || "").trim();
  if (!source) return null;
  const value = Number(source);
  return Number.isFinite(value) && value >= 0 ? value : null;
};

export const aiLimits = () => ({
  dailyRequests: boundedInteger("AI_DAILY_REQUEST_LIMIT", 20, 1, 2_000),
  monthlyRequests: boundedInteger("AI_MONTHLY_REQUEST_LIMIT", 200, 1, 50_000),
  monthlyTokens: boundedInteger("AI_MONTHLY_TOKEN_BUDGET", 2_000_000, 10_000, 2_000_000_000),
  maxOutputTokens: openAiConfiguration().maxOutputTokens,
  retentionDays: boundedInteger("AI_RETENTION_DAYS", 30, 1, 365)
});

export const aiReadiness = () => {
  const direct = openAiConfiguration();
  let legacyWebhook = false;
  try {
    legacyWebhook = Boolean(
      process.env.AI_ESTIMATE_WEBHOOK_SECRET
      && new URL(process.env.AI_ESTIMATE_WEBHOOK_URL || "").protocol === "https:"
    );
  } catch {
    legacyWebhook = false;
  }
  return {
    ready: direct.ready || legacyWebhook,
    provider: direct.ready ? "openai" : legacyWebhook ? "webhook" : "none",
    model: direct.ready ? direct.model : legacyWebhook ? "xarici-webhook" : null,
    keyConfigured: direct.keyConfigured,
    legacyWebhookConfigured: legacyWebhook,
    structuredOutput: direct.ready,
    humanApproval: true
  };
};

export const assertAiFeatureAccess = (user, feature) => {
  const policy = AI_FEATURE_POLICIES[feature];
  if (!policy) throw new ApiError(400, "unsupported_ai_feature", "Bu AI funksiyası dəstəklənmir.");
  if (!user || !policy.roles.includes(user.role)) {
    throw new ApiError(403, "ai_permission_denied", "Bu AI funksiyası üçün icazən yoxdur.");
  }
  return policy;
};

const text = (value, maximum = 1_000) => String(value ?? "").trim().slice(0, maximum);
const number = (value, fallback = 0, minimum = 0, maximum = 1_000_000_000) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
};
const httpsUrl = (value) => {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? url.toString().slice(0, 1_500) : "";
  } catch {
    return "";
  }
};
const unique = (items, limit = 100) => [...new Set(items.filter(Boolean))].slice(0, limit);

const sourceCatalog = (estimate) => {
  const sources = new Map();
  const add = (product) => {
    const id = text(product?.id, 160);
    if (!id || sources.has(id)) return;
    sources.set(id, {
      id,
      title: text(product?.name || product?.title || id, 240),
      label: text(product?.sourceLabel || product?.brand || "ConstEra kataloqu", 160),
      url: httpsUrl(product?.sourceUrl || product?.url)
    });
  };
  for (const row of Array.isArray(estimate?.rows) ? estimate.rows.slice(0, 120) : []) {
    add(row?.catalog?.selected);
    for (const product of Array.isArray(row?.products) ? row.products.slice(0, 5) : []) add(product);
  }
  return [...sources.values()].slice(0, 300);
};

const sanitizeRow = (row, index) => ({
  key: text(row?.key || `material-${index + 1}`, 120),
  title: text(row?.title || `Material ${index + 1}`, 240),
  category: text(row?.category || "Material", 160),
  unit: text(row?.unit || "ədəd", 40),
  quantity: number(row?.quantity, 1, 0.001, 1_000_000_000),
  baseQuantity: number(row?.baseQuantity || row?.quantity, 1, 0.001, 1_000_000_000),
  confidence: text(row?.confidence || "Orta", 40),
  sourceIds: unique([
    row?.catalog?.selected?.id,
    ...(Array.isArray(row?.products) ? row.products.map((product) => product?.id) : [])
  ].map((id) => text(id, 160)), 10)
});

const sanitizeEstimate = (estimate) => ({
  projectType: text(estimate?.projectType, 80),
  projectLabel: text(estimate?.projectLabel, 240),
  area: number(estimate?.area, 0, 0, 10_000_000),
  floors: number(estimate?.floors, 0, 0, 500),
  rooms: number(estimate?.rooms, 0, 0, 10_000),
  wetZones: number(estimate?.wetZones, 0, 0, 10_000),
  scope: text(estimate?.scope, 80),
  finishLevel: text(estimate?.finishLevel, 80),
  complexity: text(estimate?.complexity, 80),
  city: text(estimate?.city, 160),
  wastePercent: number(estimate?.wastePercent, 0, 0, 35),
  deliveryPercent: number(estimate?.deliveryPercent, 0, 0, 25),
  laborPercent: number(estimate?.laborPercent, 0, 0, 80),
  riskReserve: number(estimate?.riskReserve, 0, 0, 35),
  note: text(estimate?.note, 4_000),
  rows: (Array.isArray(estimate?.rows) ? estimate.rows : []).slice(0, 120).map(sanitizeRow)
});

const sanitizeInput = (input) => {
  const allowed = [
    "projectType", "area", "floors", "rooms", "wetZones", "scope", "finishLevel",
    "complexity", "city", "wastePercent", "deliveryPercent", "laborPercent", "docType", "note", "instruction"
  ];
  return Object.fromEntries(allowed.map((key) => [key, typeof input?.[key] === "number"
    ? number(input[key])
    : text(input?.[key], key === "note" || key === "instruction" ? 4_000 : 240)]));
};

const sanitizeDocument = (input, feature) => {
  if (feature !== "estimate_document" || !input?.document) return null;
  const fileName = text(input.document.fileName, 240);
  const mimeType = text(input.document.mimeType, 160).toLowerCase();
  const contentBase64 = String(input.document.contentBase64 || "").trim();
  if (!fileName || mimeType !== "application/pdf" || !/^[a-zA-Z0-9+/=\r\n]+$/.test(contentBase64)) {
    throw new ApiError(400, "invalid_ai_document", "AI sənədi düzgün PDF formatında deyil.");
  }
  const approximateBytes = Math.floor(contentBase64.replace(/\s/g, "").length * 0.75);
  if (approximateBytes > 1_500_000) {
    throw new ApiError(413, "ai_document_too_large", "AI sənədi maksimum 1,5 MB ola bilər.");
  }
  return { fileName, mimeType, contentBase64 };
};

export const prepareAiEstimateRequest = ({ feature, input, deterministicEstimate }) => {
  const estimate = sanitizeEstimate(deterministicEstimate || {});
  const sources = sourceCatalog(deterministicEstimate || {});
  const document = sanitizeDocument(input, feature);
  const context = {
    projectInput: sanitizeInput(input || {}),
    deterministicEstimate: estimate,
    allowedSources: sources
  };
  const contextBytes = Buffer.byteLength(JSON.stringify(context), "utf8");
  const documentBytes = document ? Math.floor(document.contentBase64.replace(/\s/g, "").length * 0.75) : 0;
  const maximum = feature === "estimate_document" ? 1_650_000 : 120_000;
  if (contextBytes + documentBytes > maximum) {
    throw new ApiError(413, "ai_request_too_large", "AI sorğusunun həcmi icazə verilən limiti keçir.");
  }
  return { context, document, sources, requestBytes: contextBytes + documentBytes };
};

const confidenceScore = (value, fallback = 0.5) => {
  if (typeof value === "string") {
    const normalized = value.trim().toLocaleLowerCase("az-AZ");
    if (["yüksək", "high"].includes(normalized)) return 0.85;
    if (["orta", "medium"].includes(normalized)) return 0.6;
    if (["aşağı", "low"].includes(normalized)) return 0.35;
  }
  return number(value, fallback, 0, 1);
};

const confidenceLabel = (score) => score >= 0.75 ? "Yüksək" : score >= 0.5 ? "Orta" : "Aşağı";

export const normalizeAiEstimate = ({ estimate, fallbackEstimate = {}, allowedSources = [] }) => {
  const allowed = new Map(allowedSources.map((source) => [source.id, source]));
  const fallbackRows = Array.isArray(fallbackEstimate?.rows) ? fallbackEstimate.rows : [];
  const rows = (Array.isArray(estimate?.rows) ? estimate.rows : []).slice(0, 120).map((row, index) => {
    const fallback = fallbackRows.find((item) => text(item?.key, 120) === text(row?.key, 120))
      || fallbackRows[index]
      || {};
    const score = confidenceScore(row?.confidence, confidenceScore(fallback?.confidence));
    return {
      key: text(row?.key || fallback?.key || `material-${index + 1}`, 120),
      title: text(row?.title || fallback?.title || `Material ${index + 1}`, 240),
      quantity: number(row?.quantity, number(fallback?.quantity, 1, 0.001), 0.001, 1_000_000_000),
      unit: text(row?.unit || fallback?.unit || "ədəd", 40),
      category: text(row?.category || fallback?.category || "Material", 160),
      reasoning: text(row?.reasoning, 600),
      confidence: confidenceLabel(score),
      confidenceScore: score,
      keywords: unique([
        text(row?.key || fallback?.key, 120),
        text(row?.title || fallback?.title, 240),
        text(row?.category || fallback?.category, 160)
      ], 6),
      sourceIds: unique((Array.isArray(row?.sourceIds) ? row.sourceIds : [])
        .map((id) => text(id, 160))
        .filter((id) => allowed.has(id)), 10)
    };
  }).filter((row) => row.title && row.quantity > 0);
  if (!rows.length) throw new ApiError(502, "invalid_ai_estimate", "AI smeta material sətirlərini qaytarmadı.");

  const usedSourceIds = unique(rows.flatMap((row) => row.sourceIds), 300);
  const confidence = confidenceScore(estimate?.confidence, rows.reduce((sum, row) => sum + row.confidenceScore, 0) / rows.length);
  return {
    estimate: {
      summary: text(estimate?.summary || "AI smetanı yoxladı. Nəticə ekspert təsdiqi gözləyir.", 1_000),
      confidence,
      riskReserve: number(estimate?.riskReserve, number(fallbackEstimate?.riskReserve, 10, 0, 35), 0, 35),
      warnings: unique((Array.isArray(estimate?.warnings) ? estimate.warnings : []).map((item) => text(item, 400)), 12),
      rows
    },
    sources: usedSourceIds.map((id) => allowed.get(id)).filter(Boolean)
  };
};

const sanitizeCatalogCandidate = (candidate) => ({
  id: text(candidate?.id, 160),
  title: text(candidate?.name || candidate?.title, 240),
  sku: text(candidate?.sku, 160),
  brand: text(candidate?.brand, 160),
  category: text(candidate?.category, 160),
  subcategory: text(candidate?.subcategory, 200),
  package: text(candidate?.package, 160),
  origin: text(candidate?.origin, 160),
  price: text(candidate?.price || "Sorğu əsasında", 160),
  priceAmount: candidate?.priceAmount === null || candidate?.priceAmount === undefined
    ? null
    : number(candidate.priceAmount, 0, 0),
  priceCurrency: text(candidate?.priceCurrency || "AZN", 12),
  priceStatus: text(candidate?.priceStatus || "request", 40),
  priceVerifiedAt: text(candidate?.priceVerifiedAt, 40),
  availability: text(candidate?.availability || "Sorğu əsasında", 160),
  stockQuantity: candidate?.stockQuantity === null || candidate?.stockQuantity === undefined
    ? null
    : number(candidate.stockQuantity, 0, 0),
  sourceLabel: text(candidate?.sourceLabel || candidate?.brand || "ConstEra kataloqu", 160),
  sourceUrl: httpsUrl(candidate?.sourceUrl),
  specs: unique((Array.isArray(candidate?.specs) ? candidate.specs : []).map((item) => text(item, 240)), 12)
});

const catalogSource = (candidate) => ({
  id: candidate.id,
  title: candidate.title,
  label: candidate.sourceLabel,
  url: candidate.sourceUrl,
  sku: candidate.sku,
  brand: candidate.brand,
  category: candidate.category,
  subcategory: candidate.subcategory,
  package: candidate.package,
  price: candidate.price,
  priceAmount: candidate.priceAmount,
  priceCurrency: candidate.priceCurrency,
  priceStatus: candidate.priceStatus,
  priceVerifiedAt: candidate.priceVerifiedAt,
  availability: candidate.availability,
  stockQuantity: candidate.stockQuantity,
  origin: candidate.origin,
  specs: candidate.specs
});

const prepareCatalogProducts = (candidates) => (Array.isArray(candidates) ? candidates : [])
  .slice(0, 24)
  .map(sanitizeCatalogCandidate)
  .filter((candidate) => candidate.id && candidate.title);

const assertPreparedSize = (context, maximum = 120_000) => {
  const requestBytes = Buffer.byteLength(JSON.stringify(context), "utf8");
  if (requestBytes > maximum) {
    throw new ApiError(413, "ai_request_too_large", "AI sorğusunun həcmi icazə verilən limiti keçir.");
  }
  return requestBytes;
};

export const prepareAiCatalogAdviceRequest = ({ input = {}, candidates = [] }) => {
  const allowedProducts = prepareCatalogProducts(candidates);
  if (!allowedProducts.length) {
    throw new ApiError(404, "ai_catalog_candidates_not_found", "Sorğuya uyğun mənbəli kataloq namizədi tapılmadı.");
  }
  const context = {
    request: {
      prompt: text(input.prompt, 2_000),
      hints: unique((Array.isArray(input.hints) ? input.hints : []).map((item) => text(item, 160)), 10)
    },
    allowedProducts
  };
  return {
    context,
    document: null,
    sources: allowedProducts.map(catalogSource),
    requestBytes: assertPreparedSize(context)
  };
};

export const normalizeAiCatalogAdvice = ({ advice, allowedSources = [] }) => {
  const allowed = new Map(allowedSources.map((source) => [source.id, source]));
  const seen = new Set();
  const recommendations = (Array.isArray(advice?.recommendations) ? advice.recommendations : [])
    .slice(0, 16)
    .map((recommendation) => {
      const productId = text(recommendation?.productId, 160);
      const source = allowed.get(productId);
      if (!source || seen.has(productId)) return null;
      seen.add(productId);
      return {
        productId,
        title: source.title,
        reason: text(recommendation?.reason, 600),
        fitScore: confidenceScore(recommendation?.fitScore, 0.5),
        suggestedQuantity: number(recommendation?.suggestedQuantity, 0, 0, 1_000_000_000),
        suggestedUnit: text(recommendation?.suggestedUnit, 40)
      };
    })
    .filter(Boolean)
    .slice(0, 8);
  if (!recommendations.length) {
    throw new ApiError(502, "invalid_ai_catalog_advice", "AI icazəli kataloq məhsullarından seçim qaytarmadı.");
  }
  const sources = recommendations.map((recommendation) => allowed.get(recommendation.productId));
  return {
    output: {
      summary: text(advice?.summary || "Uyğun kataloq seçimləri hazırlandı. Nəticə istifadəçi təsdiqi gözləyir.", 1_000),
      confidence: confidenceScore(advice?.confidence, recommendations.reduce((sum, item) => sum + item.fitScore, 0) / recommendations.length),
      questions: unique((Array.isArray(advice?.questions) ? advice.questions : []).map((item) => text(item, 400)), 8),
      warnings: unique((Array.isArray(advice?.warnings) ? advice.warnings : []).map((item) => text(item, 400)), 12),
      recommendations
    },
    confidence: confidenceScore(advice?.confidence, 0.5),
    sources,
    warnings: unique((Array.isArray(advice?.warnings) ? advice.warnings : []).map((item) => text(item, 400)), 12)
  };
};

export const prepareAiRfqDraftRequest = ({ input = {}, candidates = [] }) => {
  const allowedProducts = prepareCatalogProducts(candidates);
  const context = {
    request: {
      prompt: text(input.prompt, 4_000),
      city: text(input.city, 160),
      needDate: text(input.needDate, 10),
      budget: text(input.budget, 160),
      deliveryMode: text(input.deliveryMode, 200),
      priority: text(input.priority || "Normal", 80),
      usage: text(input.usage, 600)
    },
    allowedProducts
  };
  return {
    context,
    document: null,
    sources: allowedProducts.map(catalogSource),
    requestBytes: assertPreparedSize(context)
  };
};

const RFQ_PRIORITIES = new Set(["Normal", "Təcili", "Tender", "Qiymət müqayisəsi"]);

export const normalizeAiRfqDraft = ({ draft, allowedSources = [] }) => {
  const allowed = new Map(allowedSources.map((source) => [source.id, source]));
  const items = (Array.isArray(draft?.items) ? draft.items : [])
    .slice(0, 20)
    .map((item, index) => {
      const requestedId = text(item?.productId, 160);
      const source = allowed.get(requestedId);
      const productId = source ? requestedId : "";
      const title = source?.title || text(item?.title || `Sorğu mövqeyi ${index + 1}`, 240);
      return {
        productId,
        title,
        quantity: number(item?.quantity, 1, 0.001, 1_000_000_000),
        unit: text(item?.unit || "ədəd", 40),
        specs: unique((Array.isArray(item?.specs) ? item.specs : []).map((spec) => text(spec, 300)), 20)
      };
    })
    .filter((item) => item.title && item.quantity > 0);
  if (!items.length) throw new ApiError(502, "invalid_ai_rfq_draft", "AI RFQ üçün material sətri qaytarmadı.");
  const sourceIds = unique(items.map((item) => item.productId), 20);
  const warnings = unique((Array.isArray(draft?.warnings) ? draft.warnings : []).map((item) => text(item, 400)), 12);
  const confidence = confidenceScore(draft?.confidence, 0.5);
  return {
    output: {
      title: text(draft?.title || items[0].title, 300),
      summary: text(draft?.summary || "RFQ qaralaması hazırlandı. Göndərməzdən əvvəl məlumatları yoxla.", 1_000),
      confidence,
      priority: RFQ_PRIORITIES.has(draft?.priority) ? draft.priority : "Normal",
      needDate: /^\d{4}-\d{2}-\d{2}$/.test(String(draft?.needDate || "")) ? String(draft.needDate) : "",
      budget: text(draft?.budget, 160),
      deliveryMode: text(draft?.deliveryMode, 200),
      usage: text(draft?.usage, 600),
      note: text(draft?.note, 3_000),
      warnings,
      items
    },
    confidence,
    sources: sourceIds.map((id) => allowed.get(id)).filter(Boolean),
    warnings
  };
};

export const estimateAiCost = (usage) => {
  const inputRate = boundedRate("AI_INPUT_USD_PER_1M");
  const outputRate = boundedRate("AI_OUTPUT_USD_PER_1M");
  if (inputRate === null || outputRate === null) return null;
  return Math.round(((Number(usage?.inputTokens || 0) * inputRate
    + Number(usage?.outputTokens || 0) * outputRate) / 1_000_000) * 100_000_000) / 100_000_000;
};

const tokenReservation = (requestBytes, limits) => Math.min(
  limits.monthlyTokens,
  Math.max(1, Math.ceil(requestBytes / 3) + limits.maxOutputTokens)
);

const reserveUsage = async (userId, reservedTokens, limits) => {
  const rows = await query(
    `INSERT INTO ai_usage_counters (
       user_id, daily_period, daily_requests, monthly_period, monthly_requests, monthly_tokens, updated_at
     ) VALUES ($1, current_date, 1, date_trunc('month', current_date)::date, 1, $2, now())
     ON CONFLICT (user_id) DO UPDATE SET
       daily_period = current_date,
       daily_requests = CASE
         WHEN ai_usage_counters.daily_period = current_date THEN ai_usage_counters.daily_requests + 1
         ELSE 1
       END,
       monthly_period = date_trunc('month', current_date)::date,
       monthly_requests = CASE
         WHEN ai_usage_counters.monthly_period = date_trunc('month', current_date)::date THEN ai_usage_counters.monthly_requests + 1
         ELSE 1
       END,
       monthly_tokens = CASE
         WHEN ai_usage_counters.monthly_period = date_trunc('month', current_date)::date THEN ai_usage_counters.monthly_tokens + $2
         ELSE $2
       END,
       updated_at = now()
     WHERE
       (CASE WHEN ai_usage_counters.daily_period = current_date THEN ai_usage_counters.daily_requests + 1 ELSE 1 END) <= $3
       AND (CASE WHEN ai_usage_counters.monthly_period = date_trunc('month', current_date)::date THEN ai_usage_counters.monthly_requests + 1 ELSE 1 END) <= $4
       AND (CASE WHEN ai_usage_counters.monthly_period = date_trunc('month', current_date)::date THEN ai_usage_counters.monthly_tokens + $2 ELSE $2 END) <= $5
     RETURNING daily_period, daily_requests, monthly_period, monthly_requests, monthly_tokens`,
    [userId, reservedTokens, limits.dailyRequests, limits.monthlyRequests, limits.monthlyTokens]
  );
  if (rows[0]) return rows[0];
  const current = (await query(
    `SELECT daily_period, daily_requests, monthly_period, monthly_requests, monthly_tokens
       FROM ai_usage_counters WHERE user_id = $1 LIMIT 1`,
    [userId]
  ))[0] || {};
  throw new ApiError(429, "ai_quota_exceeded", "AI istifadə limiti tamamlanıb.", {
    usage: current,
    limits
  });
};

const settleUsage = async (userId, reservedTokens, actualTokens) => {
  await query(
    `UPDATE ai_usage_counters
        SET monthly_tokens = greatest(0, monthly_tokens - $2 + $3), updated_at = now()
      WHERE user_id = $1 AND monthly_period = date_trunc('month', current_date)::date`,
    [userId, reservedTokens, Math.max(0, Number(actualTokens || 0))]
  );
};

const runSummary = (row) => ({
  id: row.id,
  userId: row.user_id,
  userName: row.user_name || null,
  feature: row.feature,
  provider: row.provider,
  model: row.model,
  status: row.status,
  confidence: row.confidence === null ? null : Number(row.confidence),
  totalTokens: Number(row.total_tokens || 0),
  estimatedCostUsd: row.estimated_cost_usd === null ? null : Number(row.estimated_cost_usd),
  approvalStatus: row.approval_status,
  reviewedBy: row.reviewed_by || null,
  reviewedAt: row.reviewed_at || null,
  reviewNote: row.review_note || "",
  sources: Array.isArray(row.sources) ? row.sources : [],
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  expiresAt: row.expires_at
});

const purgeExpiredRuns = async () => {
  await query("DELETE FROM ai_runs WHERE expires_at <= now()");
};

const runGovernedAiGeneration = async ({
  user,
  feature,
  prepared,
  promptVersion,
  readiness,
  generate,
  normalize
}) => {
  const policy = assertAiFeatureAccess(user, feature);
  if (!readiness?.ready) throw new ApiError(503, "ai_not_configured", "AI provayderi hələ qoşulmayıb.");
  await purgeExpiredRuns();

  const limits = aiLimits();
  const reservedTokens = tokenReservation(prepared.requestBytes, limits);
  await reserveUsage(user.id, reservedTokens, limits);

  const runId = `air-${randomUUID()}`;
  const documentFingerprint = prepared.document ? {
    fileName: prepared.document.fileName,
    mimeType: prepared.document.mimeType,
    contentHash: createHash("sha256")
      .update(prepared.document.contentBase64.replace(/\s/g, ""))
      .digest("hex")
  } : null;
  const inputHash = createHash("sha256")
    .update(JSON.stringify({ feature, context: prepared.context, document: documentFingerprint }))
    .digest("hex");
  const expiresAt = new Date(Date.now() + limits.retentionDays * 86_400_000).toISOString();
  let runCreated = false;
  let usageSettled = false;
  let billableTokens = 0;
  try {
    await query(
      `INSERT INTO ai_runs (
         id, user_id, company_id, feature, provider, model, status, input_hash, prompt_version,
         request_bytes, reserved_tokens, requires_approval, approval_status, expires_at
       ) VALUES ($1, $2, $3, $4, $5, $6, 'running', $7, $8, $9, $10, $11, $12, $13)`,
      [
        runId, user.id, user.companyId || null, feature, readiness.provider, readiness.model,
        inputHash, promptVersion, prepared.requestBytes, reservedTokens, policy.requiresApproval,
        policy.requiresApproval ? "pending" : "not_required", expiresAt
      ]
    );
    runCreated = true;

    const providerResult = await generate(runId);

    billableTokens = Math.max(0, Number(providerResult.usage?.totalTokens || 0));
    const normalized = normalize(providerResult);
    const usage = providerResult.usage || { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    const cost = estimateAiCost(usage);
    const responseBytes = Buffer.byteLength(JSON.stringify(normalized.output), "utf8");
    await settleUsage(user.id, reservedTokens, usage.totalTokens);
    usageSettled = true;
    await query(
      `UPDATE ai_runs SET
         provider = $2, model = $3, status = 'completed', response_bytes = $4,
         input_tokens = $5, output_tokens = $6, total_tokens = $7,
         estimated_cost_usd = $8, confidence = $9, sources = $10::jsonb,
         output = $11::jsonb, updated_at = now()
       WHERE id = $1`,
      [
        runId, providerResult.provider, providerResult.model, responseBytes,
        usage.inputTokens, usage.outputTokens, usage.totalTokens, cost,
        normalized.confidence, JSON.stringify(normalized.sources), JSON.stringify(normalized.output)
      ]
    );
    await recordAudit({
      actorId: user.id,
      action: "generate",
      entityType: "ai_run",
      entityId: runId,
      details: { feature, provider: providerResult.provider, totalTokens: usage.totalTokens, approvalStatus: policy.requiresApproval ? "pending" : "not_required" }
    });
    return {
      runId,
      output: normalized.output,
      confidence: normalized.confidence,
      sources: normalized.sources,
      warnings: normalized.warnings,
      provider: providerResult.provider,
      model: providerResult.model,
      usage,
      approval: {
        required: policy.requiresApproval,
        status: policy.requiresApproval ? "pending" : "not_required"
      }
    };
  } catch (error) {
    if (!usageSettled) await settleUsage(user.id, reservedTokens, billableTokens).catch(() => {});
    if (runCreated) {
      await query(
        `UPDATE ai_runs SET status = 'failed', approval_status = 'not_required', error_code = $2, error_text = $3, updated_at = now() WHERE id = $1`,
        [runId, text(error?.code || "ai_generation_failed", 120), text(error?.message || "AI sorğusu uğursuz oldu.", 500)]
      ).catch(() => {});
      await recordAudit({
        actorId: user.id,
        action: "fail",
        entityType: "ai_run",
        entityId: runId,
        details: { feature, code: text(error?.code || "ai_generation_failed", 120) }
      }).catch(() => {});
    }
    throw error;
  }
};

export const generateAiEstimate = async ({ user, feature = "estimate_review", input = {}, deterministicEstimate = {} }) => {
  const readiness = aiReadiness();
  const prepared = prepareAiEstimateRequest({ feature, input, deterministicEstimate });
  const result = await runGovernedAiGeneration({
    user,
    feature,
    prepared,
    promptVersion: "estimate-v1",
    readiness,
    generate: async (runId) => readiness.provider === "openai"
      ? createOpenAiEstimate({
        requestId: runId,
        feature,
        context: prepared.context,
        document: prepared.document
      })
      : {
        provider: "webhook",
        model: "xarici-webhook",
        estimate: await generateProviderEstimate({
          requestId: runId,
          input: prepared.context.projectInput,
          deterministicEstimate: prepared.context.deterministicEstimate
        }),
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
      },
    normalize: (providerResult) => {
      const normalized = normalizeAiEstimate({
        estimate: providerResult.estimate,
        fallbackEstimate: deterministicEstimate,
        allowedSources: prepared.sources
      });
      return {
        output: normalized.estimate,
        confidence: normalized.estimate.confidence,
        sources: normalized.sources,
        warnings: normalized.estimate.warnings
      };
    }
  });
  const { output, ...metadata } = result;
  return { ...metadata, estimate: output };
};

const directOpenAiReadiness = () => {
  const configuration = openAiConfiguration();
  return {
    ready: configuration.ready,
    provider: configuration.ready ? "openai" : "none",
    model: configuration.ready ? configuration.model : null
  };
};

export const generateAiCatalogAdvice = async ({ user, input = {}, candidates = [] }) => {
  const feature = "catalog_enrichment";
  const prepared = prepareAiCatalogAdviceRequest({ input, candidates });
  const result = await runGovernedAiGeneration({
    user,
    feature,
    prepared,
    promptVersion: "catalog-advice-v1",
    readiness: directOpenAiReadiness(),
    generate: (runId) => createOpenAiCatalogAdvice({ requestId: runId, context: prepared.context }),
    normalize: (providerResult) => normalizeAiCatalogAdvice({
      advice: providerResult.advice,
      allowedSources: prepared.sources
    })
  });
  const { output, ...metadata } = result;
  return { ...metadata, advice: output };
};

export const generateAiRfqDraft = async ({ user, input = {}, candidates = [] }) => {
  const feature = "rfq_draft";
  const prepared = prepareAiRfqDraftRequest({ input, candidates });
  const result = await runGovernedAiGeneration({
    user,
    feature,
    prepared,
    promptVersion: "rfq-draft-v1",
    readiness: directOpenAiReadiness(),
    generate: (runId) => createOpenAiRfqDraft({ requestId: runId, context: prepared.context }),
    normalize: (providerResult) => normalizeAiRfqDraft({
      draft: providerResult.draft,
      allowedSources: prepared.sources
    })
  });
  const { output, ...metadata } = result;
  return { ...metadata, draft: output };
};

const usageSnapshot = (row, limits) => ({
  dailyPeriod: row?.daily_period || new Date().toISOString().slice(0, 10),
  dailyRequests: Number(row?.daily_requests || 0),
  monthlyPeriod: row?.monthly_period || new Date().toISOString().slice(0, 7),
  monthlyRequests: Number(row?.monthly_requests || 0),
  monthlyTokens: Number(row?.monthly_tokens || 0),
  dailyRemaining: Math.max(0, limits.dailyRequests - Number(row?.daily_requests || 0)),
  monthlyRequestsRemaining: Math.max(0, limits.monthlyRequests - Number(row?.monthly_requests || 0)),
  monthlyTokensRemaining: Math.max(0, limits.monthlyTokens - Number(row?.monthly_tokens || 0))
});

export const readAiDashboard = async ({ user, scope = "mine", limit = 30 }) => {
  await purgeExpiredRuns();
  const all = scope === "all" && elevatedRoles.includes(user.role);
  const safeLimit = Math.min(100, Math.max(1, Number(limit || 30)));
  const limits = aiLimits();
  const usageRows = all
    ? await query(
      `SELECT current_date AS daily_period,
              coalesce(sum(CASE WHEN daily_period = current_date THEN daily_requests ELSE 0 END), 0)::bigint AS daily_requests,
              date_trunc('month', current_date)::date AS monthly_period,
              coalesce(sum(CASE WHEN monthly_period = date_trunc('month', current_date)::date THEN monthly_requests ELSE 0 END), 0)::bigint AS monthly_requests,
              coalesce(sum(CASE WHEN monthly_period = date_trunc('month', current_date)::date THEN monthly_tokens ELSE 0 END), 0)::bigint AS monthly_tokens
         FROM ai_usage_counters`
    )
    : await query(
      `SELECT daily_period, daily_requests, monthly_period, monthly_requests, monthly_tokens
         FROM ai_usage_counters WHERE user_id = $1 LIMIT 1`,
      [user.id]
    );
  const runRows = await query(
    `SELECT run.*, account.name AS user_name
       FROM ai_runs run
       LEFT JOIN users account ON account.id = run.user_id
      WHERE run.expires_at > now() ${all ? "" : "AND run.user_id = $1"}
      ORDER BY run.created_at DESC
      LIMIT $${all ? 1 : 2}`,
    all ? [safeLimit] : [user.id, safeLimit]
  );
  const summaryRows = await query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE status = 'completed')::int AS completed,
            count(*) FILTER (WHERE status = 'failed')::int AS failed,
            count(*) FILTER (WHERE status = 'completed' AND approval_status = 'pending')::int AS pending,
            coalesce(sum(total_tokens), 0)::bigint AS total_tokens,
            coalesce(sum(estimated_cost_usd), 0)::numeric AS estimated_cost_usd
       FROM ai_runs
      WHERE expires_at > now() ${all ? "" : "AND user_id = $1"}`,
    all ? [] : [user.id]
  );
  const summary = summaryRows[0] || {};
  return {
    readiness: aiReadiness(),
    limits,
    usage: usageSnapshot(usageRows[0], limits),
    policy: Object.fromEntries(Object.entries(AI_FEATURE_POLICIES).map(([key, value]) => [key, {
      label: value.label,
      roles: value.roles,
      requiresApproval: value.requiresApproval
    }])),
    summary: {
      total: Number(summary.total || 0),
      completed: Number(summary.completed || 0),
      failed: Number(summary.failed || 0),
      pending: Number(summary.pending || 0),
      totalTokens: Number(summary.total_tokens || 0),
      estimatedCostUsd: Number(summary.estimated_cost_usd || 0)
    },
    runs: runRows.map(runSummary),
    scope: all ? "all" : "mine"
  };
};

export const reviewAiRun = async ({ user, runId, decision, note = "" }) => {
  const status = decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "";
  if (!status) throw new ApiError(400, "invalid_ai_review", "AI nəticəsi üçün düzgün qərar seçilməyib.");
  const rows = await query(
    `SELECT id, user_id, status, approval_status, expires_at FROM ai_runs WHERE id = $1 LIMIT 1`,
    [runId]
  );
  const run = rows[0];
  if (!run) throw new ApiError(404, "ai_run_not_found", "AI nəticəsi tapılmadı.");
  const ownsRun = run.user_id === user.id;
  if (!ownsRun) {
    if (!elevatedRoles.includes(user.role)) throw new ApiError(403, "ai_review_forbidden", "Bu AI nəticəsini yoxlamaq icazən yoxdur.");
    assertCriticalTwoFactor(user);
  }
  if (run.status !== "completed") throw new ApiError(409, "ai_run_not_reviewable", "Yalnız tamamlanmış AI nəticəsi yoxlanıla bilər.");
  if (new Date(run.expires_at).getTime() <= Date.now()) throw new ApiError(410, "ai_run_expired", "AI nəticəsinin saxlanma müddəti bitib.");
  const reviewNote = text(note, 1_000);
  if (status === "rejected" && reviewNote.length < 3) {
    throw new ApiError(400, "ai_rejection_note_required", "Rədd səbəbini qısa şəkildə qeyd et.");
  }
  const updated = await query(
    `UPDATE ai_runs SET approval_status = $2, reviewed_by = $3, reviewed_at = now(), review_note = $4, updated_at = now()
      WHERE id = $1
      RETURNING *`,
    [runId, status, user.id, reviewNote]
  );
  await recordAudit({
    actorId: user.id,
    action: status === "approved" ? "approve" : "reject",
    entityType: "ai_run",
    entityId: runId,
    details: { ownerId: run.user_id, crossUserReview: !ownsRun }
  });
  return runSummary(updated[0]);
};
