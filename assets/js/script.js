const menuToggle = document.querySelector(".menu-toggle");
const nav = document.querySelector(".nav");
const counters = document.querySelectorAll(".counter");
const form = document.querySelector(".contact-form");
const langButtons = document.querySelectorAll(".lang-button");
const langInput = form?.querySelector('input[name="lang"]');
const formStatus = form?.querySelector(".form-status");
const formFields = form
  ? Array.from(form.querySelectorAll('input[name]:not([type="hidden"]), textarea[name]'))
  : [];
const pageTransition = document.querySelector(".page-transition");
const hasTranslationTargets = Boolean(
  document.querySelector("[data-i18n], [data-i18n-placeholder], [data-i18n-content]")
);

const translations = {
  az: {
    "meta.title": "CONSTERA Industrial Group | Sənaye infrastrukturu, enerji və istehsal",
    "meta.description": "CONSTERA Industrial Group infrastruktur, enerji sistemləri, qabaqcıl istehsal və strateji tərəfdaşlıqlara fokuslanan beynəlxalq sənaye qrupudur.",
    "brand.subtitle": "Sənaye Qrupu",
    "nav.home": "Ana səhifə",
    "nav.about": "Haqqımızda",
    "nav.divisions": "İstiqamətlər",
    "nav.projects": "Layihələr",
    "nav.investors": "İnvestorlar",
    "nav.news": "Xəbərlər",
    "nav.contact": "Əlaqə",
    "nav.partner": "Tərəfdaşlıq sorğusu",
    "hero.eyebrow": "Qlobal sənaye infrastrukturu",
    "hero.title": "Növbəti inkişaf mərhələsi üçün dayanıqlı sənaye platformaları qururuq.",
    "hero.text": "CONSTERA Industrial Group enerji, logistika, qabaqcıl istehsal və strateji infrastruktur imkanlarını institusional miqyaslı tərəfdaşlıqlar üçün vahid premium sənaye platformasında birləşdirir.",
    "hero.primary": "Portfelə bax",
    "hero.secondary": "İnvestor icmalı",
    "hero.ticker1": "Enerji keçidi platformaları",
    "hero.ticker2": "Logistika dəhlizləri",
    "hero.ticker3": "İnstitusional idarəetmə",
    "metrics.markets": "Aktiv bazarlar",
    "metrics.projects": "Strateji layihələr",
    "metrics.pipeline": "Aktiv portfeli",
    "metrics.talent": "Mühəndis komandası",
    "band.footprintLabel": "Əməliyyat coğrafiyası",
    "band.footprintValue": "24 strateji bazar",
    "band.sectorsLabel": "Prioritet sektorlar",
    "band.sectorsValue": "Enerji, logistika, qabaqcıl sənaye",
    "band.modelLabel": "Tərəfdaşlıq modeli",
    "band.modelValue": "Dövlət, özəl sektor və institusional kapital uyğunluğu",
    "about.eyebrow": "Haqqımızda",
    "about.title": "Miqyas, nəzarət və uzunmüddətli dəyər yaratmaq üçün qurulmuş korporativ platforma.",
    "about.p1": "CONSTERA Industrial Group layihələrin təşəbbüsü, mühəndis icrası, rəqəmsal əməliyyatlar və strateji aktiv tərəfdaşlıqları üzrə imkanlara malik beynəlxalq sənaye və infrastruktur holdinqi kimi mövqelənir.",
    "about.p2": "Şirkətin yanaşması intizamlı icra, dərin texniki ekspertiza və dövlət sektoru, institusional investorlar və beynəlxalq tərəfdaşlar üçün uyğun inteqrasiya olunmuş əməliyyat modelinə əsaslanır.",
    "about.positioningLabel": "Mövqelənmə",
    "about.positioningText": "Sənaye, infrastruktur və texnologiyanın birləşməsi",
    "about.modelLabel": "Əməliyyat modeli",
    "about.modelText": "Konsepsiyadan aktivin həyat dövrü optimizasiyasına qədər tam imkanlar",
    "about.partnerLabel": "Tərəfdaş fokusu",
    "about.partnerText": "B2B müştərilər, dövlət qurumları və institusional kapital tərəfdaşları",
    "about.ribbon1": "Layihə təşəbbüsü",
    "about.ribbon2": "Mühəndis idarəetməsi",
    "about.ribbon3": "Aktivlərin həyat dövrü optimizasiyası",
    "about.ribbon4": "Rəqəmsal əməliyyat analitikası",
    "divisions.eyebrow": "İstiqamətlər",
    "divisions.title": "Strateji sənaye artımı mövzuları ətrafında qurulmuş ixtisaslaşmış biznes vahidləri.",
    "divisions.link": "İstiqaməti müzakirə et",
    "divisions.energy.topline": "Enerji sistemləri",
    "divisions.energy.title": "Böyükmiqyaslı enerji obyektləri, şəbəkə modernizasiyası və dekarbonizasiya aktivləri.",
    "divisions.energy.text": "EPC koordinasiyası, saxlama sistemlərinin inteqrasiyası və dayanıqlı enerji şəbəkələri üzrə imkanlar.",
    "divisions.energy.li1": "12 GW idarə olunan layihə portfeli",
    "divisions.energy.li2": "Hibrid şəbəkə texnologiyaları",
    "divisions.energy.li3": "Regional icra qabiliyyəti",
    "divisions.infrastructure.topline": "Sənaye infrastrukturu",
    "divisions.infrastructure.title": "Yüksək tələblərə malik nəqliyyat, logistika və kritik obyektlər.",
    "divisions.infrastructure.text": "Limanlar, terminallar, dəhlizlər və kompleks sənaye platformaları üçün icra çərçivələri.",
    "divisions.infrastructure.li1": "Çoxsahəli proqram icrası",
    "divisions.infrastructure.li2": "Rəqəmsal əkizlə nəzarət",
    "divisions.infrastructure.li3": "Aktivlərin həyat dövrü optimizasiyası",
    "divisions.manufacturing.topline": "Qabaqcıl istehsal",
    "divisions.manufacturing.title": "Ağıllı istehsal sistemləri və dəqiq sənaye transformasiyası.",
    "divisions.manufacturing.text": "Avtomatlaşdırma əsaslı istehsal mühitləri və analitika ilə gücləndirilmiş səmərəlilik proqramları.",
    "divisions.manufacturing.li1": "Industry 4.0 arxitekturası",
    "divisions.manufacturing.li2": "Proses nəzarəti və robotlaşdırma",
    "divisions.manufacturing.li3": "OEE və məhsuldarlıq optimizasiyası",
    "projects.eyebrow": "Layihələr",
    "projects.title": "Enerji, mobillik və yüksək dəyərli sənaye aktivlərini əhatə edən seçilmiş portfel.",
    "projects.investment": "İnvestisiya",
    "projects.scope": "İş həcmi",
    "projects.link": "Layihə xülasəsini aç",
    "projects.p1.region": "Mərkəzi Asiya",
    "projects.p1.sector": "Enerji",
    "projects.p1.title": "Kestrel inteqrasiya olunmuş şəbəkə mərkəzi",
    "projects.p1.text": "Regional enerji şəbəkəsinin dayanıqlığını artırmaq üçün 1.8 GW hibrid generasiya və ötürmə proqramı.",
    "projects.p1.scopeValue": "Generasiya, saxlama, yüksək gərginlik sistemləri",
    "projects.p2.region": "Yaxın Şərq",
    "projects.p2.sector": "Logistika",
    "projects.p2.title": "Orion quru liman dəhlizi",
    "projects.p2.text": "Gömrük avtomatlaşdırması, anbar infrastrukturu və dəmir yolu inteqrasiyası olan intermodal logistika platforması.",
    "projects.p2.scopeValue": "Terminal sistemləri, ağıllı meydança idarəetməsi",
    "projects.p3.region": "Şərqi Avropa",
    "projects.p3.sector": "İstehsal",
    "projects.p3.title": "Atlas dəqiq istehsal kampusu",
    "projects.p3.text": "AI dəstəkli istehsal analitikası və enerji bərpası sistemləri ilə qabaqcıl istehsal ekosistemi.",
    "projects.p3.scopeValue": "Proses avtomatlaşdırması, zavod mühəndisliyi",
    "presence.eyebrow": "Qlobal iştirak",
    "presence.title": "Strateji sənaye və infrastruktur dəhlizləri üzrə əməliyyat əhatəsi.",
    "presence.city1": "London",
    "presence.city2": "Dubay",
    "presence.city3": "Sinqapur",
    "presence.city4": "Astana",
    "presence.city5": "Toronto",
    "presence.coverageLabel": "Əhatə",
    "presence.coverageText": "Enerji, logistika və sənaye modernizasiyasına fokuslanan 24 bazar.",
    "presence.deliveryLabel": "İcra modeli",
    "presence.deliveryText": "Mərkəzləşdirilmiş idarəetmə və risk nəzarəti ilə gücləndirilmiş regional tərəfdaşlıqlar.",
    "partners.eyebrow": "Tərəfdaşlar",
    "partners.title": "Operatorlar, dövlət qurumları və kapital institutları ilə əməkdaşlıq üçün qurulmuş model.",
    "partners.item1": "İnfrastruktur fondları",
    "partners.item2": "Sənaye OEM-ləri",
    "partners.item3": "Dövlət qurumları",
    "partners.item4": "Enerji şirkətləri",
    "partners.item5": "Logistika operatorları",
    "partners.item6": "Texnologiya alyansları",
    "investors.eyebrow": "İnvestorlar",
    "investors.title": "İntizamlı idarəetmə və şəffaf layihə iqtisadiyyatı ilə dəstəklənən artım strategiyası.",
    "investors.stat1": "aktiv strateji tərəfdaşlıq",
    "investors.stat2": "qiymətləndirmədə olan portfel imkanları",
    "investors.stat3": "hədəf idarəetmə və risk çərçivəsi yetkinliyi",
    "investors.stat4": "regional genişlənmə üçün uzunmüddətli artım üfüqü",
    "investors.highlightsLabel": "Maliyyə göstəriciləri",
    "investors.highlightsText": "Diversifikasiya olunmuş layihə portfeli, mərhələli kapital yerləşdirilməsi və marja yönümlü icra modeli.",
    "investors.governanceLabel": "Korporativ idarəetmə",
    "investors.governanceText": "İnstitusional hazırlıq üçün şəffaf hesabatlılıq, müstəqil nəzarət və ESG inteqrasiyası.",
    "investors.reportsLabel": "Hesabatlar",
    "investors.reportsText": "İllik hesabat, investor təqdimatı və strateji icmal yüklənə bilən materiallar kimi əlavə edilə bilər.",
    "news.eyebrow": "Xəbərlər",
    "news.title": "Son elanlar, layihə mərhələləri və strateji bazar yenilikləri.",
    "news.n1.date": "Mart 2026",
    "news.n1.title": "CONSTERA regional enerji şirkətləri konsorsiumu ilə transsərhəd enerji saxlama çərçivəsini irəli aparır.",
    "news.link1": "İmkanı müzakirə et",
    "news.n2.date": "Fevral 2026",
    "news.n2.title": "Sənaye modernizasiyası proqramı yeni avtomatlaşdırma sistemi ilə icra mərhələsinə keçir.",
    "news.link2": "Portfelə bax",
    "news.n3.date": "Yanvar 2026",
    "news.n3.title": "Direktorlar şurası logistika dəhlizləri və dayanıqlı infrastruktura fokuslanan genişlənmə yol xəritəsini təsdiqlədi.",
    "news.link3": "İnvestor bölməsi",
    "contact.eyebrow": "Əlaqə",
    "contact.title": "CONSTERA korporativ komandası ilə tərəfdaşlıq dialoquna başlayın.",
    "contact.hq": "Korporativ qərargah",
    "contact.addr1": "One Horizon Square, 28-ci mərtəbə",
    "contact.addr2": "Qlobal biznes rayonu",
    "contact.name": "Ad",
    "contact.namePlaceholder": "Tam adınız",
    "contact.company": "Şirkət",
    "contact.companyPlaceholder": "Şirkət və ya təşkilat",
    "contact.email": "E-poçt",
    "contact.inquiry": "Sorğu",
    "contact.inquiryPlaceholder": "Tərəfdaşlıq, investisiya və ya layihə sorğunuzu təsvir edin",
    "contact.submit": "Sorğu göndər",
    "contact.success": "Sorğu lokal draft kimi yadda saxlandı.",
    "contact.error": "Sorğunu yadda saxlamaq mümkün olmadı. Zəhmət olmasa sonra yenidən cəhd edin.",
    "contact.validation": "Zəhmət olmasa bütün məcburi sahələri düzgün doldurun.",
    "contact.error.nameRequired": "Zəhmət olmasa adınızı yazın.",
    "contact.error.nameShort": "Ad ən azı 2 simvoldan ibarət olmalıdır.",
    "contact.error.companyShort": "Şirkət adı ən azı 2 simvoldan ibarət olmalıdır.",
    "contact.error.emailRequired": "Zəhmət olmasa email ünvanınızı yazın.",
    "contact.error.emailInvalid": "Zəhmət olmasa düzgün email ünvanı yazın.",
    "contact.error.messageRequired": "Zəhmət olmasa sorğu mətnini yazın.",
    "contact.error.messageShort": "Sorğu mətni ən azı 10 simvoldan ibarət olmalıdır.",
    "footer.description": "İnfrastruktur, enerji sistemləri və qabaqcıl istehsal tərəfdaşlıqlarına fokuslanan beynəlxalq sənaye qrupu.",
    "footer.navigation": "Naviqasiya",
    "footer.contact": "Əlaqə",
    "footer.legal": "Məlumat",
    "footer.address": "One Horizon Square, 28-ci mərtəbə",
    "footer.rights": "Bütün hüquqlar qorunur.",
    "footer.note": "Təqdimat məqsədli korporativ sayt konsepti.",
    "footer.copyright": "© 2026 CONSTERA Industrial Group",
    "footer.backToTop": "Yuxarı qayıt"
  }
};

