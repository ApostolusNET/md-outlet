/**
 * UI i18n: key catalogs from /locales/{lang}.json
 * Default language is Japanese; missing keys fall back to ja.
 */

const STORAGE_KEY = "md-outlet-locale";
const DEFAULT_LANG = "ja";
const SUPPORTED = new Set(["ja", "en"]);

const catalogs = Object.create(null);
let currentLang = DEFAULT_LANG;

export function normalizeLang(raw) {
  const s = String(raw || "")
    .trim()
    .toLowerCase();
  if (s === "en" || s.startsWith("en-")) return "en";
  if (s === "ja" || s.startsWith("ja-")) return "ja";
  return DEFAULT_LANG;
}

export function getLang() {
  return currentLang;
}

export function readStoredLang() {
  try {
    return normalizeLang(localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_LANG;
  }
}

export function persistLang(lang) {
  const next = normalizeLang(lang);
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* ignore quota / private mode */
  }
  return next;
}

export function apiHeaders(extra) {
  return {
    "X-MD-Outlet-Lang": currentLang,
    ...(extra || {}),
  };
}

export async function apiFetch(url, opts = {}) {
  const headers = apiHeaders(opts.headers || {});
  return fetch(url, { ...opts, headers });
}

export function t(key, vars) {
  const primary = catalogs[currentLang] || {};
  const fallback = catalogs[DEFAULT_LANG] || {};
  let text = primary[key] ?? fallback[key] ?? key;
  if (vars && typeof vars === "object") {
    for (const [k, v] of Object.entries(vars)) {
      text = text.split(`{${k}}`).join(String(v));
    }
  }
  return text;
}

async function loadCatalog(lang) {
  if (catalogs[lang]) return catalogs[lang];
  const res = await fetch(`/locales/${lang}.json`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`locale ${lang}: ${res.status}`);
  catalogs[lang] = await res.json();
  return catalogs[lang];
}

function applyAttr(el, attr, key) {
  if (!key) return;
  const val = t(key);
  if (attr === "text") {
    el.textContent = val;
  } else if (attr === "html") {
    el.innerHTML = val;
  } else {
    el.setAttribute(attr, val);
  }
}

/** Apply data-i18n* attributes across the document. */
export function applyDomI18n() {
  document.documentElement.lang = currentLang;

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    applyAttr(el, "text", el.getAttribute("data-i18n"));
  });
  document.querySelectorAll("[data-i18n-html]").forEach((el) => {
    applyAttr(el, "html", el.getAttribute("data-i18n-html"));
  });
  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    applyAttr(el, "title", el.getAttribute("data-i18n-title"));
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    applyAttr(el, "placeholder", el.getAttribute("data-i18n-placeholder"));
  });
  document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    applyAttr(el, "aria-label", el.getAttribute("data-i18n-aria"));
  });

  syncLangMenuUi();
}

function syncLangMenuUi() {
  const summary = document.getElementById("langMenuSummary");
  if (summary) {
    const flag = summary.querySelector(".lang-flag");
    const label = summary.querySelector(".lang-label");
    if (flag) flag.setAttribute("data-flag", currentLang === "en" ? "en" : "ja");
    if (label) {
      label.setAttribute(
        "data-i18n",
        currentLang === "en" ? "lang.en" : "lang.ja"
      );
      label.textContent = t(currentLang === "en" ? "lang.en" : "lang.ja");
    }
  }
  document.querySelectorAll("[data-set-lang]").forEach((btn) => {
    const lang = btn.getAttribute("data-set-lang");
    btn.classList.toggle("active", lang === currentLang);
  });
  const menu = document.getElementById("langMenu");
  if (menu) menu.open = false;
}

/**
 * Load catalogs and set language. Does not toast.
 * @returns {Promise<string>} active lang
 */
export async function initI18n(preferred) {
  const lang = normalizeLang(preferred ?? readStoredLang());
  await loadCatalog(DEFAULT_LANG);
  if (lang !== DEFAULT_LANG) await loadCatalog(lang);
  currentLang = lang;
  persistLang(lang);
  applyDomI18n();
  return currentLang;
}

/**
 * Switch UI language, persist, reload catalogs, re-apply DOM.
 */
export async function setLang(next) {
  const lang = normalizeLang(next);
  if (!SUPPORTED.has(lang)) return currentLang;
  if (lang !== DEFAULT_LANG) await loadCatalog(lang);
  currentLang = lang;
  persistLang(lang);
  applyDomI18n();
  return currentLang;
}

export function templateLabel(id) {
  const key = `template.${id}`;
  const primary = catalogs[currentLang] || {};
  const fallback = catalogs[DEFAULT_LANG] || {};
  return primary[key] ?? fallback[key] ?? id;
}

export function themeLabel(id) {
  const key = `theme.${id}`;
  const primary = catalogs[currentLang] || {};
  const fallback = catalogs[DEFAULT_LANG] || {};
  return primary[key] ?? fallback[key] ?? id;
}
