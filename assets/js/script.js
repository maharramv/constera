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
  en: {
    "meta.title": "CONSTERA Industrial Group | Industrial Infrastructure, Energy and Manufacturing",
    "meta.description": "CONSTERA Industrial Group is an international industrial group focused on infrastructure, energy systems, advanced manufacturing and strategic partnerships.",
    "brand.subtitle": "Industrial Group",
    "nav.home": "Home",
    "nav.about": "About",
    "nav.divisions": "Divisions",
    "nav.projects": "Projects",
    "nav.investors": "Investors",
    "nav.news": "News",
    "nav.contact": "Contact",
    "nav.partner": "Partner Inquiry",
    "hero.eyebrow": "Global Industrial Infrastructure",
    "hero.title": "Engineering resilient industrial platforms for the next era of growth.",
    "hero.text": "CONSTERA Industrial Group unites energy, logistics, advanced manufacturing and strategic infrastructure capabilities into one premium industrial platform for institutional-scale partnerships.",
    "hero.primary": "Explore Portfolio",
    "hero.secondary": "Investor Highlights",
    "hero.ticker1": "Energy transition platforms",
    "hero.ticker2": "Logistics corridors",
    "hero.ticker3": "Institutional-grade governance",
    "metrics.markets": "Active Markets",
    "metrics.projects": "Strategic Projects",
    "metrics.pipeline": "Asset Pipeline",
    "metrics.talent": "Engineering Talent",
    "band.footprintLabel": "Operating footprint",
    "band.footprintValue": "24 strategic markets",
    "band.sectorsLabel": "Priority sectors",
    "band.sectorsValue": "Energy, logistics, advanced industry",
    "band.modelLabel": "Partnership model",
    "band.modelValue": "Public, private and institutional capital alignment",
    "about.eyebrow": "About",
    "about.title": "A corporate platform designed for scale, control and long-term value creation.",
    "about.p1": "CONSTERA Industrial Group is positioned as an international industrial and infrastructure holding with capabilities spanning project origination, engineering delivery, digital operations and strategic asset partnerships.",
    "about.p2": "The company narrative emphasizes disciplined execution, advanced technical expertise and an integrated operating model suited for public-sector, institutional and multinational counterparties.",
    "about.positioningLabel": "Positioning",
    "about.positioningText": "Industrial, infrastructure and technology convergence",
    "about.modelLabel": "Operating Model",
    "about.modelText": "End-to-end capabilities from concept to lifecycle optimization",
    "about.partnerLabel": "Partner Focus",
    "about.partnerText": "B2B clients, sovereign entities and institutional capital partners",
    "about.ribbon1": "Project origination",
    "about.ribbon2": "Engineering governance",
    "about.ribbon3": "Asset lifecycle optimization",
    "about.ribbon4": "Digital operations intelligence",
    "divisions.eyebrow": "Divisions",
    "divisions.title": "Specialized business units aligned around strategic industrial growth themes.",
    "divisions.link": "Discuss division",
    "divisions.energy.topline": "Energy Systems",
    "divisions.energy.title": "Utility-scale power, grid modernization and decarbonization assets.",
    "divisions.energy.text": "Capabilities in EPC coordination, storage integration and resilient energy networks.",
    "divisions.energy.li1": "12 GW managed pipeline",
    "divisions.energy.li2": "Hybrid grid technologies",
    "divisions.energy.li3": "Regional deployment capability",
    "divisions.infrastructure.topline": "Industrial Infrastructure",
    "divisions.infrastructure.title": "High-specification transport, logistics and mission-critical facilities.",
    "divisions.infrastructure.text": "Execution frameworks for ports, terminals, corridors and complex industrial platforms.",
    "divisions.infrastructure.li1": "Multi-site program delivery",
    "divisions.infrastructure.li2": "Digital twin supervision",
    "divisions.infrastructure.li3": "Lifecycle asset optimization",
    "divisions.manufacturing.topline": "Advanced Manufacturing",
    "divisions.manufacturing.title": "Smart production systems and precision industrial transformation.",
    "divisions.manufacturing.text": "Automation-led manufacturing environments with analytics-enabled efficiency programs.",
    "divisions.manufacturing.li1": "Industry 4.0 architecture",
    "divisions.manufacturing.li2": "Process controls and robotics",
    "divisions.manufacturing.li3": "OEE and yield optimization",
    "projects.eyebrow": "Projects",
    "projects.title": "A selective portfolio spanning energy, mobility and high-value industrial assets.",
    "projects.investment": "Investment",
    "projects.scope": "Scope",
    "projects.link": "Open project brief",
    "projects.p1.region": "Central Asia",
    "projects.p1.sector": "Energy",
    "projects.p1.title": "Kestrel Integrated Grid Hub",
    "projects.p1.text": "1.8 GW hybrid generation and transmission program designed for regional grid stability.",
    "projects.p1.scopeValue": "Generation, storage, HV systems",
    "projects.p2.region": "Middle East",
    "projects.p2.sector": "Logistics",
    "projects.p2.title": "Orion Dry Port Corridor",
    "projects.p2.text": "Intermodal logistics platform with customs automation, warehousing and rail integration.",
    "projects.p2.scopeValue": "Terminal systems, smart yard controls",
    "projects.p3.region": "Eastern Europe",
    "projects.p3.sector": "Manufacturing",
    "projects.p3.title": "Atlas Precision Campus",
    "projects.p3.text": "Advanced manufacturing ecosystem with AI-assisted production analytics and energy recovery.",
    "projects.p3.scopeValue": "Process automation, plant engineering",
    "presence.eyebrow": "Global Presence",
    "presence.title": "Operational reach across strategic industrial and infrastructure corridors.",
    "presence.city1": "London",
    "presence.city2": "Dubai",
    "presence.city3": "Singapore",
    "presence.city4": "Astana",
    "presence.city5": "Toronto",
    "presence.coverageLabel": "Coverage",
    "presence.coverageText": "24 markets with focus on energy, logistics and industrial modernization.",
    "presence.deliveryLabel": "Delivery Model",
    "presence.deliveryText": "Regional partnerships combined with centralized governance and risk oversight.",
    "partners.eyebrow": "Partners",
    "partners.title": "Structured for collaboration with operators, governments and capital institutions.",
    "partners.item1": "Infrastructure Funds",
    "partners.item2": "Industrial OEMs",
    "partners.item3": "Sovereign Entities",
    "partners.item4": "Utilities",
    "partners.item5": "Logistics Operators",
    "partners.item6": "Technology Alliances",
    "investors.eyebrow": "Investors",
    "investors.title": "Growth strategy supported by disciplined governance and visible project economics.",
    "investors.stat1": "active strategic partnerships",
    "investors.stat2": "pipeline opportunities under review",
    "investors.stat3": "target governance and risk framework maturity",
    "investors.stat4": "long-range growth horizon for regional expansion",
    "investors.highlightsLabel": "Financial Highlights",
    "investors.highlightsText": "Diversified project pipeline, phased capital deployment and margin-led delivery model.",
    "investors.governanceLabel": "Governance",
    "investors.governanceText": "Transparent reporting, independent oversight and ESG integration for institutional readiness.",
    "investors.reportsLabel": "Reports",
    "investors.reportsText": "Annual report, investor presentation and strategy review blocks can be added as downloadable files.",
    "news.eyebrow": "News",
    "news.title": "Recent announcements, project milestones and strategic market updates.",
    "news.n1.date": "March 2026",
    "news.n1.title": "CONSTERA advances cross-border energy storage framework with regional utility consortium.",
    "news.link1": "Discuss opportunity",
    "news.n2.date": "February 2026",
    "news.n2.title": "Industrial modernization program enters delivery phase with new automation stack.",
    "news.link2": "View portfolio",
    "news.n3.date": "January 2026",
    "news.n3.title": "Board approves expansion roadmap focused on logistics corridors and resilient infrastructure.",
    "news.link3": "Investor section",
    "contact.eyebrow": "Contact",
    "contact.title": "Start a partnership conversation with the CONSTERA corporate team.",
    "contact.hq": "Corporate Headquarters",
    "contact.addr1": "One Horizon Square, Level 28",
    "contact.addr2": "Global Business District",
    "contact.name": "Name",
    "contact.namePlaceholder": "Your full name",
    "contact.company": "Company",
    "contact.companyPlaceholder": "Company or institution",
    "contact.email": "Email",
    "contact.inquiry": "Inquiry",
    "contact.inquiryPlaceholder": "Describe your partnership, investment or project inquiry",
    "contact.submit": "Send Inquiry",
    "contact.success": "Inquiry sent successfully.",
    "contact.error": "Failed to send inquiry. Please try again later.",
    "contact.validation": "Please complete all required fields correctly.",
    "contact.error.nameRequired": "Please enter your name.",
    "contact.error.nameShort": "Name must contain at least 2 characters.",
    "contact.error.companyShort": "Company name must contain at least 2 characters.",
    "contact.error.emailRequired": "Please enter your email address.",
    "contact.error.emailInvalid": "Please enter a valid email address.",
    "contact.error.messageRequired": "Please enter your inquiry.",
    "contact.error.messageShort": "Inquiry must contain at least 10 characters.",
    "footer.description": "International industrial group focused on infrastructure, energy systems and advanced manufacturing partnerships.",
    "footer.navigation": "Navigation",
    "footer.contact": "Contact",
    "footer.legal": "Information",
    "footer.address": "One Horizon Square, Level 28",
    "footer.rights": "All rights reserved.",
    "footer.note": "Corporate website concept for presentation purposes.",
    "footer.copyright": "© 2026 CONSTERA Industrial Group",
    "footer.backToTop": "Back to top"
  },
  ru: {
    "meta.title": "CONSTERA Industrial Group | Промышленная инфраструктура, энергетика и производство",
    "meta.description": "CONSTERA Industrial Group — международная промышленная группа с фокусом на инфраструктуру, энергетические системы, advanced manufacturing и стратегические партнерства.",
    "brand.subtitle": "Индастриал Груп",
    "nav.home": "Главная",
    "nav.about": "О компании",
    "nav.divisions": "Направления",
    "nav.projects": "Проекты",
    "nav.investors": "Инвесторам",
    "nav.news": "Новости",
    "nav.contact": "Контакты",
    "nav.partner": "Партнерский запрос",
    "hero.eyebrow": "Глобальная промышленная инфраструктура",
    "hero.title": "Создаем устойчивые индустриальные платформы для следующего этапа роста.",
    "hero.text": "CONSTERA Industrial Group объединяет энергетику, логистику, передовое производство и стратегическую инфраструктуру в единую премиальную индустриальную платформу для партнерств институционального масштаба.",
    "hero.primary": "Смотреть портфель",
    "hero.secondary": "Инвест-обзор",
    "hero.ticker1": "Платформы энергоперехода",
    "hero.ticker2": "Логистические коридоры",
    "hero.ticker3": "Институциональный уровень управления",
    "metrics.markets": "Активные рынки",
    "metrics.projects": "Стратегические проекты",
    "metrics.pipeline": "Инвестиционный пайплайн",
    "metrics.talent": "Инженерная команда",
    "band.footprintLabel": "География присутствия",
    "band.footprintValue": "24 стратегических рынка",
    "band.sectorsLabel": "Приоритетные сектора",
    "band.sectorsValue": "Энергетика, логистика, advanced industry",
    "band.modelLabel": "Партнерская модель",
    "band.modelValue": "Синергия государства, бизнеса и институционального капитала",
    "about.eyebrow": "О компании",
    "about.title": "Корпоративная платформа, выстроенная для масштаба, контроля и долгосрочного создания стоимости.",
    "about.p1": "CONSTERA Industrial Group позиционируется как международный промышленно-инфраструктурный холдинг с компетенциями в инициации проектов, инженерной реализации, цифровых операциях и стратегических партнерствах по активам.",
    "about.p2": "Нарратив компании строится вокруг дисциплины исполнения, глубокой технической экспертизы и интегрированной операционной модели, подходящей для государственного сектора, институциональных инвесторов и международных контрагентов.",
    "about.positioningLabel": "Позиционирование",
    "about.positioningText": "Синергия промышленности, инфраструктуры и технологий",
    "about.modelLabel": "Операционная модель",
    "about.modelText": "Сквозные компетенции от концепции до оптимизации жизненного цикла",
    "about.partnerLabel": "Фокус на партнерах",
    "about.partnerText": "B2B-клиенты, суверенные структуры и институциональные партнеры по капиталу",
    "about.ribbon1": "Инициация проектов",
    "about.ribbon2": "Инженерное управление",
    "about.ribbon3": "Оптимизация жизненного цикла активов",
    "about.ribbon4": "Цифровая операционная аналитика",
    "divisions.eyebrow": "Направления",
    "divisions.title": "Специализированные бизнес-юниты, выстроенные вокруг стратегических индустриальных драйверов роста.",
    "divisions.link": "Обсудить направление",
    "divisions.energy.topline": "Энергетические системы",
    "divisions.energy.title": "Объекты utility-scale power, модернизация сетей и декарбонизационные активы.",
    "divisions.energy.text": "Компетенции в EPC-координации, интеграции накопителей и построении устойчивых энергосетей.",
    "divisions.energy.li1": "12 ГВт управляемого пайплайна",
    "divisions.energy.li2": "Гибридные сетевые технологии",
    "divisions.energy.li3": "Региональная способность к развертыванию",
    "divisions.infrastructure.topline": "Промышленная инфраструктура",
    "divisions.infrastructure.title": "Транспортные, логистические и mission-critical объекты высокой сложности.",
    "divisions.infrastructure.text": "Исполнительные модели для портов, терминалов, коридоров и комплексных индустриальных платформ.",
    "divisions.infrastructure.li1": "Управление мультисайтовыми программами",
    "divisions.infrastructure.li2": "Контроль через digital twin",
    "divisions.infrastructure.li3": "Оптимизация активов на всем цикле",
    "divisions.manufacturing.topline": "Передовое производство",
    "divisions.manufacturing.title": "Умные производственные системы и точная индустриальная трансформация.",
    "divisions.manufacturing.text": "Производственные среды с автоматизацией и программами эффективности на базе аналитики.",
    "divisions.manufacturing.li1": "Архитектура Industry 4.0",
    "divisions.manufacturing.li2": "Системы управления процессами и роботизация",
    "divisions.manufacturing.li3": "Оптимизация OEE и выхода годной продукции",
    "projects.eyebrow": "Проекты",
    "projects.title": "Избирательный портфель проектов в энергетике, мобильности и высокоценных индустриальных активах.",
    "projects.investment": "Инвестиции",
    "projects.scope": "Объем работ",
    "projects.link": "Открыть проект",
    "projects.p1.region": "Центральная Азия",
    "projects.p1.sector": "Энергетика",
    "projects.p1.title": "Kestrel Integrated Grid Hub",
    "projects.p1.text": "Гибридная генерация и передающая инфраструктура мощностью 1,8 ГВт для повышения устойчивости региональной энергосистемы.",
    "projects.p1.scopeValue": "Генерация, накопители, системы ВН",
    "projects.p2.region": "Ближний Восток",
    "projects.p2.sector": "Логистика",
    "projects.p2.title": "Orion Dry Port Corridor",
    "projects.p2.text": "Интермодальная логистическая платформа с автоматизацией таможни, складской инфраструктурой и интеграцией с железной дорогой.",
    "projects.p2.scopeValue": "Терминальные системы, smart yard controls",
    "projects.p3.region": "Восточная Европа",
    "projects.p3.sector": "Производство",
    "projects.p3.title": "Atlas Precision Campus",
    "projects.p3.text": "Экосистема передового производства с AI-аналитикой процессов и системами рекуперации энергии.",
    "projects.p3.scopeValue": "Автоматизация процессов, plant engineering",
    "presence.eyebrow": "Глобальное присутствие",
    "presence.title": "Операционный охват ключевых промышленных и инфраструктурных коридоров.",
    "presence.city1": "Лондон",
    "presence.city2": "Дубай",
    "presence.city3": "Сингапур",
    "presence.city4": "Астана",
    "presence.city5": "Торонто",
    "presence.coverageLabel": "Охват",
    "presence.coverageText": "24 рынка с фокусом на энергетику, логистику и индустриальную модернизацию.",
    "presence.deliveryLabel": "Модель реализации",
    "presence.deliveryText": "Региональные партнерства, усиленные централизованным управлением и риск-контролем.",
    "partners.eyebrow": "Партнеры",
    "partners.title": "Модель сотрудничества, рассчитанная на операторов, государства и институты капитала.",
    "partners.item1": "Инфраструктурные фонды",
    "partners.item2": "Промышленные OEM",
    "partners.item3": "Суверенные структуры",
    "partners.item4": "Энергокомпании",
    "partners.item5": "Логистические операторы",
    "partners.item6": "Технологические альянсы",
    "investors.eyebrow": "Инвесторам",
    "investors.title": "Стратегия роста, подкрепленная дисциплиной управления и прозрачной экономикой проектов.",
    "investors.stat1": "активных стратегических партнерств",
    "investors.stat2": "возможности в пайплайне на стадии оценки",
    "investors.stat3": "целевой уровень зрелости governance и risk framework",
    "investors.stat4": "горизонт стратегической экспансии",
    "investors.highlightsLabel": "Финансовые акценты",
    "investors.highlightsText": "Диверсифицированный пайплайн проектов, поэтапное размещение капитала и delivery-модель с фокусом на маржинальность.",
    "investors.governanceLabel": "Корпоративное управление",
    "investors.governanceText": "Прозрачная отчетность, независимый контроль и интеграция ESG для институциональной готовности.",
    "investors.reportsLabel": "Отчетность",
    "investors.reportsText": "Годовой отчет, инвест-презентация и стратегический обзор могут быть добавлены как скачиваемые материалы.",
    "news.eyebrow": "Новости",
    "news.title": "Последние анонсы, проектные этапы и стратегические рыночные обновления.",
    "news.n1.date": "Март 2026",
    "news.n1.title": "CONSTERA продвигает трансграничную платформу хранения энергии совместно с региональным консорциумом utilities.",
    "news.link1": "Обсудить возможность",
    "news.n2.date": "Февраль 2026",
    "news.n2.title": "Программа индустриальной модернизации перешла в фазу реализации с новым стеком автоматизации.",
    "news.link2": "Смотреть портфель",
    "news.n3.date": "Январь 2026",
    "news.n3.title": "Совет директоров утвердил дорожную карту экспансии с фокусом на логистические коридоры и устойчивую инфраструктуру.",
    "news.link3": "Раздел для инвесторов",
    "contact.eyebrow": "Контакты",
    "contact.title": "Начните диалог о партнерстве с корпоративной командой CONSTERA.",
    "contact.hq": "Корпоративная штаб-квартира",
    "contact.addr1": "One Horizon Square, уровень 28",
    "contact.addr2": "Global Business District",
    "contact.name": "Имя",
    "contact.namePlaceholder": "Ваше полное имя",
    "contact.company": "Компания",
    "contact.companyPlaceholder": "Компания или организация",
    "contact.email": "Email",
    "contact.inquiry": "Запрос",
    "contact.inquiryPlaceholder": "Опишите ваш партнерский, инвестиционный или проектный запрос",
    "contact.submit": "Отправить запрос",
    "contact.success": "Запрос успешно отправлен.",
    "contact.error": "Не удалось отправить запрос. Попробуйте позже.",
    "contact.validation": "Пожалуйста, корректно заполните все обязательные поля.",
    "contact.error.nameRequired": "Пожалуйста, укажите имя.",
    "contact.error.nameShort": "Имя должно содержать не менее 2 символов.",
    "contact.error.companyShort": "Название компании должно содержать не менее 2 символов.",
    "contact.error.emailRequired": "Пожалуйста, укажите email.",
    "contact.error.emailInvalid": "Пожалуйста, укажите корректный email.",
    "contact.error.messageRequired": "Пожалуйста, укажите текст запроса.",
    "contact.error.messageShort": "Текст запроса должен содержать не менее 10 символов.",
    "footer.description": "Международная промышленная группа с фокусом на инфраструктуру, энергетические системы и партнерства в сфере передового производства.",
    "footer.navigation": "Навигация",
    "footer.contact": "Контакты",
    "footer.legal": "Информация",
    "footer.address": "One Horizon Square, уровень 28",
    "footer.rights": "Все права защищены.",
    "footer.note": "Корпоративная концепция сайта для презентационных целей.",
    "footer.copyright": "© 2026 CONSTERA Industrial Group",
    "footer.backToTop": "Наверх"
  }
};

