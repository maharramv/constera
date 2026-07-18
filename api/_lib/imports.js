const normalizeHeader = (value) => String(value || "")
  .trim()
  .toLocaleLowerCase("az")
  .replace(/[^a-z0-9əöüğışç]+/g, "");

export const parseCsv = (source) => {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const text = String(source || "").replace(/^\uFEFF/, "");
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field.trim());
      field = "";
    } else if (char === "\n") {
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
};

export const matrixToObjects = (matrix) => {
  if (!Array.isArray(matrix) || matrix.length < 2) return [];
  const headers = matrix[0].map(normalizeHeader);
  return matrix.slice(1).filter((row) => row.some((value) => String(value ?? "").trim())).map((row) =>
    headers.reduce((result, header, index) => {
      if (header) result[header] = row[index] ?? "";
      return result;
    }, {})
  );
};

const aliases = {
  id: ["id", "kod", "code", "xidmetkodu", "xidmətkodu", "paketkodu", "icarekodu", "icarəkodu"],
  sku: ["sku", "kod", "mehsulkodu", "məhsulkodu"],
  name: ["ad", "name", "mehsul", "məhsul", "mehsuladi", "məhsuladı"],
  brand: ["brend", "brand"],
  category: ["kateqoriya", "category"],
  subcategory: ["subkateqoriya", "altkateqoriya", "subcategory"],
  package: ["qablasdirma", "qablaşdırma", "package"],
  origin: ["mense", "mənşə", "origin", "olke", "ölkə"],
  supplier: ["techizatci", "təchizatçı", "supplier"],
  price: ["qiymet", "qiymət", "price"],
  currency: ["valyuta", "currency"],
  availability: ["movcudluq", "mövcudluq", "stok", "availability"],
  stockQuantity: ["stokmiqdari", "stokmiqdarı", "stockquantity"],
  minimumOrder: ["minimumsifaris", "minimumsifariş", "minimumorder"],
  imageUrl: ["fotourl", "sekilurl", "şəkilurl", "imageurl"],
  sourceUrl: ["menbeurl", "mənbəurl", "sourceurl"],
  sourceLabel: ["menbeadi", "mənbəadı", "sourcelabel"],
  specs: ["xususiyyetler", "xüsusiyyətlər", "specs"],
  title: ["ad", "title", "name"],
  itemType: ["tip", "type"],
  unit: ["vahid", "unit"],
  time: ["muddet", "müddət", "time", "timeline"],
  team: ["komanda", "operator", "team"],
  extra: ["elave", "əlavə", "capacity", "idealfor"],
  deliverables: ["neticeler", "nəticələr", "deliverables"]
};

export const readAliased = (row, key) => {
  const candidates = aliases[key] || [key];
  for (const candidate of candidates) {
    const value = row[normalizeHeader(candidate)];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return "";
};

export const splitList = (value) => String(value || "").split(/[;|]/).map((item) => item.trim()).filter(Boolean);
