import { createHash, randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { query } from "./db.js";
import {
  countTechnicalAttributes,
  normalizeProductAttributes
} from "./product-attributes.js";

const structuralIssueTypes = [
  "missing_image", "missing_licensed_media", "invalid_image_url", "missing_source", "invalid_source_url",
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

export const validatePublicUrl = async (value) => {
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

export const buildCatalogStructuralIssues = (products, offers) => {
  const issues = [];
  const duplicateCounts = new Map();
  products.forEach((product) => {
    const key = `${String(product.name || "").trim().toLowerCase()}::${String(product.brand || "").trim().toLowerCase()}`;
    duplicateCounts.set(key, Number(duplicateCounts.get(key) || 0) + 1);
  });
  products.forEach((product) => {
    const specsCount = Array.isArray(product.specs) ? product.specs.length : 0;
    const duplicateKey = `${String(product.name || "").trim().toLowerCase()}::${String(product.brand || "").trim().toLowerCase()}`;
    const mediaSeverity = product.has_eligible_offer ? "high" : "medium";
    if (!product.image_url) issues.push(issue("product", product.id, "missing_image", mediaSeverity, "Real məhsul fotosu yoxdur."));
    else if (!/^(?:\/|assets\/|https:\/\/)/i.test(product.image_url)) issues.push(issue("product", product.id, "invalid_image_url", "high", "Şəkil URL-i düzgün deyil."));
    if (!product.has_licensed_media) {
      issues.push(issue(
        "product",
        product.id,
        "missing_licensed_media",
        mediaSeverity,
        "Şəkil üçün istifadə hüququ ayrıca yoxlanılmayıb və təsdiqlənməyib."
      ));
    }
    if (!product.source_url) issues.push(issue("product", product.id, "missing_source", "high", "Məhsul mənbəsi göstərilməyib."));
    else if (!/^https:\/\//i.test(product.source_url)) issues.push(issue("product", product.id, "invalid_source_url", "high", "Mənbə HTTPS deyil."));
    if (specsCount < 2) issues.push(issue("product", product.id, "missing_specs", "medium", "Texniki xüsusiyyətlər kifayət deyil."));
    if (!product.brand) issues.push(issue("product", product.id, "missing_brand", "medium", "Brend göstərilməyib."));
    if (!product.category_id) issues.push(issue("product", product.id, "missing_category", "high", "Aktiv kateqoriya seçilməyib."));
    if (product.price_status === "confirmed" && (!product.price_verified_at || Date.now() - Date.parse(product.price_verified_at) > 30 * 86_400_000)) {
      issues.push(issue("product", product.id, "stale_price", "high", "Təsdiqli qiymət 30 gündən köhnədir."));
    }
    if (product.price_status === "expired") issues.push(issue("product", product.id, "expired_price", "high", "Qiymətin vaxtı keçib."));
    const explicitRequestStock = product.price_status !== "confirmed"
      || /sorğu|sorgu|sifariş|sifaris|dəqiqləş|deqiqles/i.test(String(product.availability || ""));
    if (product.stock_quantity === null && !explicitRequestStock) {
      issues.push(issue("product", product.id, "unknown_stock", "medium", "Satışda göstərilən məhsulun stok miqdarı dəqiqləşdirilməyib."));
    }
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
    if (offer.stock_quantity === null && offer.price_status === "confirmed") {
      issues.push(issue("product_offer", offer.id, "offer_unknown_stock", "medium", "Təsdiqli təklifin stok miqdarı bilinmir."));
    }
  });
  return issues;
};

export const runCatalogQualityScan = async ({ probeLinks = true, linkLimit = 12 } = {}) => {
  const runId = `cqr-${randomUUID()}`;
  await query("INSERT INTO catalog_quality_runs (id) VALUES ($1)", [runId]);
  try {
    const [products, offers] = await Promise.all([
      query(
        `SELECT product.id, product.sku, product.name, product.brand, product.category_id,
                product.specs, product.image_url, product.source_url, product.price_status,
                product.price_verified_at, product.stock_quantity, product.availability,
                product.updated_at,
                EXISTS (
                  SELECT 1
                    FROM product_offers eligible_offer
                   WHERE eligible_offer.product_id = product.id
                     AND eligible_offer.status = 'active'
                     AND eligible_offer.price_status = 'confirmed'
                     AND eligible_offer.unit_price > 0
                     AND eligible_offer.price_verified_at >= now() - interval '30 days'
                     AND eligible_offer.stock_quantity > 0
                     AND eligible_offer.source_url ~ '^https://'
                ) AS has_eligible_offer,
                EXISTS (
                  SELECT 1
                    FROM media_assets media
                   WHERE media.entity_type = 'product'
                     AND media.entity_id = product.id
                     AND media.status = 'active'
                     AND media.content_type LIKE 'image/%'
                     AND media.license_type IN ('own', 'supplier', 'official', 'licensed')
                     AND media.rights_status = 'verified'
                     AND (media.rights_expires_on IS NULL OR media.rights_expires_on >= current_date)
                ) AS has_licensed_media
           FROM products product
          WHERE product.status = 'active'
            AND lower(trim(coalesce(product.brand, ''))) <> 'constera sorğu'
            AND lower(product.name) NOT LIKE '%məhsul qrupu%'
            AND upper(product.sku) NOT LIKE '%RFQ%'`
      ),
      query(
        `SELECT id, product_id, unit_price, price_status, price_verified_at,
                stock_quantity, source_url, updated_at
           FROM product_offers WHERE status = 'active'`
      )
    ]);
    const structural = buildCatalogStructuralIssues(products, offers);
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

const loadAttributeCandidates = async () => {
  const rows = await query(
    `SELECT id, name, package_text, origin, specs, extra_data
       FROM products
      WHERE status = 'active'
        AND lower(trim(coalesce(brand, ''))) <> 'constera sorğu'
        AND lower(name) NOT LIKE '%məhsul qrupu%'
        AND upper(sku) NOT LIKE '%RFQ%'
      ORDER BY id`
  );
  return rows.map((row) => {
    const current = Array.isArray(row.extra_data?.attributes) ? row.extra_data.attributes : [];
    const attributes = normalizeProductAttributes({
      name: row.name,
      specs: row.specs,
      packageText: row.package_text,
      origin: row.origin,
      storedAttributes: current
    }).map(({ label, value }) => ({ label, value }));
    return {
      id: row.id,
      name: row.name,
      currentCount: current.length,
      attributeCount: attributes.length,
      technicalCount: countTechnicalAttributes(attributes),
      attributes,
      changed: JSON.stringify(current) !== JSON.stringify(attributes)
    };
  }).filter((item) => item.changed && item.technicalCount > 0);
};

export const previewCatalogAttributeNormalization = async () => {
  const candidates = await loadAttributeCandidates();
  return {
    candidateProducts: candidates.length,
    technicalAttributes: candidates.reduce((sum, item) => sum + item.technicalCount, 0),
    sample: candidates.slice(0, 20).map(({ id, name, attributeCount, technicalCount, attributes }) => ({
      id,
      name,
      attributeCount,
      technicalCount,
      attributes
    }))
  };
};

export const normalizeCatalogAttributes = async ({ actorId = null } = {}) => {
  const candidates = await loadAttributeCandidates();
  if (!candidates.length) return { updatedProducts: 0, technicalAttributes: 0 };
  const rows = await query(
    `WITH incoming AS (
       SELECT *
         FROM jsonb_to_recordset($1::jsonb) AS item(id text, attributes jsonb)
     )
     UPDATE products product
        SET extra_data = jsonb_set(
              coalesce(product.extra_data, '{}'::jsonb),
              '{attributes}',
              incoming.attributes,
              true
            ),
            updated_at = now()
       FROM incoming
      WHERE product.id = incoming.id
      RETURNING product.id`,
    [JSON.stringify(candidates.map((item) => ({ id: item.id, attributes: item.attributes })))]
  );
  return {
    updatedProducts: rows.length,
    technicalAttributes: candidates.reduce((sum, item) => sum + item.technicalCount, 0),
    actorId
  };
};

const remediationRows = async (issueIds = []) => {
  const values = [];
  const where = ["issue.status = 'open'"];
  if (issueIds.length) {
    values.push(issueIds);
    where.push(`issue.id = ANY($${values.length}::text[])`);
  }
  return query(
    `SELECT issue.*, product.name, product.brand, product.status AS product_status,
            product.price_status AS product_price_status,
            product.image_url, product.source_url,
            offer.product_id AS offer_product_id,
            offer.price_status AS offer_price_status
       FROM catalog_quality_issues issue
       LEFT JOIN products product
         ON issue.entity_type = 'product' AND product.id = issue.entity_id
       LEFT JOIN product_offers offer
         ON issue.entity_type = 'product_offer' AND offer.id = issue.entity_id
      WHERE ${where.join(" AND ")}
      ORDER BY issue.first_seen_at
      LIMIT 500`,
    values
  );
};

export const previewCatalogRemediation = async (issueIds = []) => {
  const rows = await remediationRows(issueIds);
  const unverifiedProducts = new Set(rows.filter((row) =>
    row.entity_type === "product"
    && ["missing_image", "missing_source"].includes(row.issue_type)
    && row.product_status === "active"
    && row.product_price_status === "request"
    && !row.image_url
    && !row.source_url
  ).map((row) => row.entity_id));
  const duplicateProducts = new Set(rows.filter((row) => row.issue_type === "duplicate_name").map((row) => row.entity_id));
  const safeFieldFixes = rows.filter((row) => [
    "invalid_image_url", "broken_image_url", "invalid_image_content",
    "invalid_source_url", "broken_source_url", "stale_price", "expired_price",
    "invalid_offer_price", "offer_stale_price"
  ].includes(row.issue_type));
  return {
    selectedIssues: rows.length,
    quarantineProducts: unverifiedProducts.size,
    duplicateProducts: duplicateProducts.size,
    safeFieldFixes: safeFieldFixes.length,
    manualIssues: Math.max(0, rows.length - unverifiedProducts.size - duplicateProducts.size - safeFieldFixes.length)
  };
};

const logRemediation = async ({ runId, issueId, entityType, entityId, action, before, after, actorId }) => {
  await query(
    `INSERT INTO catalog_quality_remediations (
       id, run_id, issue_id, entity_type, entity_id, action,
       before_data, after_data, actor_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9)`,
    [
      `cqm-${randomUUID()}`, runId || null, issueId || null, entityType, entityId, action,
      JSON.stringify(before || {}), JSON.stringify(after || {}), actorId || null
    ]
  );
};

const quarantineUnverifiedProducts = async (rows, actorId) => {
  const candidates = new Map();
  rows.forEach((row) => {
    if (
      row.entity_type === "product"
      && ["missing_image", "missing_source"].includes(row.issue_type)
      && row.product_status === "active"
      && row.product_price_status === "request"
      && !row.image_url
      && !row.source_url
    ) {
      const current = candidates.get(row.entity_id) || { issueId: row.id, issues: [] };
      current.issues.push(row.issue_type);
      candidates.set(row.entity_id, current);
    }
  });
  let count = 0;
  for (const [productId, candidate] of candidates) {
    if (!candidate.issues.includes("missing_image") || !candidate.issues.includes("missing_source")) continue;
    const updated = await query(
      `UPDATE products
          SET status = 'draft',
              price_note = CASE
                WHEN NULLIF(price_note, '') IS NULL THEN 'Real mənbə və foto təsdiqi gözlənilir'
                ELSE price_note
              END,
              updated_at = now()
        WHERE id = $1 AND status = 'active' AND price_status = 'request'
          AND NULLIF(image_url, '') IS NULL AND NULLIF(source_url, '') IS NULL
      RETURNING id, sku, name`,
      [productId]
    );
    if (!updated[0]) continue;
    await query("UPDATE product_offers SET status = 'draft', updated_at = now() WHERE product_id = $1 AND status = 'active'", [productId]);
    await logRemediation({
      issueId: candidate.issueId,
      entityType: "product",
      entityId: productId,
      action: "quarantine_unverified",
      before: { status: "active", issues: candidate.issues },
      after: { status: "draft" },
      actorId
    });
    count += 1;
  }
  return count;
};

const archiveDuplicateProducts = async (rows, actorId) => {
  const duplicateIds = [...new Set(rows.filter((row) => row.issue_type === "duplicate_name").map((row) => row.entity_id))];
  if (!duplicateIds.length) return 0;
  const duplicateRows = await query(
    `SELECT candidate.*
       FROM products candidate
       JOIN products selected
         ON lower(trim(candidate.name)) = lower(trim(selected.name))
        AND lower(trim(candidate.brand)) = lower(trim(selected.brand))
      WHERE selected.id = ANY($1::text[]) AND candidate.status = 'active'`,
    [duplicateIds]
  );
  const groups = new Map();
  duplicateRows.forEach((product) => {
    const key = `${String(product.name).trim().toLowerCase()}::${String(product.brand).trim().toLowerCase()}`;
    const list = groups.get(key) || [];
    list.push(product);
    groups.set(key, list);
  });
  let count = 0;
  for (const products of groups.values()) {
    if (products.length < 2) continue;
    const score = (product) =>
      (product.source_url ? 8 : 0)
      + (product.image_url ? 6 : 0)
      + (product.price_status === "confirmed" ? 4 : 0)
      + (product.stock_quantity !== null ? 2 : 0)
      + (product.source_label ? 1 : 0)
      + Math.min(1, Date.parse(product.updated_at) / 1e15);
    products.sort((left, right) => score(right) - score(left));
    const keeper = products[0];
    for (const duplicate of products.slice(1)) {
      const updated = await query(
        "UPDATE products SET status = 'archived', updated_at = now() WHERE id = $1 AND status = 'active' RETURNING id",
        [duplicate.id]
      );
      if (!updated[0]) continue;
      await query("UPDATE product_offers SET status = 'archived', updated_at = now() WHERE product_id = $1 AND status = 'active'", [duplicate.id]);
      await logRemediation({
        issueId: rows.find((row) => row.entity_id === duplicate.id && row.issue_type === "duplicate_name")?.id,
        entityType: "product",
        entityId: duplicate.id,
        action: "archive_duplicate",
        before: { status: "active", name: duplicate.name },
        after: { status: "archived", canonicalProductId: keeper.id },
        actorId
      });
      count += 1;
    }
  }
  return count;
};

const applySafeFieldFixes = async (rows, actorId) => {
  let count = 0;
  for (const row of rows) {
    let updated = [];
    let after = {};
    if (row.entity_type === "product" && ["invalid_image_url", "broken_image_url", "invalid_image_content"].includes(row.issue_type)) {
      updated = await query("UPDATE products SET image_url = NULL, updated_at = now() WHERE id = $1 RETURNING id", [row.entity_id]);
      after = { imageUrl: null };
    } else if (row.entity_type === "product" && ["invalid_source_url", "broken_source_url"].includes(row.issue_type)) {
      updated = await query(
        `UPDATE products
            SET source_url = NULL, price_amount = NULL, price_status = 'request',
                price_text = 'Sorğu əsasında', price_verified_at = NULL, updated_at = now()
          WHERE id = $1 RETURNING id`,
        [row.entity_id]
      );
      after = { sourceUrl: null, priceAmount: null, priceStatus: "request", priceVerifiedAt: null };
    } else if (row.entity_type === "product" && ["stale_price", "expired_price"].includes(row.issue_type)) {
      updated = await query(
        "UPDATE products SET price_status = 'request', price_text = 'Sorğu əsasında', price_verified_at = NULL, updated_at = now() WHERE id = $1 RETURNING id",
        [row.entity_id]
      );
      after = { priceStatus: "request", priceVerifiedAt: null };
    } else if (row.entity_type === "product_offer" && ["invalid_offer_price", "offer_stale_price"].includes(row.issue_type)) {
      updated = await query(
        `UPDATE product_offers
            SET unit_price = NULL, price_status = 'request', price_text = 'Sorğu əsasında',
                price_verified_at = NULL, updated_at = now()
          WHERE id = $1 RETURNING id`,
        [row.entity_id]
      );
      after = { unitPrice: null, priceStatus: "request", priceVerifiedAt: null };
    }
    if (!updated[0]) continue;
    await logRemediation({
      issueId: row.id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      action: `normalize_${row.issue_type}`,
      before: { issueType: row.issue_type },
      after,
      actorId
    });
    await query(
      `UPDATE catalog_quality_issues
          SET status = 'resolved', resolved_at = now(), last_checked_at = now()
        WHERE id = $1 AND status = 'open'`,
      [row.id]
    );
    count += 1;
  }
  return count;
};

export const remediateCatalogIssues = async ({ issueIds = [], actorId = null } = {}) => {
  const selected = [...new Set(issueIds.map(String).filter(Boolean))].slice(0, 500);
  const rows = await remediationRows(selected);
  const quarantinedProducts = await quarantineUnverifiedProducts(rows, actorId);
  const archivedDuplicates = await archiveDuplicateProducts(rows, actorId);
  const safeFieldFixes = await applySafeFieldFixes(rows, actorId);
  const scan = await runCatalogQualityScan({ probeLinks: false, linkLimit: 0 });
  return {
    selectedIssues: rows.length,
    quarantinedProducts,
    archivedDuplicates,
    safeFieldFixes,
    remainingOpenIssues: scan.openIssues,
    scan
  };
};
