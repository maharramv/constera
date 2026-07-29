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

const recalculateCanonicalProducts = async (productIds) => {
  const ids = [...new Set(productIds.filter(Boolean))];
  if (!ids.length) return;
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
    [ids]
  );
};

const syncFeedInventory = async (supplierId, incoming) => {
  const stockRows = incoming.filter((item) => item.stockQuantity !== null);
  if (!stockRows.length) return;
  await query(
    `INSERT INTO warehouses (id, supplier_id, name, city, is_default)
     SELECT 'wh-' || md5(supplier.id), supplier.id,
            supplier.name || ' əsas anbarı',
            COALESCE(NULLIF(supplier.region, ''), 'Bakı'), true
       FROM suppliers supplier
      WHERE supplier.id = $1
     ON CONFLICT (id) DO NOTHING`,
    [supplierId]
  );
  await query(
    `WITH incoming AS (
       SELECT * FROM jsonb_to_recordset($1::jsonb) AS item(
         "productId" text, "stockQuantity" numeric
       )
     )
     INSERT INTO inventory_levels (
       id, warehouse_id, product_id, stock_quantity, updated_at
     )
     SELECT 'ivl-' || md5(warehouse.id || ':' || incoming."productId"),
            warehouse.id, incoming."productId", incoming."stockQuantity", now()
       FROM incoming
       JOIN warehouses warehouse
         ON warehouse.supplier_id = $2
        AND warehouse.is_default = true
        AND warehouse.status = 'active'
     ON CONFLICT (warehouse_id, product_id) DO UPDATE SET
       stock_quantity = EXCLUDED.stock_quantity,
       updated_at = now()
     WHERE EXCLUDED.stock_quantity >= inventory_levels.reserved_quantity`,
    [JSON.stringify(stockRows), supplierId]
  );
};

