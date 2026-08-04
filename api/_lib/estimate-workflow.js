const fold = (value) => String(value ?? "")
  .trim()
  .toLocaleLowerCase("az-AZ")
  .replace(/ə/g, "e")
  .replace(/ö/g, "o")
  .replace(/ü/g, "u")
  .replace(/ı/g, "i")
  .replace(/ğ/g, "g")
  .replace(/ş/g, "s")
  .replace(/ç/g, "c");

export const ESTIMATE_PHASES = Object.freeze([
  "Bünövrə və konstruksiya",
  "Qapalı kontur",
  "MEP sistemləri",
  "Tamamlama",
  "Ümumi"
]);

const phaseRules = [
  {
    phase: "Bünövrə və konstruksiya",
    terms: ["beton", "sement", "armatur", "metal", "profil", "blok", "kerpic", "horgu", "bunovre", "konstruksiya"]
  },
  {
    phase: "Qapalı kontur",
    terms: ["dam", "fasad", "izolyasiya", "membran", "pencere", "qapi", "suse", "xps", "eps", "das yun"]
  },
  {
    phase: "MEP sistemləri",
    terms: ["elektrik", "kabel", "avtomat", "santexnika", "boru", "fitinq", "hvac", "havalandirma", "kondisioner", "yangin"]
  },
  {
    phase: "Tamamlama",
    terms: ["boya", "suvaq", "spaklyovka", "gips", "kafel", "keramoqranit", "doseme", "laminat", "parket", "yapisdirici", "dekor"]
  }
];

export const classifyEstimatePhase = ({ title = "", category = "" } = {}) => {
  const source = fold(`${category} ${title}`);
  return phaseRules.find((rule) => rule.terms.some((term) => source.includes(term)))?.phase || "Ümumi";
};

export const estimateCriticality = ({ phase, confidence } = {}) => {
  const normalizedPhase = ESTIMATE_PHASES.includes(phase) ? phase : "Ümumi";
  const normalizedConfidence = fold(confidence);
  if (normalizedPhase === "Bünövrə və konstruksiya" || normalizedPhase === "MEP sistemləri") return "Yüksək";
  if (normalizedConfidence === "asagi" || normalizedConfidence === "low") return "Yüksək";
  if (normalizedPhase === "Qapalı kontur") return "Orta";
  return "Normal";
};

export const enrichEstimateWorkflowRow = (row = {}) => {
  const phase = ESTIMATE_PHASES.includes(row.phase)
    ? row.phase
    : classifyEstimatePhase(row);
  return {
    ...row,
    phase,
    criticality: ["Yüksək", "Orta", "Normal"].includes(row.criticality)
      ? row.criticality
      : estimateCriticality({ phase, confidence: row.confidence }),
    included: row.included !== false
  };
};
