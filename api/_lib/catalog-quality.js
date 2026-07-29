import { createHash, randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { query } from "./db.js";

const structuralIssueTypes = [
  "missing_image", "invalid_image_url", "missing_source", "invalid_source_url",
  "missing_specs", "missing_brand", "missing_category", "stale_price",
  "expired_price", "unknown_stock", "duplicate_name", "invalid_offer_price",
  "offer_missing_source", "offer_stale_price", "offer_unknown_stock"
];
const linkIssueTypes = ["broken_image_url", "invalid_image_content", "broken_source_url"];

const issueId = (key) => `cqi-${createHash("sha256").update(key).digest("hex").slice(0, 28)}`;
const issue = (entityType, entityId, issueType, severity, detail) => {
  const issueKey = `${entityType}:${entityId}:${issueType}`;
  return { id: issueId(issueKey), issueKey, entityType, entityId, issueType, severity, detail };
};

const isPrivateAddress = (address) => {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return a === 10 || a === 127 || a === 0
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 100 && b >= 64 && b <= 127)
      || a >= 224;
  }
  const value = address.toLowerCase();
  return value === "::1" || value === "::" || value.startsWith("fc") || value.startsWith("fd")
    || value.startsWith("fe8") || value.startsWith("fe9") || value.startsWith("fea")
    || value.startsWith("feb") || value.startsWith("ff");
};

const validatePublicUrl = async (value) => {
  let url;
  try {
    url = new URL(String(value || ""));
  } catch {
    return { ok: false, reason: "URL formatı düzgün deyil" };
  }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) {
    return { ok: false, reason: "Yalnız standart HTTPS URL qəbul edilir" };
  }
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".local") || isIP(hostname)) {
    return { ok: false, reason: "Lokal və IP əsaslı URL bloklanıb" };
  }
  try {
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    if (!addresses.length || addresses.some((item) => isPrivateAddress(item.address))) {
      return { ok: false, reason: "URL ictimai şəbəkəyə aid deyil" };
    }
  } catch {
    return { ok: false, reason: "Domen həll olunmadı" };
  }
  return { ok: true, url };
};

const probeUrl = async (value, kind) => {
  const valid = await validatePublicUrl(value);
  if (!valid.ok) return valid;
  try {
    const response = await fetch(valid.url, {
      method: "HEAD",
      redirect: "manual",
      signal: AbortSignal.timeout(5_000),
      headers: { "User-Agent": "ConstEra-Quality-Monitor/1.0" }
    });
    if ([401, 403, 405, 429].includes(response.status) || (response.status >= 200 && response.status < 400)) {
      const contentType = String(response.headers.get("content-type") || "").toLowerCase();
      if (kind === "image" && response.status < 300 && contentType && !contentType.startsWith("image/")) {
        return { ok: false, reason: `Şəkil URL-i ${contentType} qaytarır`, contentMismatch: true };
      }
      return { ok: true };
    }
    return { ok: false, reason: `Mənbə HTTP ${response.status} qaytarır` };
  } catch {
    return { ok: false, reason: "Mənbə vaxt limitində cavab vermədi" };
  }
};

const upsertIssues = async (runId, issues) => {
  if (!issues.length) return;
  await query(
    `WITH incoming AS (
       SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
         id text, "issueKey" text, "entityType" text, "entityId" text,
         "issueType" text, severity text, detail text
       )
     )
     INSERT INTO catalog_quality_issues (
       id, issue_key, entity_type, entity_id, issue_type, severity,
       detail, status, last_seen_at, last_checked_at, last_run_id
     )
     SELECT id, "issueKey", "entityType", "entityId", "issueType", severity,
            detail, 'open', now(), now(), $2
       FROM incoming
     ON CONFLICT (issue_key) DO UPDATE SET
       severity = EXCLUDED.severity,
       detail = EXCLUDED.detail,
       status = CASE WHEN catalog_quality_issues.status = 'ignored' THEN 'ignored' ELSE 'open' END,
       last_seen_at = now(),
       last_checked_at = now(),
       last_run_id = $2,
       resolved_at = NULL`,
    [JSON.stringify(issues), runId]
  );
};

