import { createHash, randomUUID } from "node:crypto";
import { validatePublicUrl } from "./catalog-quality.js";
import { query } from "./db.js";
import { ApiError } from "./http.js";
import { matrixToObjects, normalizeImportHeader, parseCsv, readAliased } from "./imports.js";

const offerId = (productId, supplierId) =>
  `pof-${createHash("sha256").update(`${productId}:${supplierId}`).digest("hex").slice(0, 28)}`;

const readMapped = (row, key, mapping = {}) => {
  const mapped = String(mapping?.[key] || "").trim();
  return mapped ? row[normalizeImportHeader(mapped)] ?? "" : readAliased(row, key);
};

const optionalNumber = (value, decimals = 3) => {
  const source = String(value ?? "").trim();
  if (!source) return { provided: false, value: null };
  const normalized = source.replace(/\s/g, "").replace(",", ".").replace(/(?:azn|manat)$/i, "");
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return { provided: true, value: null, invalid: true };
  const factor = 10 ** decimals;
  return { provided: true, value: Math.round(Number(normalized) * factor) / factor };
};

const normalizeStatus = (value, fallback = "request") => {
  const source = String(value || "").trim().toLocaleLowerCase("az");
  if (["confirmed", "təsdiqli", "tesdiqli", "aktiv", "satışda", "satisda"].includes(source)) return "confirmed";
  if (["expired", "köhnə", "kohne", "vaxtı keçib", "vaxti kecib"].includes(source)) return "expired";
  if (["request", "sorğu", "sorgu", "sorğu əsasında", "sorgu esasinda"].includes(source)) return "request";
  return fallback;
};

const normalizeRowKeys = (row) => Object.fromEntries(
  Object.entries(row && typeof row === "object" ? row : {}).map(([key, value]) => [normalizeImportHeader(key), value])
);

export const parseSupplierFeedRows = (source, format) => {
  if (format === "json") {
    const payload = JSON.parse(source);
    const rows = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.items)
        ? payload.items
        : Array.isArray(payload?.products)
          ? payload.products
          : Array.isArray(payload?.data)
            ? payload.data
            : [];
    return rows.map(normalizeRowKeys);
  }
  return matrixToObjects(parseCsv(source));
};

const fetchFeed = async (feed) => {
  let candidate = feed.endpoint_url;
  for (let redirect = 0; redirect <= 3; redirect += 1) {
    const valid = await validatePublicUrl(candidate);
    if (!valid.ok) throw new Error(valid.reason);
    const authValue = feed.auth_env_key ? String(process.env[feed.auth_env_key] || "") : "";
    if (feed.auth_env_key && !authValue) throw new Error(`${feed.auth_env_key} environment dəyişəni qurulmayıb`);
    const response = await fetch(valid.url, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
      headers: {
        Accept: feed.feed_format === "json" ? "application/json" : "text/csv, text/plain;q=0.9",
        "User-Agent": "ConstEra-Supplier-Feed/1.0",
        ...(authValue ? { Authorization: authValue } : {})
      }
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirect === 3) throw new Error("Feed yönləndirməsi qəbul edilmədi");
      candidate = new URL(location, valid.url).toString();
      continue;
    }
    if (!response.ok) throw new Error(`Feed HTTP ${response.status} qaytardı`);
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > 5_000_000) throw new Error("Feed maksimum 5 MB ola bilər");
    const source = await response.text();
    if (Buffer.byteLength(source, "utf8") > 5_000_000) throw new Error("Feed maksimum 5 MB ola bilər");
    return source;
  }
  throw new Error("Feed yüklənmədi");
};

