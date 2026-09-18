/*
 * Languages, and which countries default to them.
 *
 * The set is chosen from where this product's audience actually is —
 * the institutions in data/targets.json are in Japan, Korea, Brazil,
 * Portugal, the UAE, Malaysia, Australia, Germany and France — rather
 * than from a list of the most-spoken languages.
 */

export const LANGUAGES = [
  { code: "en", label: "English",  native: "English",  dir: "ltr" },
  { code: "ja", label: "Japanese", native: "日本語",    dir: "ltr" },
  { code: "ko", label: "Korean",   native: "한국어",    dir: "ltr" },
  { code: "zh", label: "Chinese",  native: "中文",      dir: "ltr" },
  { code: "es", label: "Spanish",  native: "Español",  dir: "ltr" },
  { code: "pt", label: "Portuguese", native: "Português", dir: "ltr" },
  { code: "fr", label: "French",   native: "Français", dir: "ltr" },
  { code: "de", label: "German",   native: "Deutsch",  dir: "ltr" },
];

export const CODES = LANGUAGES.map((l) => l.code);

/*
 * Country → language.
 *
 * Only where the mapping is unambiguous. A country with no entry falls
 * through to English rather than being guessed at: showing a Belgian
 * visitor French because Belgium is partly francophone is the kind of
 * assumption that irritates the half it gets wrong.
 */
export const COUNTRY_LANGUAGE = {
  JP: "ja",
  KR: "ko",
  CN: "zh", TW: "zh", HK: "zh", SG: "zh",
  ES: "es", MX: "es", AR: "es", CO: "es", CL: "es", PE: "es", VE: "es",
  UY: "es", EC: "es", GT: "es", CR: "es", PA: "es", DO: "es", BO: "es", PY: "es",
  BR: "pt", PT: "pt", AO: "pt", MZ: "pt",
  FR: "fr", MC: "fr", SN: "fr", CI: "fr",
  DE: "de", AT: "de",
};

export function languageForCountry(country) {
  const code = String(country || "").toUpperCase();
  return COUNTRY_LANGUAGE[code] || "en";
}

export function isSupported(code) {
  return CODES.includes(String(code || "").toLowerCase());
}
