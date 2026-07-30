const compact = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

const canonicalLabels = new Map([
  ["olcu", "Ölçü"],
  ["ölçü", "Ölçü"],
  ["dimensions", "Ölçü"],
  ["dimension", "Ölçü"],
  ["qalinliq", "Qalınlıq"],
  ["qalınlıq", "Qalınlıq"],
  ["thickness", "Qalınlıq"],
  ["hecm", "Həcm"],
  ["həcm", "Həcm"],
  ["volume", "Həcm"],
  ["ceki", "Çəki"],
  ["çəki", "Çəki"],
  ["weight", "Çəki"],
  ["reng", "Rəng"],
  ["rəng", "Rəng"],
  ["color", "Rəng"],
  ["guc", "Güc"],
  ["güc", "Güc"],
  ["power", "Güc"],
  ["gerginlik", "Gərginlik"],
  ["gərginlik", "Gərginlik"],
  ["voltage", "Gərginlik"],
  ["material", "Material"],
  ["model", "Model"],
  ["qablasdirma", "Qablaşdırma"],
  ["qablaşdırma", "Qablaşdırma"],
  ["package", "Qablaşdırma"],
  ["mense", "Mənşə"],
  ["mənşə", "Mənşə"],
  ["origin", "Mənşə"]
]);

const fold = (value) => compact(value)
  .toLocaleLowerCase("az")
  .replace(/ə/g, "e")
  .replace(/ğ/g, "g")
  .replace(/ı/g, "i")
  .replace(/ö/g, "o")
  .replace(/ş/g, "s")
  .replace(/ü/g, "u")
  .replace(/ç/g, "c");

const labelFor = (value) => {
  const source = compact(value).replace(/[.：:]+$/g, "");
  const folded = fold(source);
  if (canonicalLabels.has(folded)) return canonicalLabels.get(folded);
  if (!source || source.length > 60) return "";
  return source.charAt(0).toLocaleUpperCase("az") + source.slice(1);
};

const measurement = String.raw`\d+(?:[.,]\d+)?\s*(?:mm|sm|cm|m|m²|m2|m³|m3|ml|l|kq|kg|q|qr|g|w|kw|v|a|bar|mpa)`;
const dimensions = String.raw`\d+(?:[.,]\d+)?\s*(?:mm|sm|cm|m)?\s*[x×]\s*\d+(?:[.,]\d+)?(?:\s*(?:[x×])\s*\d+(?:[.,]\d+)?)?\s*(?:mm|sm|cm|m)`;

const inferredPatterns = [
  { label: "Ölçü", pattern: new RegExp(`(?:ölçü|olcu)\\s*:?\\s*(${dimensions})`, "i") },
  { label: "Ölçü", pattern: new RegExp(`(${dimensions})\\s*(?:ölçü|olcu)`, "i") },
  { label: "Qalınlıq", pattern: new RegExp(`(?:qalınlıq|qalinliq)\\s*:?\\s*(${measurement})`, "i") },
  { label: "Qalınlıq", pattern: new RegExp(`(${measurement})\\s*(?:qalınlıq|qalinliq)`, "i") },
  { label: "Həcm", pattern: new RegExp(`(?:həcm|hecm)\\s*:?\\s*(${measurement})`, "i") },
  { label: "Çəki", pattern: new RegExp(`(?:çəki|ceki)\\s*:?\\s*(${measurement})`, "i") },
  { label: "Güc", pattern: new RegExp(`(?:güc|guc)\\s*:?\\s*(${measurement})`, "i") },
  { label: "Gərginlik", pattern: new RegExp(`(?:gərginlik|gerginlik)\\s*:?\\s*(${measurement})`, "i") },
  { label: "Rəng", pattern: /^(.{2,40})\s+r[əe]ng(?:i)?$/i }
];

const normalizeValue = (value) => compact(value)
  .replace(/\bkg\b/gi, "kq")
  .replace(/\bcm\b/gi, "sm")
  .replace(/\bm2\b/gi, "m²")
  .replace(/\bm3\b/gi, "m³");

const inferAttribute = (spec) => {
  for (const item of inferredPatterns) {
    const match = compact(spec).match(item.pattern);
    if (match?.[1]) return { label: item.label, value: normalizeValue(match[1]) };
  }
  return null;
};

export const normalizeProductAttributes = ({
  specs = [],
  packageText = "",
  origin = "",
  storedAttributes = []
} = {}) => {
  const attributes = [];
  const seen = new Set();
  const add = (label, value, source = "derived") => {
    const normalizedLabel = labelFor(label);
    const normalizedValue = normalizeValue(value);
    if (!normalizedLabel || !normalizedValue) return;
    const key = `${fold(normalizedLabel)}:${fold(normalizedValue)}`;
    if (seen.has(key)) return;
    seen.add(key);
    attributes.push({ label: normalizedLabel, value: normalizedValue, source });
  };

  for (const item of Array.isArray(storedAttributes) ? storedAttributes : []) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    add(item.label || item.key, item.value, "stored");
  }
  add("Qablaşdırma", packageText, "product");
  add("Mənşə", origin, "product");

  for (const spec of Array.isArray(specs) ? specs : []) {
    const source = compact(spec);
    if (!source) continue;
    const separator = source.match(/^([^:：=]{2,60})\s*[:：=]\s*(.+)$/);
    if (separator) {
      add(separator[1], separator[2], "spec");
      continue;
    }
    const inferred = inferAttribute(source);
    if (inferred) add(inferred.label, inferred.value, "spec");
  }

  return attributes.slice(0, 24);
};

export const countTechnicalAttributes = (attributes = []) =>
  attributes.filter((item) => !["Qablaşdırma", "Mənşə"].includes(item.label)).length;