export const mapSupplierFeed = (row) => ({
  id: row.id,
  supplierId: row.supplier_id,
  supplier: row.supplier_name || "",
  name: row.name,
  endpointUrl: row.endpoint_url,
  format: row.feed_format,
  authEnvKey: row.auth_env_key || "",
  mapping: row.mapping || {},
  scheduleMinutes: Number(row.schedule_minutes),
  active: Boolean(row.active),
  nextRunAt: row.next_run_at,
  lastRunAt: row.last_run_at,
  lastStatus: row.last_status || "",
  lastError: row.last_error || "",
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

export const runSupplierFeed = async (feedOrId) => {
  const feedRows = typeof feedOrId === "string"
    ? await query("SELECT * FROM supplier_feeds WHERE id = $1 AND active = true LIMIT 1", [feedOrId])
    : [feedOrId];
  let feed = feedRows[0];
  if (!feed) throw new ApiError(404, "supplier_feed_not_found", "Aktiv təchizatçı feed-i tapılmadı.");
  const claimedRows = await query(
    `UPDATE supplier_feeds
        SET last_status = 'running', last_error = NULL, last_run_at = now(), updated_at = now()
      WHERE id = $1 AND active = true
        AND (
          last_status IS DISTINCT FROM 'running'
          OR last_run_at IS NULL
          OR last_run_at < now() - interval '30 minutes'
        )
    RETURNING *`,
    [feed.id]
  );
  if (!claimedRows[0]) {
    throw new ApiError(409, "supplier_feed_running", "Bu feed hazırda başqa prosesdə yenilənir.");
  }
  feed = claimedRows[0];
  const runId = `sfr-${randomUUID()}`;
  await query(
    "INSERT INTO supplier_feed_runs (id, feed_id) VALUES ($1, $2)",
    [runId, feed.id]
  );
  try {
    const source = await fetchFeed(feed);
    const rows = parseSupplierFeedRows(source, feed.feed_format).slice(0, 5_000);
    const catalog = await query(
      `SELECT product.id AS product_id, product.sku AS product_sku,
              offer.id AS offer_id, offer.supplier_sku, offer.unit_price,
              offer.currency, offer.price_status, offer.stock_quantity,
              offer.minimum_order, offer.lead_time_days
         FROM products product
         LEFT JOIN product_offers offer
           ON offer.product_id = product.id AND offer.supplier_id = $1
        WHERE product.status = 'active'`,
      [feed.supplier_id]
    );
    const bySku = new Map();
    catalog.forEach((item) => {
      bySku.set(String(item.product_sku || "").trim().toLowerCase(), item);
      if (item.supplier_sku) bySku.set(String(item.supplier_sku).trim().toLowerCase(), item);
    });
    const seen = new Set();
    const skipped = [];
    const incoming = [];
    rows.forEach((row, index) => {
      const sku = String(readMapped(row, "supplierSku", feed.mapping) || readMapped(row, "sku", feed.mapping)).trim();
      const key = sku.toLowerCase();
      const match = bySku.get(key);
      if (!sku || !match || seen.has(key)) {
        skipped.push({ row: index + 2, sku, reason: !sku ? "SKU boşdur" : !match ? "SKU kataloqda tapılmadı" : "SKU təkrarlanıb" });
        return;
      }
      seen.add(key);
      const price = optionalNumber(readMapped(row, "price", feed.mapping), 2);
      const stock = optionalNumber(readMapped(row, "stockQuantity", feed.mapping), 3);
      const minimumOrder = optionalNumber(readMapped(row, "minimumOrder", feed.mapping), 3);
      const leadTime = optionalNumber(readMapped(row, "leadTimeDays", feed.mapping), 0);
      if ([price, stock, minimumOrder, leadTime].some((item) => item.invalid)) {
        skipped.push({ row: index + 2, sku, reason: "Rəqəm sahələrindən biri düzgün deyil" });
        return;
      }
      const currentPrice = match.unit_price === null || match.unit_price === undefined ? null : Number(match.unit_price);
      const unitPrice = price.provided ? price.value : currentPrice;
      let priceStatus = normalizeStatus(
        readMapped(row, "priceStatus", feed.mapping),
        match.price_status || (unitPrice === null ? "request" : "confirmed")
      );
      if (priceStatus === "confirmed" && unitPrice === null) priceStatus = "request";
      const currencyInput = String(readMapped(row, "currency", feed.mapping) || match.currency || "AZN").trim().toUpperCase();
      const currency = ["AZN", "USD", "EUR", "TRY"].includes(currencyInput) ? currencyInput : "AZN";
      const sourceInput = String(readMapped(row, "sourceUrl", feed.mapping) || "").trim();
      const verifiedInput = String(readMapped(row, "priceVerifiedAt", feed.mapping) || "").trim();
      const parsedVerifiedAt = Number.isFinite(Date.parse(verifiedInput))
        && Date.parse(verifiedInput) <= Date.now() + 300_000
        ? new Date(verifiedInput).toISOString()
        : new Date().toISOString();
      let sourceUrl = feed.endpoint_url;
      try {
        const parsed = new URL(sourceInput);
        if (parsed.protocol === "https:" && !parsed.username && !parsed.password) sourceUrl = parsed.toString();
      } catch {
        // Feed ünvanı etibarlı əsas mənbə kimi qalır.
      }
      incoming.push({
        id: match.offer_id || offerId(match.product_id, feed.supplier_id),
        productId: match.product_id,
        supplierId: feed.supplier_id,
        supplierSku: sku,
        unitPrice,
        currency,
        priceText: unitPrice === null || priceStatus !== "confirmed"
          ? "Sorğu əsasında"
          : `${unitPrice.toFixed(2)} ${currency}`,
        priceStatus,
        stockQuantity: stock.provided ? stock.value : match.stock_quantity === null ? null : Number(match.stock_quantity),
        minimumOrder: minimumOrder.provided ? minimumOrder.value : match.minimum_order === null ? null : Number(match.minimum_order),
        leadTimeDays: leadTime.provided ? leadTime.value : match.lead_time_days === null ? null : Number(match.lead_time_days),
        sourceUrl,
        sourceLabel: feed.name,
        priceVerifiedAt: priceStatus === "confirmed" ? parsedVerifiedAt : null
      });
    });
    let updatedRows = [];
    if (incoming.length) {
      updatedRows = await query(
        `WITH incoming AS (
           SELECT * FROM jsonb_to_recordset($1::jsonb) AS item(
             id text, "productId" text, "supplierId" text, "supplierSku" text,
             "unitPrice" numeric, currency text, "priceText" text, "priceStatus" text,
             "stockQuantity" numeric, "minimumOrder" numeric, "leadTimeDays" integer,
             "sourceUrl" text, "sourceLabel" text, "priceVerifiedAt" timestamptz
           )
         )
         INSERT INTO product_offers (
           id, product_id, supplier_id, supplier_sku, unit_price, currency,
           price_text, price_status, stock_quantity, minimum_order, lead_time_days,
           source_url, source_label, price_verified_at, status, updated_at
         )
         SELECT id, "productId", "supplierId", "supplierSku", "unitPrice", currency,
                "priceText", "priceStatus", "stockQuantity", "minimumOrder", "leadTimeDays",
                "sourceUrl", "sourceLabel", "priceVerifiedAt", 'active', now()
           FROM incoming
         ON CONFLICT (product_id, supplier_id) DO UPDATE SET
           supplier_sku = EXCLUDED.supplier_sku,
           unit_price = EXCLUDED.unit_price,
           currency = EXCLUDED.currency,
           price_text = EXCLUDED.price_text,
           price_status = EXCLUDED.price_status,
           stock_quantity = EXCLUDED.stock_quantity,
           minimum_order = EXCLUDED.minimum_order,
           lead_time_days = EXCLUDED.lead_time_days,
           source_url = EXCLUDED.source_url,
           source_label = EXCLUDED.source_label,
           price_verified_at = EXCLUDED.price_verified_at,
           status = 'active',
           updated_at = now()
         RETURNING id, unit_price, currency, price_status, stock_quantity, minimum_order`,
        [JSON.stringify(incoming)]
      );
      await query(
        `WITH history AS (
           SELECT * FROM jsonb_to_recordset($1::jsonb) AS item(
             id text, "unitPrice" numeric, currency text, "priceStatus" text,
             "stockQuantity" numeric, "minimumOrder" numeric
           )
         )
         INSERT INTO supplier_offer_history (
           id, product_offer_id, feed_run_id, unit_price, currency,
           price_status, stock_quantity, minimum_order
         )
         SELECT 'soh-' || md5($2 || ':' || id), id, $2, "unitPrice", currency,
                "priceStatus", "stockQuantity", "minimumOrder"
           FROM history`,
        [JSON.stringify(incoming), runId]
      );
      const affectedProductIds = [...new Set(incoming.map((item) => item.productId))];
      await query(
        `WITH canonical AS (
           SELECT DISTINCT ON (offer.product_id)
             offer.product_id, offer.unit_price, offer.currency, offer.price_text,
             offer.price_status, offer.stock_quantity, offer.minimum_order,
             offer.price_verified_at, offer.source_url, offer.source_label
           FROM product_offers offer
           JOIN suppliers supplier ON supplier.id = offer.supplier_id
           WHERE offer.product_id = ANY($1::text[])
             AND offer.status = 'active'
             AND supplier.status <> 'Arxiv'
           ORDER BY offer.product_id,
             CASE offer.price_status WHEN 'confirmed' THEN 0 WHEN 'request' THEN 1 ELSE 2 END,
             CASE WHEN offer.stock_quantity IS NULL THEN 1 WHEN offer.stock_quantity > 0 THEN 0 ELSE 2 END,
             offer.is_featured DESC,
             offer.unit_price ASC NULLS LAST,
             offer.updated_at DESC
         )
         UPDATE products product
            SET price_amount = canonical.unit_price,
                price_currency = canonical.currency,
                price_text = canonical.price_text,
                price_status = canonical.price_status,
                stock_quantity = canonical.stock_quantity,
                minimum_order = canonical.minimum_order,
                price_verified_at = canonical.price_verified_at,
                source_url = COALESCE(NULLIF(canonical.source_url, ''), product.source_url),
                source_label = COALESCE(NULLIF(canonical.source_label, ''), product.source_label),
                updated_at = now()
           FROM canonical
          WHERE product.id = canonical.product_id`,
        [affectedProductIds]
      );
    }
    const summary = {
      sourceRows: rows.length,
      matchedRows: incoming.length,
      updatedRows: updatedRows.length,
      skippedRows: skipped.length,
      skipped: skipped.slice(0, 100)
    };
    await query(
      `UPDATE supplier_feed_runs
          SET status = 'completed', total_rows = $2, matched_rows = $3,
              updated_rows = $4, skipped_rows = $5, summary = $6::jsonb,
              completed_at = now()
        WHERE id = $1`,
      [runId, rows.length, incoming.length, updatedRows.length, skipped.length, JSON.stringify(summary)]
    );
    await query(
      `UPDATE supplier_feeds
          SET last_status = 'completed', last_error = NULL,
              next_run_at = now() + (schedule_minutes::text || ' minutes')::interval,
              updated_at = now()
        WHERE id = $1`,
      [feed.id]
    );
    return { id: runId, feedId: feed.id, ...summary };
  } catch (error) {
    const message = String(error.message || "Feed sinxronizasiya xətası").slice(0, 500);
    await query(
      "UPDATE supplier_feed_runs SET status = 'failed', error_text = $2, completed_at = now() WHERE id = $1",
      [runId, message]
    );
    await query(
      `UPDATE supplier_feeds
          SET last_status = 'failed', last_error = $2,
              next_run_at = now() + interval '1 hour', updated_at = now()
        WHERE id = $1`,
      [feed.id, message]
    );
    throw error;
  }
};

export const runDueSupplierFeeds = async (limit = 5) => {
  const feeds = await query(
    `SELECT * FROM supplier_feeds
      WHERE active = true AND next_run_at <= now()
      ORDER BY next_run_at
      LIMIT $1`,
    [Math.max(1, Math.min(Number(limit) || 5, 10))]
  );
  const results = await Promise.all(feeds.map(async (feed) => {
    try {
      return { ok: true, ...(await runSupplierFeed(feed)) };
    } catch (error) {
      return { ok: false, feedId: feed.id, error: String(error.message || "Feed xətası") };
    }
  }));
  return {
    selected: feeds.length,
    completed: results.filter((item) => item.ok).length,
    failed: results.filter((item) => !item.ok).length,
    results
  };
};