let currentLanguage = "az";
localStorage.setItem("constera-language", currentLanguage);
let languageTransitionTimers = [];

const applyTranslations = (lang) => {
  const dictionary = translations[lang] || translations.az;
  if (hasTranslationTargets) {
    document.documentElement.lang = "az";
    document.title = dictionary["meta.title"] || document.title;
  }

  document.querySelectorAll("[data-i18n]").forEach((element) => {
    const key = element.dataset.i18n;
    if (!dictionary[key]) return;
    element.textContent = dictionary[key];
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    const key = element.dataset.i18nPlaceholder;
    if (!dictionary[key]) return;
    element.setAttribute("placeholder", dictionary[key]);
  });

  document.querySelectorAll("[data-i18n-content]").forEach((element) => {
    const key = element.dataset.i18nContent;
    if (!dictionary[key]) return;
    element.setAttribute("content", dictionary[key]);
  });

  const ogTitle = document.querySelector('meta[property="og:title"]');
  const ogDescription = document.querySelector('meta[property="og:description"]');
  const twitterTitle = document.querySelector('meta[name="twitter:title"]');
  const twitterDescription = document.querySelector('meta[name="twitter:description"]');

  if (ogTitle) ogTitle.setAttribute("content", dictionary["meta.title"] || "CONSTERA Industrial Group");
  if (ogDescription) ogDescription.setAttribute("content", dictionary["meta.description"] || "");
  if (twitterTitle) twitterTitle.setAttribute("content", dictionary["meta.title"] || "CONSTERA Industrial Group");
  if (twitterDescription) twitterDescription.setAttribute("content", dictionary["meta.description"] || "");

  if (formStatus && !formStatus.hidden && formStatus.dataset.status) {
    const statusKey = formStatus.dataset.status === "validation"
      ? "contact.validation"
      : `contact.${formStatus.dataset.status}`;
    if (dictionary[statusKey]) {
      formStatus.textContent = dictionary[statusKey];
    }
  }

  langButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.lang === "az");
  });

  if (langInput) {
    langInput.value = "az";
  }

  formFields.forEach((field) => {
    if (field.dataset.errorKey) {
      const errorNode = form?.querySelector(`[data-error-for="${field.name}"]`);
      if (errorNode && dictionary[field.dataset.errorKey]) {
        errorNode.textContent = dictionary[field.dataset.errorKey];
      }
    }
  });
};

