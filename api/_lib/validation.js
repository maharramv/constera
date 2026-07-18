import { randomUUID } from "node:crypto";
import { ApiError } from "./http.js";

export const text = (value, { field = "Məlumat", required = false, max = 500, min = 0 } = {}) => {
  const result = String(value ?? "").trim();
  if (required && !result) throw new ApiError(400, "validation_error", `${field} tələb olunur.`);
  if (result.length < min) throw new ApiError(400, "validation_error", `${field} ən azı ${min} simvol olmalıdır.`);
  if (result.length > max) throw new ApiError(400, "validation_error", `${field} ən çoxu ${max} simvol ola bilər.`);
  return result;
};

export const oneOf = (value, allowed, fallback, field = "Dəyər") => {
  const candidate = String(value || fallback);
  if (!allowed.includes(candidate)) {
    throw new ApiError(400, "validation_error", `${field} üçün uyğun olmayan dəyər göndərilib.`);
  }
  return candidate;
};

export const email = (value) => {
  const result = text(value, { field: "E-poçt", required: true, max: 254 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) {
    throw new ApiError(400, "validation_error", "E-poçt ünvanı düzgün deyil.");
  }
  return result;
};

export const safeUrl = (value, field = "URL") => {
  const result = text(value, { field, max: 2_000 });
  if (!result) return "";
  try {
    const url = new URL(result);
    if (url.protocol !== "https:") throw new Error("HTTPS tələb olunur");
    return url.toString();
  } catch {
    throw new ApiError(400, "validation_error", `${field} düzgün HTTPS ünvanı olmalıdır.`);
  }
};

export const safeMediaUrl = (value, field = "Şəkil URL-i") => {
  const result = text(value, { field, max: 2_000 });
  if (!result) return "";
  if (/^(?:\/|assets\/)[^\\]*$/i.test(result) && !result.startsWith("//")) return result;
  return safeUrl(result, field);
};

export const slugify = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/ə/g, "e")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ş/g, "s")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || randomUUID();

export const entityId = (value, prefix = "item") => {
  const candidate = text(value, { max: 160 });
  if (candidate && /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(candidate)) return candidate;
  return `${prefix}-${randomUUID()}`;
};

const categoryKinds = new Set(["material", "service", "package", "rental"]);

export const categoryStorageId = (kind, value) => {
  const normalizedKind = categoryKinds.has(kind) ? kind : "material";
  const publicId = String(value || "").replace(/^(?:material|service|package|rental):/, "");
  return `${normalizedKind}:${entityId(publicId, `${normalizedKind}-category`)}`;
};

export const categoryPublicId = (value) =>
  String(value || "").replace(/^(?:material|service|package|rental):/, "");

export const stableItemSlug = (title, id) =>
  `${slugify(title)}-${slugify(id)}`.slice(0, 220);

export const stringList = (value, maxItems = 30) => {
  const items = Array.isArray(value) ? value : String(value || "").split(/[;|]/);
  return items.slice(0, maxItems).map((item) => text(item, { max: 300 })).filter(Boolean);
};

export const parsePriceAmount = (value) => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : null;
  const normalized = String(value).replace(/\s/g, "").replace(",", ".").match(/\d+(?:\.\d{1,2})?/);
  if (!normalized) return null;
  const amount = Number(normalized[0]);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
};

export const parseLimit = (value, fallback = 100, max = 1_000) => {
  const parsed = Number.parseInt(String(value || fallback), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(parsed, max));
};
