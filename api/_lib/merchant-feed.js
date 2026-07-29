export const escapeMerchantXml = (value) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&apos;");

const cleanText = (value, max) => String(value || "")
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, max);

const validGtin = (value) => {
  const candidate = String(value || "").replace(/\s+/g, "");
  return [8, 12, 13, 14].includes(candidate.length) && /^\d+$/.test(candidate)
    ? candidate
    : "";
};

const productDescription = (row) => {
  const specs = Array.isArray(row.specs)
    ? row.specs
    : row.specs && typeof row.specs === "object"
      ? Object.entries(row.specs).map(([key, value]) => `${key}: ${value}`)
      : [];
  return cleanText([
    row.package_text,
    row.origin,
    ...specs
  ].filter(Boolean).join(". ") || row.name, 5_000);
};

export const buildMerchantFeedXml = (rows, origin = "https://constera.az") => {
  const safeOrigin = String(origin || "https://constera.az").replace(/\/+$/, "");
  const generatedAt = new Date().toUTCString();
  const items = rows.map((row) => {
    const productUrl = new URL("/product-detail.html", `${safeOrigin}/`);
    productUrl.searchParams.set("product", row.id);
    const gtin = validGtin(row.barcode);
    const brand = cleanText(row.brand, 70);
    const productType = cleanText(
      [row.category_title, row.subcategory].filter(Boolean).join(" > "),
      750
    );
    return `    <item>
      <g:id>${escapeMerchantXml(cleanText(row.sku || row.id, 50))}</g:id>
      <title>${escapeMerchantXml(cleanText(row.name, 150))}</title>
      <description>${escapeMerchantXml(productDescription(row))}</description>
      <link>${escapeMerchantXml(productUrl.toString())}</link>
      <g:image_link>${escapeMerchantXml(row.media_url)}</g:image_link>
      <g:availability>${Number(row.stock_quantity) > 0 ? "in_stock" : "out_of_stock"}</g:availability>
      <g:price>${Number(row.price_amount).toFixed(2)} ${escapeMerchantXml(row.price_currency || "AZN")}</g:price>
      <g:condition>new</g:condition>
      ${brand && brand.toLowerCase() !== "brendsiz" ? `<g:brand>${escapeMerchantXml(brand)}</g:brand>` : ""}
      ${productType ? `<g:product_type>${escapeMerchantXml(productType)}</g:product_type>` : ""}
      ${gtin ? `<g:gtin>${gtin}</g:gtin>` : "<g:identifier_exists>no</g:identifier_exists>"}
      <g:adult>no</g:adult>
    </item>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
  <channel>
    <title>ConstEra təsdiqli məhsullar</title>
    <link>${escapeMerchantXml(`${safeOrigin}/catalog.html`)}</link>
    <description>Azərbaycan tikinti bazarı üçün mənbəsi, qiyməti, stoku və media hüququ yoxlanmış məhsullar.</description>
    <lastBuildDate>${generatedAt}</lastBuildDate>
${items}
  </channel>
</rss>`;
};
