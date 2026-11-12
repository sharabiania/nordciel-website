// Minimal i18n: one JSON file per language in /locales, keys looked up with
// dotted paths ("work.items.0.title"), {placeholders} interpolated.
//
// Language choice order: ?lang= in the URL > saved preference > browser language > English.
// English is always loaded as the base, so a key missing in another language falls back to it.

export const LANGUAGES = { en: 'English', fr: 'Français' };
const DEFAULT = 'en';
const STORAGE_KEY = 'nordciel.lang';

let base = {};
let dict = {};
let lang = DEFAULT;
const listeners = new Set();

const cache = {};
async function load(code) {
  if (!cache[code]) {
    cache[code] = fetch(new URL(`locales/${code}.json`, import.meta.url)).then((r) => {
      if (!r.ok) throw new Error(`Locale ${code}: HTTP ${r.status}`);
      return r.json();
    });
  }
  return cache[code];
}

function lookup(obj, key) {
  return key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function detect() {
  const fromUrl = new URLSearchParams(location.search).get('lang');
  if (fromUrl && LANGUAGES[fromUrl]) return fromUrl;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && LANGUAGES[saved]) return saved;
  } catch { /* storage unavailable */ }
  const nav = (navigator.languages || [navigator.language || '']).map((l) => l.slice(0, 2).toLowerCase());
  return nav.find((l) => LANGUAGES[l]) || DEFAULT;
}

/** Translate a key. Returns arrays/objects as-is (for lists of cards). */
export function t(key, params) {
  let v = lookup(dict, key);
  if (v === undefined) v = lookup(base, key);
  if (v === undefined) return key;
  if (typeof v === 'string' && params) v = v.replace(/\{(\w+)\}/g, (m, k) => (k in params ? params[k] : m));
  return v;
}

export function getLang() { return lang; }

/** Fill [data-i18n] text and [data-i18n-attr="attr:key;attr2:key2"] attributes. */
export function applyDom(root = document) {
  document.documentElement.lang = lang;
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n, { year: new Date().getFullYear() });
  });
  root.querySelectorAll('[data-i18n-attr]').forEach((el) => {
    el.dataset.i18nAttr.split(';').forEach((pair) => {
      const [attr, key] = pair.split(':').map((s) => s.trim());
      if (attr && key) el.setAttribute(attr, t(key));
    });
  });
  root.querySelectorAll('[data-lang-switch]').forEach((el) => {
    const other = Object.keys(LANGUAGES).find((l) => l !== lang);
    el.textContent = other.toUpperCase();
    el.setAttribute('lang', other);
    el.setAttribute('aria-label', LANGUAGES[other]);
    el.href = withLang(other);
  });
}

function withLang(code) {
  const u = new URL(location.href);
  if (code === DEFAULT) u.searchParams.delete('lang'); else u.searchParams.set('lang', code);
  return u.pathname + u.search + u.hash;
}

export async function setLang(code, { remember = true } = {}) {
  if (!LANGUAGES[code]) code = DEFAULT;
  dict = code === DEFAULT ? base : await load(code);
  lang = code;
  if (remember) { try { localStorage.setItem(STORAGE_KEY, code); } catch { /* ignore */ } }
  history.replaceState(null, '', withLang(code));
  applyDom();
  listeners.forEach((fn) => fn(code));
}

export function onLangChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export async function initI18n() {
  base = await load(DEFAULT);
  const code = detect();
  try {
    dict = code === DEFAULT ? base : await load(code);
    lang = code;
  } catch {
    dict = base;
    lang = DEFAULT;
  }
  applyDom();
  // Plain links with data-lang-switch switch language without a reload.
  document.querySelectorAll('[data-lang-switch]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      setLang(Object.keys(LANGUAGES).find((l) => l !== lang));
    });
  });
  return lang;
}