const resolveMissingIssues = async (runId, issueTypes, activeKeys) => {
  const rows = await query(
    `UPDATE catalog_quality_issues
        SET status = 'resolved', resolved_at = now(), last_checked_at = now(), last_run_id = $1
      WHERE status = 'open'
        AND issue_type = ANY($2::text[])
        AND NOT (issue_key = ANY($3::text[]))
      RETURNING id`,
    [runId, issueTypes, activeKeys.length ? activeKeys : ["none"]]
  );
  return rows.length;
};

const buildStructuralIssues = (products, offers) => {
  const issues = [];
  const duplicateCounts = new Map();
  products.forEach((product) => {
    const key = `${String(product.name || "").trim().toLowerCase()}::${String(product.brand || "").trim().toLowerCase()}`;
    duplicateCounts.set(key, Number(duplicateCounts.get(key) || 0) + 1);
  });
  products.forEach((product) => {
    const specsCount = Array.isArray(product.specs) ? product.specs.length : 0;
    const duplicateKey = `${String(product.name || "").trim().toLowerCase()}::${String(product.brand || "").trim().toLowerCase()}`;
    if (!product.image_url) issues.push(issue("product", product.id, "missing_image", "high", "Real məhsul fotosu yoxdur."));
    else if (!/^(?:\/|assets\/|https:\/\/)/i.test(product.image_url)) issues.push(issue("product", product.id, "invalid_image_url", "high", "Şəkil URL-i düzgün deyil."));
    if (!product.source_url) issues.push(issue("product", product.id, "missing_source", "high", "Məhsul mənbəsi göstərilməyib."));
    else if (!/^https:\/\//i.test(product.source_url)) issues.push(issue("product", product.id, "invalid_source_url", "high", "Mənbə HTTPS deyil."));
    if (specsCount < 2) issues.push(issue("product", product.id, "missing_specs", "medium", "Texniki xüsusiyyətlər kifayət deyil."));
    if (!product.brand) issues.push(issue("product", product.id, "missing_brand", "medium", "Brend göstərilməyib."));
    if (!product.category_id) issues.push(issue("product", product.id, "missing_category", "high", "Aktiv kateqoriya seçilməyib."));
    if (product.price_status === "confirmed" && (!product.price_verified_at || Date.now() - Date.parse(product.price_verified_at) > 30 * 86_400_000)) {
      issues.push(issue("product", product.id, "stale_price", "high", "Təsdiqli qiymət 30 gündən köhnədir."));
    }
    if (product.price_status === "expired") issues.push(issue("product", product.id, "expired_price", "high", "Qiymətin vaxtı keçib."));
    if (product.stock_quantity === null) issues.push(issue("product", product.id, "unknown_stock", "medium", "Stok miqdarı dəqiqləşdirilməyib."));
    if (duplicateCounts.get(duplicateKey) > 1) issues.push(issue("product", product.id, "duplicate_name", "medium", "Eyni ad və brendlə təkrarlanan məhsul var."));
  });
  offers.forEach((offer) => {
    if (offer.price_status === "confirmed" && (offer.unit_price === null || Number(offer.unit_price) < 0)) {
      issues.push(issue("product_offer", offer.id, "invalid_offer_price", "critical", "Təsdiqli təklifin qiyməti düzgün deyil."));
    }
    if (!offer.source_url) issues.push(issue("product_offer", offer.id, "offer_missing_source", "high", "Təklifin qiymət mənbəsi yoxdur."));
    if (offer.price_status === "confirmed" && (!offer.price_verified_at || Date.now() - Date.parse(offer.price_verified_at) > 30 * 86_400_000)) {
      issues.push(issue("product_offer", offer.id, "offer_stale_price", "high", "Təklifin qiyməti 30 gündən köhnədir."));
    }
    if (offer.stock_quantity === null) issues.push(issue("product_offer", offer.id, "offer_unknown_stock", "medium", "Təklifin stok miqdarı bilinmir."));
  });
  return issues;
};

export const runCatalogQualityScan = async ({ probeLinks = true, linkLimit = 12 } = {}) => {
  const runId = `cqr-${randomUUID()}`;
  await query("INSERT INTO catalog_quality_runs (id) VALUES ($1)", [runId]);
  try {
    const [products, offers] = await Promise.all([
      query(
        `SELECT id, sku, name, brand, category_id, specs, image_url, source_url,
                price_status, price_verified_at, stock_quantity, updated_at
           FROM products
          WHERE status = 'active'
            AND lower(trim(coalesce(brand, ''))) <> 'constera sorğu'
            AND lower(name) NOT LIKE '%məhsul qrupu%'
            AND upper(sku) NOT LIKE '%RFQ%'`
      ),
      query(
        `SELECT id, product_id, unit_price, price_status, price_verified_at,
                stock_quantity, source_url, updated_at
           FROM product_offers WHERE status = 'active'`
      )
    ]);
    const structural = buildStructuralIssues(products, offers);
    await upsertIssues(runId, structural);
    let resolved = await resolveMissingIssues(runId, structuralIssueTypes, structural.map((item) => item.issueKey));
    const linkIssues = [];
    let probedUrls = 0;
    if (probeLinks) {
      const scanDay = new Date().toISOString().slice(0, 10);
      const candidates = products
        .flatMap((product) => [
          product.image_url?.startsWith("https://") ? { entityId: product.id, type: "image", url: product.image_url } : null,
          product.source_url?.startsWith("https://") ? { entityId: product.id, type: "source", url: product.source_url } : null
        ])
        .filter(Boolean)
        .map((candidate) => ({
          ...candidate,
          sortKey: createHash("sha1").update(`${scanDay}:${candidate.entityId}:${candidate.type}`).digest("hex")
        }))
        .sort((left, right) => left.sortKey.localeCompare(right.sortKey))
        .slice(0, Math.max(0, Math.min(Number(linkLimit) || 12, 20)));
      const probeResults = await Promise.all(candidates.map(async (candidate) => ({
        candidate,
        result: await probeUrl(candidate.url, candidate.type)
      })));
      for (const { candidate, result } of probeResults) {
        probedUrls += 1;
        const type = candidate.type === "image"
          ? (result.contentMismatch ? "invalid_image_content" : "broken_image_url")
          : "broken_source_url";
        const key = `product:${candidate.entityId}:${type}`;
        if (!result.ok) linkIssues.push(issue("product", candidate.entityId, type, "high", result.reason));
        else {
          resolved += (await query(
            `UPDATE catalog_quality_issues
                SET status = 'resolved', resolved_at = now(), last_checked_at = now(), last_run_id = $1
              WHERE issue_key = $2 AND status = 'open' RETURNING id`,
            [runId, key]
          )).length;
        }
      }
      await upsertIssues(runId, linkIssues);
    }
    const openRows = await query("SELECT count(*)::int AS count FROM catalog_quality_issues WHERE status = 'open'");
    const summary = {
      structuralIssues: structural.length,
      linkIssues: linkIssues.length,
      criticalIssues: structural.filter((item) => item.severity === "critical").length,
      openIssues: Number(openRows[0]?.count || 0)
    };
    await query(
      `UPDATE catalog_quality_runs
          SET status = 'completed', scanned_products = $2, scanned_offers = $3,
              open_issues = $4, resolved_issues = $5, probed_urls = $6,
              summary = $7::jsonb, completed_at = now()
        WHERE id = $1`,
      [runId, products.length, offers.length, summary.openIssues, resolved, probedUrls, JSON.stringify(summary)]
    );
    return { id: runId, ...summary, scannedProducts: products.length, scannedOffers: offers.length, resolvedIssues: resolved, probedUrls };
  } catch (error) {
    await query(
      "UPDATE catalog_quality_runs SET status = 'failed', error_text = $2, completed_at = now() WHERE id = $1",
      [runId, String(error.message || "Keyfiyyət skanı xətası").slice(0, 500)]
    );
    throw error;
  }
};

export const qualityIssueTypes = Object.freeze([...structuralIssueTypes, ...linkIssueTypes]);