const setFormStatus = (type, text) => {
  if (!formStatus) return;
  formStatus.hidden = false;
  formStatus.dataset.status = type;
  formStatus.classList.remove("is-success", "is-error");
  formStatus.classList.add(type === "success" ? "is-success" : "is-error");
  formStatus.textContent = text;
};

const clearFormStatus = () => {
  if (!formStatus) return;
  formStatus.hidden = true;
  formStatus.dataset.status = "";
  formStatus.classList.remove("is-success", "is-error");
  formStatus.textContent = "";
};

const setFieldError = (field, errorKey) => {
  const wrapper = field.closest(".form-field");
  const errorNode = form?.querySelector(`[data-error-for="${field.name}"]`);
  const message = translations.az[errorKey];

  if (!wrapper || !errorNode || !message) return false;
  field.dataset.errorKey = errorKey;
  wrapper.classList.remove("has-error");
  void wrapper.offsetWidth;
  wrapper.classList.add("has-error");
  errorNode.textContent = message;
  field.setAttribute("aria-invalid", "true");
  return false;
};

const clearFieldError = (field) => {
  const wrapper = field.closest(".form-field");
  const errorNode = form?.querySelector(`[data-error-for="${field.name}"]`);

  if (wrapper) wrapper.classList.remove("has-error");
  if (errorNode) errorNode.textContent = "";
  field.removeAttribute("aria-invalid");
  delete field.dataset.errorKey;
};

