const siteOrigin = "https://constera.az";

const upsertMeta = (selector, attributes) => {
  let tag = document.head.querySelector(selector);
  if (!tag) {
    tag = document.createElement("meta");
    Object.entries(attributes)
      .filter(([key]) => key !== "content")
      .forEach(([key, value]) => tag.setAttribute(key, value));
    document.head.appendChild(tag);
  }
  if (attributes.content) tag.setAttribute("content", attributes.content);
};

const injectJsonLd = (id, data) => {
  let script = document.getElementById(id);
  if (!script) {
    script = document.createElement("script");
    script.type = "application/ld+json";
    script.id = id;
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(data);
};

const getCanonicalHref = () => {
  const canonical = document.querySelector('link[rel="canonical"]');
  const path = window.location.pathname.split("/").pop() || "";
  const url = new URL(canonical?.href || `${siteOrigin}/${path}`);
  const page = document.body?.dataset.page || "home";
  const canonicalParams = {
    category: ["type", "category"],
    subcategory: ["type", "category", "subcategory"],
    "product-detail": ["product"],
    "service-detail": ["service"],
    "package-detail": ["package"],
    "rental-detail": ["rental"]
  };
  const sourceParams = new URLSearchParams(window.location.search);

  (canonicalParams[page] || []).forEach((key) => {
    const value = sourceParams.get(key);
    if (value) url.searchParams.set(key, value);
  });

  const href = url.toString();
  if (canonical) canonical.href = href;
  return href;
};

const initSeoEnhancements = () => {
  const title = document.title.trim() || "ConstEra";
  const description = document.querySelector('meta[name="description"]')?.content?.trim() ||
    "ConstEra tikinti materialları, xidmətlər, paketlər və avadanlıq icarəsi üçün Azərbaycan bazarına uyğun platformadır.";
  const canonical = getCanonicalHref();
  const image = `${siteOrigin}/assets/images/hero.webp`;
  const pageName = title.split("|")[0].trim() || "ConstEra";
  const bodyPage = document.body?.dataset.page || "home";

  upsertMeta('meta[property="og:type"]', { property: "og:type", content: "website" });
  upsertMeta('meta[property="og:site_name"]', { property: "og:site_name", content: "ConstEra" });
  upsertMeta('meta[property="og:title"]', { property: "og:title", content: title });
  upsertMeta('meta[property="og:description"]', { property: "og:description", content: description });
  upsertMeta('meta[property="og:url"]', { property: "og:url", content: canonical });
  upsertMeta('meta[property="og:image"]', { property: "og:image", content: image });
  upsertMeta('meta[name="twitter:card"]', { name: "twitter:card", content: "summary_large_image" });
  upsertMeta('meta[name="twitter:title"]', { name: "twitter:title", content: title });
  upsertMeta('meta[name="twitter:description"]', { name: "twitter:description", content: description });
  upsertMeta('meta[name="twitter:image"]', { name: "twitter:image", content: image });

  injectJsonLd("constera-website-schema", {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "ConstEra",
    url: siteOrigin,
    description,
    inLanguage: "az",
    areaServed: {
      "@type": "Country",
      name: "Azərbaycan"
    },
    potentialAction: {
      "@type": "SearchAction",
      target: `${siteOrigin}/catalog.html?q={search_term_string}`,
      "query-input": "required name=search_term_string"
    }
  });

  if (bodyPage !== "home") {
    injectJsonLd("constera-breadcrumb-schema", {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Ana səhifə",
          item: `${siteOrigin}/`
        },
        {
          "@type": "ListItem",
          position: 2,
          name: pageName,
          item: canonical
        }
      ]
    });
  }

  if (["catalog", "services", "packages", "rental", "brands", "suppliers"].includes(bodyPage)) {
    injectJsonLd("constera-collection-schema", {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: pageName,
      description,
      url: canonical,
      inLanguage: "az",
      isPartOf: {
        "@type": "WebSite",
        name: "ConstEra",
        url: siteOrigin
      }
    });
  }
};

const initAccessibility = () => {
  document.documentElement.lang = "az";
  const main = document.querySelector("main");
  if (main && !main.id) main.id = "main-content";

  if (main && !document.querySelector(".skip-link")) {
    const skipLink = document.createElement("a");
    skipLink.className = "skip-link";
    skipLink.href = `#${main.id}`;
    skipLink.textContent = "Əsas məzmuna keç";
    document.body.prepend(skipLink);
  }
};

