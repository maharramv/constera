import { readFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeGoogleVerificationToken } from "../api/_lib/google-marketing.js";

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
  { key: "ai-smeta", href: "ai-smeta.html", label: "Ağıllı smeta" },
  { key: "project-planner", href: "project-planner.html", label: "Layihə səbəti" },
  { key: "customer-cabinet", href: "customer-cabinet.html", label: "Kabinet" }
]);

const activeNavigationByPage = Object.freeze({
  home: "home",
  offline: "home",
  catalog: "catalog",
  category: "catalog",
  subcategory: "catalog",
  "product-detail": "catalog",
  services: "services",
  "service-detail": "services",
  packages: "packages",
  "package-detail": "packages",
  "project-planner": "project-planner",
  rental: "rental",
  "rental-detail": "rental",
  brands: "catalog",
  suppliers: "catalog",
  "supplier-portal": "customer-cabinet",
  "price-import": "customer-cabinet",
  "customer-cabinet": "customer-cabinet",
  checkout: "project-planner",
  "order-detail": "customer-cabinet",
  "proposal-detail": "rfq",
  rfq: "rfq",
  "rfq-dashboard": "rfq",
  tender: "rfq",
  "ai-smeta": "ai-smeta",
  contact: "home",
  privacy: "home",
  terms: "home",
  "delivery-returns": "home",
  admin: "customer-cabinet"
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
const removeExternalFontLinks = (html) => html.replace(
  /\s*<link\b[^>]*\bhref=["']https:\/\/fonts\.(?:googleapis|gstatic)\.com[^>]*>\s*/gi,
  "\n"
);
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
const ensureSearchConsoleMetadata = (html, pageName) => {
  if (pageName !== "home" || /name=["']google-site-verification["']/i.test(html)) return html;
  const token = normalizeGoogleVerificationToken();
  return token
    ? html.replace(/<\/head>/i, `    <meta name="google-site-verification" content="${token}" />\n  </head>`)
    : html;
};
const shouldRenderFooter = (pageName) => !["admin", "login"].includes(pageName);

export const renderSitePage = (source, options = {}) => {
  const file = basename(options.file || "index.html");
  const fontFreeSource = removeExternalFontLinks(source);
  const pageName = pageNameFromHtml(fontFreeSource);
  const headerPattern = /<header\b[^>]*\bclass=["'][^"']*\bheader\b[^"']*["'][^>]*>[\s\S]*?<\/header>/i;
  if (!headerPattern.test(fontFreeSource)) throw new Error(`${file}: ümumi header üçün əvəz ediləcək blok tapılmadı.`);

  let html = ensureMainId(fontFreeSource.replace(headerPattern, renderHeader(pageName)));
  const footerPattern = /<footer\b[^>]*\bclass=["'][^"']*\bfooter\b[^"']*["'][^>]*>[\s\S]*?<\/footer>/i;

  if (shouldRenderFooter(pageName)) {
    html = footerPattern.test(html)
      ? html.replace(footerPattern, siteFooterTemplate)
      : html.replace(/<\/main>/i, `${siteFooterTemplate}\n      </main>`);
  } else {
    html = html.replace(footerPattern, "");
  }

  return ensureSearchConsoleMetadata(ensurePwaMetadata(html), pageName);
};

export const siteShellTemplateFiles = Object.freeze([
  "templates/site-header.html",
  "templates/auth-header.html",
  "templates/site-footer.html"
]);
