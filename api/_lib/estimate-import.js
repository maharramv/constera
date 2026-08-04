import readXlsxFile from "read-excel-file/node";
import { enrichEstimateWorkflowRow } from "./estimate-workflow.js";
import { ApiError } from "./http.js";
import { firstWorksheetMatrix, normalizeXlsxForImport, parseCsv } from "./imports.js";

const fold = (value) => String(value ?? "")
  .trim()
  .toLocaleLowerCase("az")
  .replace(/ə/g, "e")
  .replace(/ö/g, "o")
  .replace(/ü/g, "u")
  .replace(/ı/g, "i")
  .replace(/ğ/g, "g")
  .replace(/ş/g, "s")
  .replace(/ç/g, "c")
  .replace(/[^a-z0-9]+/g, "");

const aliases = {
  title: ["material", "mehsul", "ad", "name", "title", "tesvir", "pozisiya"],
  quantity: ["miqdar", "say", "quantity", "qty", "hecm", "volume"],
  unit: ["vahid", "unit", "olcu", "measure"],
  category: ["kateqoriya", "category", "bolme", "section"],
  sku: ["sku", "kod", "code", "materialkodu"]
};

const findHeaderIndex = (matrix) => matrix.findIndex((row) => {
  const keys = new Set((row || []).map(fold));
  return aliases.title.some((key) => keys.has(fold(key)))
    && aliases.quantity.some((key) => keys.has(fold(key)));
});

const cellIndex = (headers, key) => {
  const candidates = new Set(aliases[key].map(fold));
  return headers.findIndex((header) => candidates.has(fold(header)));
};

const numberValue = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const match = String(value || "").replace(/\s/g, "").replace(",", ".").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
};

const slug = (value, index) => `${fold(value).slice(0, 48) || "material"}-${index + 1}`;

const normalizeMatrix = (matrix) => {
  const headerIndex = findHeaderIndex(matrix);
  if (headerIndex < 0) {
    throw new ApiError(400, "estimate_headers_missing", "Faylda material və miqdar sütunları tapılmadı.");
  }
  const headers = matrix[headerIndex] || [];
  const indexes = Object.fromEntries(Object.keys(aliases).map((key) => [key, cellIndex(headers, key)]));
  const rows = matrix.slice(headerIndex + 1).map((row, index) => {
    const title = String(row[indexes.title] ?? "").trim();
    const quantity = numberValue(row[indexes.quantity]);
    if (!title || quantity === null || quantity <= 0) return null;
    const unit = String(indexes.unit >= 0 ? row[indexes.unit] ?? "" : "").trim() || "ədəd";
    const category = String(indexes.category >= 0 ? row[indexes.category] ?? "" : "").trim() || "Sənəddən idxal";
    const sku = String(indexes.sku >= 0 ? row[indexes.sku] ?? "" : "").trim();
    const words = title.toLocaleLowerCase("az").split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 2);
    return enrichEstimateWorkflowRow({
      key: slug(sku || title, index),
      title,
      quantity,
      baseQuantity: quantity,
      unit,
      category,
      sku,
      confidence: "Sənəddən",
      keywords: [...new Set([title, sku, ...words].filter(Boolean))].slice(0, 12),
      products: []
    });
  }).filter(Boolean).slice(0, 120);
  if (!rows.length) throw new ApiError(400, "estimate_rows_missing", "Faylda müsbət miqdarlı material sətri tapılmadı.");
  return rows;
};

export const parseEstimateDocument = async ({ fileName, mimeType, contentBase64 }) => {
  const name = String(fileName || "").trim().slice(0, 240);
  const extension = name.toLowerCase().split(".").pop() || "";
  const buffer = Buffer.from(String(contentBase64 || ""), "base64");
  if (!buffer.length || buffer.length > 1_500_000) {
    throw new ApiError(413, "estimate_file_size", "Smeta faylı 1,5 MB-dan böyük və ya boş ola bilməz.");
  }
  if (extension === "pdf" || mimeType === "application/pdf") {
    if (buffer.subarray(0, 4).toString("ascii") !== "%PDF") {
      throw new ApiError(400, "invalid_pdf", "PDF faylının formatı düzgün deyil.");
    }
    return { fileName: name || "smeta.pdf", sourceType: "pdf", requiresAi: true, contentBase64: buffer.toString("base64") };
  }
  let matrix;
  if (extension === "xlsx" || mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
    if (buffer.subarray(0, 2).toString("ascii") !== "PK") {
      throw new ApiError(400, "invalid_xlsx", "Excel faylının formatı düzgün deyil.");
    }
    matrix = firstWorksheetMatrix(await readXlsxFile(normalizeXlsxForImport(buffer)));
  } else if (["csv", "txt", "tsv"].includes(extension) || /^text\//.test(String(mimeType || ""))) {
    matrix = parseCsv(buffer.toString("utf8"));
  } else {
    throw new ApiError(400, "estimate_file_type", "Yalnız XLSX, CSV, TSV, TXT və PDF faylları qəbul edilir.");
  }
  return {
    fileName: name || `smeta.${extension || "csv"}`,
    sourceType: extension || "text",
    requiresAi: false,
    rows: normalizeMatrix(matrix)
  };
};