const initMenu = () => {
  const menuToggle = document.querySelector(".menu-toggle");
  const nav = document.querySelector(".nav");
  if (!menuToggle || !nav) return;

  const setMenuState = (isOpen) => {
    nav.classList.toggle("is-open", isOpen);
    menuToggle.setAttribute("aria-expanded", String(isOpen));
    menuToggle.setAttribute("aria-label", isOpen ? "Naviqasiya menyusunu bağla" : "Naviqasiya menyusunu aç");
    menuToggle.classList.toggle("is-active", isOpen);
    document.body.classList.toggle("nav-open", isOpen);
  };

  setMenuState(false);
  menuToggle.addEventListener("click", () => setMenuState(!nav.classList.contains("is-open")));
  nav.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => setMenuState(false)));

  document.addEventListener("click", (event) => {
    if (!nav.classList.contains("is-open")) return;
    if (nav.contains(event.target) || menuToggle.contains(event.target)) return;
    setMenuState(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setMenuState(false);
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 1100) setMenuState(false);
  });
};

const marketplaceCounts = () => {
  const data = window.CONSTERA_MARKETPLACE || {};
  return {
    categories: data.categories?.length || 0,
    subcategories: data.categories?.reduce((sum, category) => sum + (category.subcategories?.length || 0), 0) || 0,
    products: data.products?.length || 0,
    services: data.services?.length || 0,
    packages: data.packages?.length || 0,
    rentals: data.rentals?.length || 0,
    brands: data.brands?.length || 0,
    suppliers: data.suppliers?.length || 0
  };
};

const updateMarketplaceCounts = () => {
  const counts = marketplaceCounts();
  document.querySelectorAll("[data-marketplace-count]").forEach((node) => {
    const value = counts[node.dataset.marketplaceCount] ?? 0;
    node.dataset.target = String(value);
    node.textContent = value.toLocaleString("az-AZ");
  });
};

const animateCounter = (node) => {
  const target = Number(node.dataset.target);
  if (!Number.isFinite(target)) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    node.textContent = target.toLocaleString("az-AZ");
    return;
  }

  const start = performance.now();
  const duration = 900;
  const tick = (now) => {
    const progress = Math.min((now - start) / duration, 1);
    const value = Math.round(target * (1 - Math.pow(1 - progress, 3)));
    node.textContent = value.toLocaleString("az-AZ");
    if (progress < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

const initCounters = () => {
  const counters = document.querySelectorAll(".counter[data-target]");
  if (!counters.length) return;
  if (!("IntersectionObserver" in window)) {
    counters.forEach(animateCounter);
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      animateCounter(entry.target);
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.35 });
  counters.forEach((counter) => observer.observe(counter));
};

const initContactForm = () => {
  const form = document.querySelector(".contact-form");
  if (!form) return;
  const status = form.querySelector(".form-status");
  const fields = [...form.querySelectorAll('input[name]:not([type="hidden"]), textarea[name]')];

  const setStatus = (message, type) => {
    if (!status) return;
    status.hidden = false;
    status.textContent = message;
    status.classList.toggle("is-success", type === "success");
    status.classList.toggle("is-error", type === "error");
  };

  const setFieldError = (field, message = "") => {
    const error = form.querySelector(`[data-error-for="${field.name}"]`);
    if (message) field.setAttribute("aria-invalid", "true");
    else field.removeAttribute("aria-invalid");
    field.closest(".form-field")?.classList.toggle("has-error", Boolean(message));
    if (error) error.textContent = message;
    return !message;
  };

  const validate = (field) => {
    const value = field.value.trim();
    if (field.required && !value) return setFieldError(field, "Bu sahə məcburidir.");
    if (field.name === "name" && value.length < 2) return setFieldError(field, "Ad ən azı 2 simvol olmalıdır.");
    if (field.name === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return setFieldError(field, "Düzgün e-poçt ünvanı yazın.");
    if (field.name === "message" && value.length < 10) return setFieldError(field, "Sorğu ən azı 10 simvol olmalıdır.");
    return setFieldError(field);
  };

  fields.forEach((field) => {
    field.addEventListener("blur", () => validate(field));
    field.addEventListener("input", () => {
      if (field.hasAttribute("aria-invalid")) validate(field);
    });
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const isValid = fields.map(validate).every(Boolean);
    if (!isValid) {
      setStatus("Məcburi sahələri düzgün doldurun.", "error");
      fields.find((field) => field.getAttribute("aria-invalid") === "true")?.focus();
      return;
    }

    try {
      const formData = new FormData(form);
      const inquiry = {
        name: formData.get("name"),
        company: formData.get("company"),
        email: formData.get("email"),
        message: formData.get("message"),
        createdAt: new Date().toISOString()
      };
      const existing = JSON.parse(localStorage.getItem("constera-contact-drafts") || "[]");
      existing.unshift(inquiry);
      localStorage.setItem("constera-contact-drafts", JSON.stringify(existing.slice(0, 20)));
      form.reset();
      setStatus("Sorğu qaralama kimi yadda saxlandı.", "success");
    } catch {
      setStatus("Sorğunu yadda saxlamaq mümkün olmadı.", "error");
    }
  });
};

initAccessibility();
initMenu();
updateMarketplaceCounts();
initCounters();
initContactForm();
initSeoEnhancements();

window.consteraRefreshSeo = initSeoEnhancements;