const queueFeedAlerts = async (feed, runId, alerts) => {
  if (!alerts.length) return;
  const supplier = (await query("SELECT company_id FROM suppliers WHERE id = $1 LIMIT 1", [feed.supplier_id]))[0];
  const payload = {
    feedId: feed.id,
    runId,
    alertCount: alerts.length,
    alerts: alerts.slice(0, 20)
  };
  await query(
    `INSERT INTO notifications (
       id, user_id, channel, subject, body, template_key, payload
     )
     SELECT 'not-' || md5($1 || ':' || users.id), users.id, 'in_app',
            'Qiymət və stok feed-i xəbərdarlığı',
            $2, 'supplier_feed_alert', $3::jsonb
       FROM users
      WHERE users.status = 'active'
        AND (
          users.role IN ('super_admin', 'admin')
          OR ($4::text IS NOT NULL AND users.company_id = $4)
        )
     ON CONFLICT (id) DO NOTHING`,
    [
      runId,
      `${feed.name} üzrə ${alerts.length} əhəmiyyətli dəyişiklik yoxlama tələb edir.`,
      JSON.stringify(payload),
      supplier?.company_id || null
    ]
  );
};

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
              product.price_amount AS product_price_amount,
              product.price_currency AS product_price_currency,
              product.price_text AS product_price_text,
              product.price_status AS product_price_status,
              product.stock_quantity AS product_stock_quantity,
              product.minimum_order AS product_minimum_order,
              product.price_verified_at AS product_price_verified_at,
              product.source_url AS product_source_url,
              product.source_label AS product_source_label,
              offer.id AS offer_id, offer.supplier_sku, offer.unit_price,
              offer.currency, offer.price_text, offer.price_status, offer.stock_quantity,
              offer.minimum_order, offer.lead_time_days, offer.source_url,
              offer.source_label, offer.price_verified_at, offer.status AS offer_status
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
    const alerts = [];
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
      const stockQuantity = stock.provided
        ? stock.value
        : match.stock_quantity === null ? null : Number(match.stock_quantity);
      if (currentPrice !== null && unitPrice !== null && currentPrice > 0) {
        const changePercent = Math.round(Math.abs(unitPrice - currentPrice) / currentPrice * 10_000) / 100;
        if (changePercent >= 20) {
          alerts.push({ sku, type: "price_change", from: currentPrice, to: unitPrice, changePercent });
        }
      }
      if (Number(match.stock_quantity) > 0 && stockQuantity === 0) {
        alerts.push({ sku, type: "out_of_stock", from: Number(match.stock_quantity), to: 0 });
      }
      const item = {
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
        stockQuantity,
        minimumOrder: minimumOrder.provided ? minimumOrder.value : match.minimum_order === null ? null : Number(match.minimum_order),
        leadTimeDays: leadTime.provided ? leadTime.value : match.lead_time_days === null ? null : Number(match.lead_time_days),
        sourceUrl,
        sourceLabel: feed.name,
        priceVerifiedAt: priceStatus === "confirmed" ? parsedVerifiedAt : null,
        beforeData: {
          offer: match.offer_id ? {
            supplierSku: match.supplier_sku,
            unitPrice: currentPrice,
            currency: match.currency,
            priceText: match.price_text,
            priceStatus: match.price_status,
            stockQuantity: match.stock_quantity === null ? null : Number(match.stock_quantity),
            minimumOrder: match.minimum_order === null ? null : Number(match.minimum_order),
            leadTimeDays: match.lead_time_days === null ? null : Number(match.lead_time_days),
            sourceUrl: match.source_url,
            sourceLabel: match.source_label,
            priceVerifiedAt: match.price_verified_at,
            status: match.offer_status
          } : null,
          product: {
            priceAmount: match.product_price_amount === null ? null : Number(match.product_price_amount),
            priceCurrency: match.product_price_currency,
            priceText: match.product_price_text,
            priceStatus: match.product_price_status,
            stockQuantity: match.product_stock_quantity === null ? null : Number(match.product_stock_quantity),
            minimumOrder: match.product_minimum_order === null ? null : Number(match.product_minimum_order),
            priceVerifiedAt: match.product_price_verified_at,
            sourceUrl: match.product_source_url,
            sourceLabel: match.product_source_label
          }
        }
      };
      incoming.push(item);
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
      const changes = incoming.map(({ beforeData, ...afterData }) => ({
        id: afterData.id,
        productId: afterData.productId,
        beforeData,
        afterData
      }));
      await query(
        `WITH changes AS (
           SELECT * FROM jsonb_to_recordset($1::jsonb) AS item(
             id text, "productId" text, "beforeData" jsonb, "afterData" jsonb
           )
         )
         INSERT INTO supplier_feed_changes (
           id, feed_run_id, product_offer_id, product_id, before_data, after_data
         )
         SELECT 'sfc-' || md5($2 || ':' || id), $2, id, "productId",
                "beforeData", "afterData"
           FROM changes`,
        [JSON.stringify(changes), runId]
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
      await recalculateCanonicalProducts(affectedProductIds);
      await syncFeedInventory(feed.supplier_id, incoming);
    }
    const summary = {
      sourceRows: rows.length,
      matchedRows: incoming.length,
      updatedRows: updatedRows.length,
      skippedRows: skipped.length,
      skipped: skipped.slice(0, 100),
      alertCount: alerts.length,
      alerts: alerts.slice(0, 100)
    };
    await query(
      `UPDATE supplier_feed_runs
          SET status = 'completed', total_rows = $2, matched_rows = $3,
              updated_rows = $4, skipped_rows = $5, summary = $6::jsonb,
              rollback_status = CASE WHEN $4 > 0 THEN 'available' ELSE 'unavailable' END,
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
    await queueFeedAlerts(feed, runId, alerts);
    return { id: runId, feedId: feed.id, ...summary };
  } catch (error) {
    const message = String(error.message || "Feed sinxronizasiya xətası").slice(0, 500);
    await query(
      `UPDATE supplier_feed_runs
          SET status = 'failed', rollback_status = 'unavailable',
              error_text = $2, completed_at = now()
        WHERE id = $1`,
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

export const previewSupplierFeed = async (feedOrId) => {
  const feed = typeof feedOrId === "string"
    ? (await query("SELECT * FROM supplier_feeds WHERE id = $1 AND active = true LIMIT 1", [feedOrId]))[0]
    : feedOrId;
  if (!feed) throw new ApiError(404, "supplier_feed_not_found", "Aktiv təchizatçı feed-i tapılmadı.");
  const rows = parseSupplierFeedRows(await fetchFeed(feed), feed.feed_format).slice(0, 5_000);
  const catalog = await query(
    `SELECT product.sku, offer.supplier_sku
       FROM products product
       LEFT JOIN product_offers offer
         ON offer.product_id = product.id AND offer.supplier_id = $1
      WHERE product.status = 'active'`,
    [feed.supplier_id]
  );
  const known = new Set(catalog.flatMap((item) => [item.sku, item.supplier_sku])
    .filter(Boolean).map((value) => String(value).trim().toLowerCase()));
  const seen = new Set();
  const samples = [];
  let matchedRows = 0;
  let duplicateRows = 0;
  rows.forEach((row, index) => {
    const sku = String(readMapped(row, "supplierSku", feed.mapping) || readMapped(row, "sku", feed.mapping)).trim();
    const key = sku.toLowerCase();
    if (seen.has(key) && key) duplicateRows += 1;
    else if (known.has(key)) matchedRows += 1;
    else if (samples.length < 25) samples.push({ row: index + 2, sku, reason: sku ? "SKU kataloqda tapılmadı" : "SKU boşdur" });
    if (key) seen.add(key);
  });
  return {
    feedId: feed.id,
    sourceRows: rows.length,
    matchedRows,
    unknownRows: rows.length - matchedRows - duplicateRows,
    duplicateRows,
    samples
  };
};

export const rollbackSupplierFeedRun = async (runId, actorId) => {
  const run = (await query(
    `SELECT run.*, feed.supplier_id, feed.name AS feed_name
       FROM supplier_feed_runs run
       JOIN supplier_feeds feed ON feed.id = run.feed_id
      WHERE run.id = $1
        AND run.status = 'completed'
        AND run.rollback_status IN ('available', 'failed')
      LIMIT 1`,
    [runId]
  ))[0];
  if (!run) {
    throw new ApiError(404, "feed_run_not_rollbackable", "Geri qaytarıla bilən feed işi tapılmadı.");
  }
  const later = await query(
    `SELECT id FROM supplier_feed_runs
      WHERE feed_id = $1 AND status = 'completed' AND started_at > $2
      LIMIT 1`,
    [run.feed_id, run.started_at]
  );
  if (later[0]) {
    throw new ApiError(409, "feed_run_not_latest", "Yalnız həmin feed-in son uğurlu işi geri qaytarıla bilər.");
  }
  const changes = await query(
    "SELECT * FROM supplier_feed_changes WHERE feed_run_id = $1 ORDER BY created_at",
    [runId]
  );
  if (!changes.length) {
    throw new ApiError(409, "feed_run_without_changes", "Bu iş üçün geri qaytarma snapshot-u yoxdur.");
  }
  const productIds = [...new Set(changes.map((item) => item.product_id))];
  try {
    await query(
      `WITH changes AS (
         SELECT * FROM supplier_feed_changes WHERE feed_run_id = $1
       )
       UPDATE product_offers offer
          SET supplier_sku = changes.before_data #>> '{offer,supplierSku}',
              unit_price = NULLIF(changes.before_data #>> '{offer,unitPrice}', '')::numeric,
              currency = COALESCE(changes.before_data #>> '{offer,currency}', 'AZN'),
              price_text = COALESCE(changes.before_data #>> '{offer,priceText}', 'Sorğu əsasında'),
              price_status = COALESCE(changes.before_data #>> '{offer,priceStatus}', 'request'),
              stock_quantity = NULLIF(changes.before_data #>> '{offer,stockQuantity}', '')::numeric,
              minimum_order = NULLIF(changes.before_data #>> '{offer,minimumOrder}', '')::numeric,
              lead_time_days = NULLIF(changes.before_data #>> '{offer,leadTimeDays}', '')::integer,
              source_url = changes.before_data #>> '{offer,sourceUrl}',
              source_label = changes.before_data #>> '{offer,sourceLabel}',
              price_verified_at = NULLIF(changes.before_data #>> '{offer,priceVerifiedAt}', '')::timestamptz,
              status = COALESCE(changes.before_data #>> '{offer,status}', 'active'),
              updated_at = now()
         FROM changes
        WHERE offer.id = changes.product_offer_id
          AND jsonb_typeof(changes.before_data->'offer') = 'object'`,
      [runId]
    );
    await query(
      `UPDATE product_offers offer
          SET status = 'archived', updated_at = now()
         FROM supplier_feed_changes changes
        WHERE changes.feed_run_id = $1
          AND offer.id = changes.product_offer_id
          AND jsonb_typeof(changes.before_data->'offer') IS DISTINCT FROM 'object'`,
      [runId]
    );
    await query(
      `WITH changes AS (
         SELECT DISTINCT ON (product_id) product_id, before_data
           FROM supplier_feed_changes
          WHERE feed_run_id = $1
          ORDER BY product_id, created_at
       )
       UPDATE products product
          SET price_amount = NULLIF(changes.before_data #>> '{product,priceAmount}', '')::numeric,
              price_currency = COALESCE(changes.before_data #>> '{product,priceCurrency}', 'AZN'),
              price_text = COALESCE(changes.before_data #>> '{product,priceText}', 'Sorğu əsasında'),
              price_status = COALESCE(changes.before_data #>> '{product,priceStatus}', 'request'),
              stock_quantity = NULLIF(changes.before_data #>> '{product,stockQuantity}', '')::numeric,
              minimum_order = NULLIF(changes.before_data #>> '{product,minimumOrder}', '')::numeric,
              price_verified_at = NULLIF(changes.before_data #>> '{product,priceVerifiedAt}', '')::timestamptz,
              source_url = changes.before_data #>> '{product,sourceUrl}',
              source_label = changes.before_data #>> '{product,sourceLabel}',
              updated_at = now()
         FROM changes
        WHERE product.id = changes.product_id
          AND NOT EXISTS (
            SELECT 1 FROM product_offers offer
             WHERE offer.product_id = product.id AND offer.status = 'active'
          )`,
      [runId]
    );
    await recalculateCanonicalProducts(productIds);
    await query(
      `WITH changes AS (
         SELECT * FROM supplier_feed_changes WHERE feed_run_id = $1
       )
       UPDATE inventory_levels level
          SET stock_quantity = NULLIF(changes.before_data #>> '{offer,stockQuantity}', '')::numeric,
              updated_at = now()
         FROM changes
         JOIN warehouses warehouse
           ON warehouse.supplier_id = $2
          AND warehouse.is_default = true
          AND warehouse.status = 'active'
        WHERE level.warehouse_id = warehouse.id
          AND level.product_id = changes.product_id
          AND jsonb_typeof(changes.before_data->'offer') = 'object'
          AND NULLIF(changes.before_data #>> '{offer,stockQuantity}', '') IS NOT NULL
          AND NULLIF(changes.before_data #>> '{offer,stockQuantity}', '')::numeric >= level.reserved_quantity`,
      [runId, run.supplier_id]
    );
    await query(
      `DELETE FROM inventory_levels level
        USING supplier_feed_changes changes, warehouses warehouse
        WHERE changes.feed_run_id = $1
          AND warehouse.supplier_id = $2
          AND warehouse.is_default = true
          AND level.warehouse_id = warehouse.id
          AND level.product_id = changes.product_id
          AND level.reserved_quantity = 0
          AND jsonb_typeof(changes.before_data->'offer') IS DISTINCT FROM 'object'`,
      [runId, run.supplier_id]
    );
    await query(
      `UPDATE supplier_feed_runs
          SET rollback_status = 'completed', rolled_back_at = now(), rolled_back_by = $2
        WHERE id = $1`,
      [runId, actorId]
    );
    return {
      id: runId,
      feedId: run.feed_id,
      feedName: run.feed_name,
      restoredOffers: changes.filter((item) => item.before_data?.offer).length,
      archivedOffers: changes.filter((item) => !item.before_data?.offer).length,
      affectedProducts: productIds.length
    };
  } catch (error) {
    await query(
      "UPDATE supplier_feed_runs SET rollback_status = 'failed' WHERE id = $1",
      [runId]
    ).catch(() => null);
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