const validateField = (field) => {
  const value = field.value.trim();

  if (field.name === "name") {
    if (!value) return setFieldError(field, "contact.error.nameRequired");
    if (value.length < 2) return setFieldError(field, "contact.error.nameShort");
  }

  if (field.name === "company") {
    if (value && value.length < 2) return setFieldError(field, "contact.error.companyShort");
  }

  if (field.name === "email") {
    if (!value) return setFieldError(field, "contact.error.emailRequired");
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(value)) return setFieldError(field, "contact.error.emailInvalid");
  }

  if (field.name === "message") {
    if (!value) return setFieldError(field, "contact.error.messageRequired");
    if (value.length < 10) return setFieldError(field, "contact.error.messageShort");
  }

  clearFieldError(field);
  return true;
};

const animateCounter = (entry) => {
  const target = Number(entry.target.dataset.target);
  const duration = 2200;
  const start = performance.now();

  const tick = (now) => {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const value = Math.round(target * eased);
    entry.target.textContent = value.toLocaleString("az-AZ");

    if (progress < 1) {
      requestAnimationFrame(tick);
    }
  };

  requestAnimationFrame(tick);
};

if (menuToggle && nav) {
  const setMenuState = (isOpen) => {
    nav.classList.toggle("is-open", isOpen);
    menuToggle.setAttribute("aria-expanded", String(isOpen));
    menuToggle.classList.toggle("is-active", isOpen);
    document.body.classList.toggle("nav-open", isOpen);
  };

  const closeMenu = () => setMenuState(false);

  menuToggle.addEventListener("click", () => {
    setMenuState(!nav.classList.contains("is-open"));
  });

  nav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", closeMenu);
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (!nav.classList.contains("is-open")) return;
    if (nav.contains(target) || menuToggle.contains(target)) return;
    closeMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    closeMenu();
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 1100) {
      closeMenu();
    }
  });
}