let currentLanguage = localStorage.getItem("constera-language") || "en";
let languageTransitionTimers = [];

const applyTranslations = (lang) => {
  const dictionary = translations[lang] || translations.en;
  if (hasTranslationTargets) {
    document.documentElement.lang = lang;
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
    button.classList.toggle("is-active", button.dataset.lang === lang);
  });

  if (langInput) {
    langInput.value = lang;
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
  const message = translations[currentLanguage][errorKey];

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
  const locale = currentLanguage === "ru" ? "ru-RU" : "en-US";

  const tick = (now) => {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const value = Math.round(target * eased);
    entry.target.textContent = value.toLocaleString(locale);

    if (progress < 1) {
      requestAnimationFrame(tick);
    }
  };

  requestAnimationFrame(tick);
};

if (menuToggle && nav) {
  menuToggle.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("is-open");
    menuToggle.setAttribute("aria-expanded", String(isOpen));
    menuToggle.classList.toggle("is-active", isOpen);
  });

  nav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      nav.classList.remove("is-open");
      menuToggle.setAttribute("aria-expanded", "false");
      menuToggle.classList.remove("is-active");
    });
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (!nav.classList.contains("is-open")) return;
    if (nav.contains(target) || menuToggle.contains(target)) return;
    nav.classList.remove("is-open");
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.classList.remove("is-active");
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    nav.classList.remove("is-open");
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.classList.remove("is-active");
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
    const nextLanguage = button.dataset.lang;
    if (nextLanguage === currentLanguage) return;

    languageTransitionTimers.forEach((timer) => window.clearTimeout(timer));
    languageTransitionTimers = [];

    if (pageTransition) {
      pageTransition.classList.add("is-visible");
    }

    const applyTimer = window.setTimeout(() => {
      currentLanguage = nextLanguage;
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
const statusLang = params.get("lang");

if (statusLang && translations[statusLang]) {
  currentLanguage = statusLang;
  localStorage.setItem("constera-language", currentLanguage);
  applyTranslations(currentLanguage);
}

if (formStatus && (status === "success" || status === "error")) {
  setFormStatus(status, translations[currentLanguage][`contact.${status}`]);
}

if (status === "validation") {
  setFormStatus("error", translations[currentLanguage]["contact.validation"]);
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
    if (langInput) {
      langInput.value = currentLanguage;
    }

    let firstInvalidField = null;
    const isValid = formFields.every((field) => {
      const fieldValid = validateField(field);
      if (!fieldValid && !firstInvalidField) firstInvalidField = field;
      return fieldValid;
    });

    if (!isValid) {
      event.preventDefault();
      setFormStatus("error", translations[currentLanguage]["contact.validation"]);
      firstInvalidField?.focus();
    }
  });
}
