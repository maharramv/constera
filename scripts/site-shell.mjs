import { readFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const readTemplate = (name) => readFileSync(`${scriptDirectory}/../templates/${name}`, "utf8").trim();

const siteHeaderTemplate = readTemplate("site-header.html");
const authHeaderTemplate = readTemplate("auth-header.html");
const siteFooterTemplate = readTemplate("site-footer.html");

export const navigationItems = Object.freeze([
  { key: "home", href: "index.html#home", label: "Ana səhifə" },
  { key: "catalog", href: "catalog.html", label: "Kataloq" },
  { key: "services", href: "services.html", label: "Xidmətlər" },
  { key: "packages", href: "packages.html", label: "Paketlər" },
  { key: "rental", href: "rental.html", label: "İcarə" },
  { key: "brands", href: "brands.html", label: "Brendlər" },
  { key: "suppliers", href: "suppliers.html", label: "Təchizatçılar" },
  { key: "supplier-portal", href: "supplier-portal.html", label: "Təchizatçı kabineti" },
  { key: "price-import", href: "price-import.html", label: "Qiymət idxalı" },
  { key: "customer-cabinet", href: "customer-cabinet.html", label: "Kabinet" },
  { key: "checkout", href: "checkout.html", label: "Səbət" },
  { key: "rfq-dashboard", href: "rfq-dashboard.html", label: "Sorğu paneli" },
  { key: "tender", href: "tender.html", label: "Tender" },
  { key: "ai-smeta", href: "ai-smeta.html", label: "Ağıllı smeta" },
  { key: "admin", href: "admin.html", label: "İdarəetmə" }
]);

const activeNavigationByPage = Object.freeze({
  home: "home",
  catalog: "catalog",
  category: "catalog",
  subcategory: "catalog",
  "product-detail": "catalog",
  services: "services",
  "service-detail": "services",
  packages: "packages",
  "package-detail": "packages",
  rental: "rental",
  "rental-detail": "rental",
  brands: "brands",
  suppliers: "suppliers",
  "supplier-portal": "supplier-portal",
  "price-import": "price-import",
  "customer-cabinet": "customer-cabinet",
  checkout: "checkout",
  rfq: "rfq",
  "rfq-dashboard": "rfq-dashboard",
  tender: "tender",
  "ai-smeta": "ai-smeta",
  admin: "admin"
});

const pageNameFromHtml = (html) => html.match(/<body\b[^>]*\bdata-page=["']([^"']+)["']/i)?.[1] || "home";
const currentAttribute = (active, key) => active === key ? ' aria-current="page"' : "";

const renderNavigation = (pageName) => {
  const active = activeNavigationByPage[pageName] || "";
  const links = navigationItems.map((item) =>
    `    <a href="${item.href}"${currentAttribute(active, item.key)}>${item.label}</a>`);
  links.push(`    <a class="button button-outline nav-cta" href="rfq.html"${currentAttribute(active, "rfq")}>Qiymət sorğusu</a>`);
  return links.join("\n");
};

const renderHeader = (pageName) => {
  if (pageName === "login") return authHeaderTemplate;
  return siteHeaderTemplate.replace("{{NAVIGATION}}", renderNavigation(pageName));
};

const ensureMainId = (html) => html.replace(/<main(?![^>]*\bid=)([^>]*)>/i, '<main id="main-content"$1>');
const ensurePwaMetadata = (html) => {
  const tags = [];
  if (!/<link\b[^>]*\brel=["']manifest["']/i.test(html)) {
    tags.push('    <link rel="manifest" href="assets/icons/site.webmanifest" />');
  }
  if (!/<link\b[^>]*\brel=["']apple-touch-icon["']/i.test(html)) {
    tags.push('    <link rel="apple-touch-icon" href="assets/icons/apple-touch-icon.png" />');
  }
  return tags.length ? html.replace(/<\/head>/i, `${tags.join("\n")}\n  </head>`) : html;
};
const shouldRenderFooter = (pageName) => !["admin", "login"].includes(pageName);

export const renderSitePage = (source, options = {}) => {
  const file = basename(options.file || "index.html");
  const pageName = pageNameFromHtml(source);
  const headerPattern = /<header\b[^>]*\bclass=["'][^"']*\bheader\b[^"']*["'][^>]*>[\s\S]*?<\/header>/i;
  if (!headerPattern.test(source)) throw new Error(`${file}: ümumi header üçün əvəz ediləcək blok tapılmadı.`);

  let html = ensureMainId(source.replace(headerPattern, renderHeader(pageName)));
  const footerPattern = /<footer\b[^>]*\bclass=["'][^"']*\bfooter\b[^"']*["'][^>]*>[\s\S]*?<\/footer>/i;

  if (shouldRenderFooter(pageName)) {
    html = footerPattern.test(html)
      ? html.replace(footerPattern, siteFooterTemplate)
      : html.replace(/<\/main>/i, `${siteFooterTemplate}\n      </main>`);
  } else {
    html = html.replace(footerPattern, "");
  }

  return ensurePwaMetadata(html);
};

export const siteShellTemplateFiles = Object.freeze([
  "templates/site-header.html",
  "templates/auth-header.html",
  "templates/site-footer.html"
]);