const observer = new IntersectionObserver(
  (entries, obs) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      animateCounter(entry);
      obs.unobserve(entry.target);
    });
  },
  { threshold: 0.45 }
);

counters.forEach((counter) => observer.observe(counter));

if (window.AOS) {
  AOS.init({
    duration: 1000,
    easing: "ease-out-cubic",
    once: true,
    mirror: false,
    offset: 72,
    disable: window.matchMedia("(prefers-reduced-motion: reduce)").matches
  });
}

langButtons.forEach((button) => {
  button.addEventListener("click", () => {
    languageTransitionTimers.forEach((timer) => window.clearTimeout(timer));
    languageTransitionTimers = [];

    if (pageTransition) {
      pageTransition.classList.add("is-visible");
    }

    const applyTimer = window.setTimeout(() => {
      currentLanguage = "az";
      localStorage.setItem("constera-language", currentLanguage);
      applyTranslations(currentLanguage);
    }, 120);

    const hideTimer = window.setTimeout(() => {
      pageTransition?.classList.remove("is-visible");
    }, 520);

    languageTransitionTimers.push(applyTimer, hideTimer);
  });
});

applyTranslations(currentLanguage);

const params = new URLSearchParams(window.location.search);
const status = params.get("status");

if (formStatus && (status === "success" || status === "error")) {
  setFormStatus(status, translations.az[`contact.${status}`]);
}

if (status === "validation") {
  setFormStatus("error", translations.az["contact.validation"]);
}

if (form) {
  formFields.forEach((field) => {
    field.addEventListener("blur", () => {
      validateField(field);
    });

    field.addEventListener("input", () => {
      if (field.dataset.errorKey) {
        validateField(field);
      }
      if (formStatus && !formStatus.hidden && formStatus.dataset.status === "error") {
        clearFormStatus();
      }
    });
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    if (langInput) {
      langInput.value = "az";
    }

    let firstInvalidField = null;
    const isValid = formFields.every((field) => {
      const fieldValid = validateField(field);
      if (!fieldValid && !firstInvalidField) firstInvalidField = field;
      return fieldValid;
    });

    if (!isValid) {
      setFormStatus("error", translations.az["contact.validation"]);
      firstInvalidField?.focus();
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
      setFormStatus("success", translations.az["contact.success"]);
      form.reset();
      if (langInput) {
        langInput.value = "az";
      }
    } catch {
      setFormStatus("error", translations.az["contact.error"]);
    }
  });
}
