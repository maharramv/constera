import "./load-local-env.mjs";
import {
  normalizeAiCatalogAdvice,
  normalizeAiRfqDraft,
  prepareAiCatalogAdviceRequest,
  prepareAiRfqDraftRequest
} from "../api/_lib/ai-foundation.js";
import {
  createOpenAiCatalogAdvice,
  createOpenAiRfqDraft,
  openAiConfiguration
} from "../api/_lib/openai.js";

const configuration = openAiConfiguration();
if (!configuration.ready) {
  console.error("OPENAI_API_KEY lokal mühitdə hazır deyil.");
  process.exit(1);
}

const prompt = "120 m² villa üçün sement, armatur və daxili suvaq materialları";
const candidates = [
  {
    id: "smoke-cement-40kg",
    name: "Test sement CEM II 40 kq",
    brand: "Test Brend",
    category: "Tikinti materialları",
    subcategory: "Sement",
    package: "40 kq kisə",
    price: "Sorğu əsasında",
    priceStatus: "request",
    availability: "Sorğu əsasında",
    specs: ["CEM II", "40 kq"]
  },
  {
    id: "smoke-rebar-12mm",
    name: "Test armatur 12 mm",
    brand: "Test Brend",
    category: "Metal",
    subcategory: "Armatur",
    package: "ton",
    price: "Sorğu əsasında",
    priceStatus: "request",
    availability: "Sorğu əsasında",
    specs: ["12 mm", "A500C"]
  },
  {
    id: "smoke-plaster-30kg",
    name: "Test daxili suvaq 30 kq",
    brand: "Test Brend",
    category: "Quru qarışıqlar",
    subcategory: "Suvaq",
    package: "30 kq kisə",
    price: "Sorğu əsasında",
    priceStatus: "request",
    availability: "Sorğu əsasında",
    specs: ["daxili istifadə", "30 kq"]
  }
];

const catalogPrepared = prepareAiCatalogAdviceRequest({
  input: { prompt, hints: ["sement", "armatur", "suvaq"] },
  candidates
});
const catalogProvider = await createOpenAiCatalogAdvice({
  requestId: `smoke-catalog-${Date.now()}`,
  context: catalogPrepared.context
});
const catalog = normalizeAiCatalogAdvice({
  advice: catalogProvider.advice,
  allowedSources: catalogPrepared.sources
});

const rfqPrepared = prepareAiRfqDraftRequest({
  input: {
    prompt,
    city: "Bakı",
    priority: "Normal",
    deliveryMode: "Çatdırılma lazımdır",
    usage: "Villa tikintisi"
  },
  candidates
});
const rfqProvider = await createOpenAiRfqDraft({
  requestId: `smoke-rfq-${Date.now()}`,
  context: rfqPrepared.context
});
const rfq = normalizeAiRfqDraft({
  draft: rfqProvider.draft,
  allowedSources: rfqPrepared.sources
});

const allowedIds = new Set(candidates.map((candidate) => candidate.id));
const ungrounded = [
  ...catalog.output.recommendations.map((item) => item.productId),
  ...rfq.output.items.map((item) => item.productId).filter(Boolean)
].filter((id) => !allowedIds.has(id));
if (ungrounded.length) {
  console.error("AI smoke grounded mənbə yoxlamasından keçmədi.");
  process.exit(1);
}

console.log("ConstEra AI Mərhələ 2 smoke-test uğurludur:");
console.log(`- model: ${configuration.model}`);
console.log(`- sintetik test namizədi: ${candidates.length}`);
console.log(`- kataloq tövsiyəsi: ${catalog.output.recommendations.length}`);
console.log(`- RFQ sətri: ${rfq.output.items.length}`);
console.log(`- mənbəli RFQ sətri: ${rfq.output.items.filter((item) => item.productId).length}`);
console.log(`- token: ${catalogProvider.usage.totalTokens + rfqProvider.usage.totalTokens}`);
console.log("- grounded yoxlama: keçdi");
