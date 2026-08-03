import "./load-local-env.mjs";
import { createHash, randomUUID } from "node:crypto";
import { probeExternalImage } from "../api/_admin/media.js";
import { validatePublicUrl } from "../api/_lib/catalog-quality.js";
import { query } from "../api/_lib/db.js";

if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
  console.error("DATABASE_URL tapılmadı. Neon bağlantısını .env.local faylında qur.");
  process.exit(1);
}

const limitArgument = process.argv.find((argument) => argument.startsWith("--limit="));
const limit = Math.max(1, Math.min(Number(limitArgument?.split("=")[1] || 20), 100));
const commit = process.argv.includes("--commit");
const candidates = await query(
  `SELECT product.id, product.sku, product.name, product.image_url, product.source_url
     FROM products product
    WHERE product.status = 'active'
      AND product.image_url ~ '^https://'
      AND product.source_url ~ '^https://'
      AND NOT EXISTS (
        SELECT 1 FROM media_assets media
         WHERE media.entity_type = 'product'
           AND media.entity_id = product.id
           AND media.status = 'active'
           AND media.url = product.image_url
      )
    ORDER BY
      EXISTS (
        SELECT 1 FROM product_offers offer
         WHERE offer.product_id = product.id
           AND offer.status = 'active'
           AND offer.price_status = 'confirmed'
           AND offer.stock_quantity > 0
      ) DESC,
      product.updated_at DESC
    LIMIT $1`,
  [limit]
);

console.log(`${candidates.length} açıq mənbə şəkli yoxlanacaq${commit ? " və referans kimi yazılacaq" : " (ön baxış)"}.`);
let succeeded = 0;
let failed = 0;
for (const product of candidates) {
  try {
    const source = await validatePublicUrl(product.source_url);
    if (!source.ok) throw new Error(`mənbə: ${source.reason}`);
    const media = await probeExternalImage(product.image_url);
    if (commit) {
      const hash = createHash("sha256").update(media.url).digest("hex");
      await query(
        `INSERT INTO media_assets (
           id, owner_id, entity_type, entity_id, filename, pathname, url,
           content_type, size_bytes, provider, alt_text, source_url,
           license_type, license_note, is_primary, rights_status,
           rights_review_note, updated_at
         ) VALUES (
           $1, NULL, 'product', $2, $3, $4, $5,
           $6, $7, 'external', $8, $9,
           'reference', $10, false, 'pending', $11, now()
         )`,
        [
          `med-${randomUUID()}`,
          product.id,
          media.filename,
          `external:${hash}`,
          media.url,
          media.contentType,
          media.sizeBytes,
          product.name,
          source.url.toString(),
          "Açıq məhsul mənbəyi; kommersiya istifadə hüququ təsdiqlənməyib.",
          "Administrator və ya təchizatçı hüquq sübutunu ayrıca təqdim etməlidir."
        ]
      );
    }
    console.log(`- OK ${product.sku} · ${product.name}`);
    succeeded += 1;
  } catch (error) {
    console.warn(`- XƏTA ${product.sku} · ${String(error.message || error)}`);
    failed += 1;
  }
}

console.log(`Nəticə: ${succeeded} uyğun, ${failed} uğursuz${commit ? ", hüquq statusu pending" : ", bazaya yazılmadı"}.`);
