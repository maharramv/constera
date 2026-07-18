export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const baseHeaders = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff"
};

export const sendJson = (res, status, payload, headers = {}) => {
  Object.entries({ ...baseHeaders, ...headers }).forEach(([key, value]) => res.setHeader(key, value));
  return res.status(status).json(payload);
};

export const readJson = async (req, maxBytes = 1_500_000) => {
  const declaredLength = Number(req.headers["content-length"] || 0);
  if (declaredLength > maxBytes) {
    throw new ApiError(413, "payload_too_large", "Sorğunun həcmi icazə verilən limiti keçir.");
  }

  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  const source = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body || "");
  if (!source) return {};
  if (Buffer.byteLength(source, "utf8") > maxBytes) {
    throw new ApiError(413, "payload_too_large", "Sorğunun həcmi icazə verilən limiti keçir.");
  }

  try {
    return JSON.parse(source);
  } catch {
    throw new ApiError(400, "invalid_json", "JSON məlumatı düzgün formatda deyil.");
  }
};

export const assertMethod = (req, allowed) => {
  if (allowed.includes(req.method)) return;
  throw new ApiError(405, "method_not_allowed", "Bu HTTP metodu dəstəklənmir.", { allowed });
};

export const assertSameOrigin = (req) => {
  const origin = req.headers.origin;
  if (!origin) return;

  try {
    const originHost = new URL(origin).host;
    const requestHost = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
    if (originHost !== requestHost) {
      throw new ApiError(403, "origin_rejected", "Sorğunun mənbə domeni qəbul edilmədi.");
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(403, "origin_rejected", "Sorğunun mənbə domeni qəbul edilmədi.");
  }
};

export const getClientIp = (req) =>
  String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown")
    .split(",")[0]
    .trim();

export const withApiErrors = (handler) => async (req, res) => {
  try {
    return await handler(req, res);
  } catch (error) {
    if (error instanceof ApiError) {
      return sendJson(res, error.status, {
        ok: false,
        error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) }
      }, error.status === 405 ? { Allow: error.details.allowed.join(", ") } : {});
    }

    console.error("ConstEra API xətası", error);
    return sendJson(res, 500, {
      ok: false,
      error: { code: "internal_error", message: "Server sorğunu tamamlaya bilmədi." }
    });
  }
};
