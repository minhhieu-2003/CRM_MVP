/**
 * keywordRepository.js
 *
 * Loads intent keywords and keyword aliases from the DB (sqlite / postgres /
 * sandbox) or falls back to the compiled-in defaults when running in mock mode.
 *
 * Results are cached in-memory for the lifetime of the process to avoid
 * repeated DB round-trips on every chat turn. Call invalidateCache() to force
 * a reload (e.g. after an admin updates intent_keywords via SQL).
 *
 * Security: no PII is stored in these tables. Safe to log table names but
 * never log raw keyword content to external sinks.
 */

import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getCrmConfig } from "./dbClient.js";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** @type {Map<string, string[]> | null} */
let _keywordsCache = null;

/** @type {Map<string, string> | null} */
let _aliasesCache = null;

// ─── Compiled-in defaults (mirror of mcpContextEngine.js hardcoded arrays) ────
// Used in mock mode or when the DB tables are empty/unavailable.

const DEFAULT_INTENT_KEYWORDS = /** @type {[string, string, string][]} */ ([
  ["maturity-reminder", "nhac",            "CONTAINS"],
  ["maturity-reminder", "tiet kiem",       "CONTAINS"],
  ["maturity-reminder", "den han",         "CONTAINS"],
  ["maturity-reminder", "1",               "EXACT"],
  ["email-draft",       "soan",            "CONTAINS"],
  ["email-draft",       "viet",            "CONTAINS"],
  ["email-draft",       "draft",           "CONTAINS"],
  ["email-draft",       "email",           "CONTAINS"],
  ["email-draft",       "mail",            "CONTAINS"],
  ["email-draft",       "soan tiep",       "CONTAINS"],
  ["email-draft",       "follow up",       "CONTAINS"],
  ["email-draft",       "cham soc",        "CONTAINS"],
  ["email-draft",       "khach hang",      "CONTAINS"],
  ["email-draft",       "nhom",            "CONTAINS"],
  ["email-draft",       "tiep",            "CONTAINS"],
  ["email-draft",       "2",               "EXACT"],
  ["suggest-opportunity", "co hoi",        "CONTAINS"],
  ["suggest-opportunity", "opportunity",   "CONTAINS"],
  ["suggest-opportunity", "goi y",         "CONTAINS"],
  ["suggest-opportunity", "3",             "EXACT"],
  ["campaign-summary",  "chien dich",      "CONTAINS"],
  ["campaign-summary",  "campaign",        "CONTAINS"],
  ["campaign-summary",  "4",              "EXACT"],
  ["today-care-list",   "hom nay",        "CONTAINS"],
  ["today-care-list",   "ngay nay",       "CONTAINS"],
  ["today-care-list",   "tiep",           "CONTAINS"],
  ["today-care-list",   "cham soc",       "CONTAINS"],
  ["today-care-list",   "gap",            "CONTAINS"],
  ["today-care-list",   "goi",            "CONTAINS"],
  ["today-care-list",   "bao nhieu",      "CONTAINS"],
  ["today-care-list",   "liet ke",        "CONTAINS"],
  ["today-care-list",   "danh sach",      "CONTAINS"],
  ["today-care-list",   "can",            "CONTAINS"],
  ["product-summary",   "san pham",       "CONTAINS"],
  ["product-summary",   "bao nhieu",      "CONTAINS"],
  ["product-summary",   "liet ke",        "CONTAINS"],
  ["product-summary",   "danh sach",      "CONTAINS"],
  ["product-summary",   "tiep can",       "CONTAINS"],
  ["product-summary",   "khach hang",     "CONTAINS"],
  ["savings-threshold", "tiet kiem",      "CONTAINS"],
  ["savings-threshold", "khoan tiet kiem","CONTAINS"],
  ["savings-threshold", "so du",          "CONTAINS"],
  ["savings-threshold", "lon hon",        "CONTAINS"],
  ["savings-threshold", "tren",           "CONTAINS"],
  ["savings-threshold", "hon",            "CONTAINS"],
  ["savings-threshold", "bao nhieu",      "CONTAINS"],
  ["savings-threshold", "nguoi",          "CONTAINS"],
  ["savings-threshold", "khach",          "CONTAINS"],
  ["savings-threshold", "liet ke",        "CONTAINS"],
  ["savings-threshold", "danh sach",      "CONTAINS"],
  ["call-script",       "call script",    "CONTAINS"],
  ["call-script",       "kich ban goi",   "CONTAINS"],
  ["call-script",       "kich ban",       "CONTAINS"],
]);

const DEFAULT_ALIASES = /** @type {[string, string][]} */ ([
  ["khac hang",   "khach hang"],
  ["tiep khach",  "khach hang"],
  ["kh",          "khach hang"],
  ["ts",          "tiet kiem"],
  ["tk",          "tiet kiem"],
  ["tiet tkiem",  "tiet kiem"],
  ["dh",          "den han"],
  ["sap den han", "den han"],
  ["ch",          "co hoi"],
  ["cd",          "chien dich"],
  ["chien djch",  "chien dich"],
  ["em soan",     "soan"],
  ["em viet",     "viet"],
  ["nhac nho",    "nhac"],
  ["nhac han",    "nhac"],
  ["sd",          "so du"],
  ["hnay",        "hom nay"],
  ["hom nqy",     "hom nay"],
  ["kbs",         "kich ban"],
  ["kb",          "kich ban goi"],
  ["sp",          "san pham"],
  ["kqkd",        "ket qua kinh doanh"],
]);

// ─── Cache management ─────────────────────────────────────────────────────────

/**
 * Invalidate the in-memory keyword and alias caches.
 * The next call to loadIntentKeywords() or loadKeywordAliases() will re-query
 * the DB.
 */
export function invalidateCache() {
  _keywordsCache = null;
  _aliasesCache = null;
}

// ─── SQLite loader ────────────────────────────────────────────────────────────

function loadFromSqlite(sqlitePath) {
  let db;
  try {
    db = new Database(sqlitePath, { readonly: true, fileMustExist: true });
    db.pragma("foreign_keys = ON");

    const kwRows = db
      .prepare(
        "SELECT intent_name, keyword, match_type FROM intent_keywords WHERE active = 1 ORDER BY intent_name, id"
      )
      .all();

    const aliasRows = db
      .prepare("SELECT alias, canonical FROM keyword_aliases WHERE active = 1")
      .all();

    return { kwRows, aliasRows };
  } catch (err) {
    throw new Error("keywordRepository: cannot read from SQLite.", { cause: err });
  } finally {
    db?.close();
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns a Map from intent_name → array of keyword strings.
 * In mock mode (or if the DB tables are empty) falls back to compiled-in defaults.
 *
 * @returns {Promise<Map<string, string[]>>}
 */
export async function loadIntentKeywords() {
  if (_keywordsCache) return _keywordsCache;

  const config = getCrmConfig();

  /** @type {Array<{ intent_name: string; keyword: string; match_type: string }>} */
  let rows = [];

  if (config.mode === "sqlite") {
    try {
      const sqlitePath = config.sqlitePath ?? path.resolve(REPO_ROOT, "db/crm.db");
      ({ kwRows: rows } = loadFromSqlite(sqlitePath));
    } catch {
      // Fall through to defaults
    }
  }

  // Use defaults if DB not available or returned nothing
  if (rows.length === 0) {
    rows = DEFAULT_INTENT_KEYWORDS.map(([intent_name, keyword, match_type]) => ({
      intent_name,
      keyword,
      match_type,
    }));
  }

  /** @type {Map<string, string[]>} */
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.intent_name)) map.set(row.intent_name, []);
    map.get(row.intent_name).push(row.keyword);
  }

  _keywordsCache = map;
  return map;
}

/**
 * Returns a Map from alias → canonical keyword.
 * In mock mode falls back to compiled-in defaults.
 *
 * @returns {Promise<Map<string, string>>}
 */
export async function loadKeywordAliases() {
  if (_aliasesCache) return _aliasesCache;

  const config = getCrmConfig();

  /** @type {Array<{ alias: string; canonical: string }>} */
  let rows = [];

  if (config.mode === "sqlite") {
    try {
      const sqlitePath = config.sqlitePath ?? path.resolve(REPO_ROOT, "db/crm.db");
      ({ aliasRows: rows } = loadFromSqlite(sqlitePath));
    } catch {
      // Fall through to defaults
    }
  }

  if (rows.length === 0) {
    rows = DEFAULT_ALIASES.map(([alias, canonical]) => ({ alias, canonical }));
  }

  /** @type {Map<string, string>} */
  const map = new Map(rows.map((r) => [r.alias, r.canonical]));

  _aliasesCache = map;
  return map;
}

/**
 * Apply alias substitutions to a normalized (no-diacritics) text string.
 * Replaces whole-word alias occurrences with their canonical equivalents so
 * that subsequent intent matching works correctly on both shorthand and
 * full-form messages.
 *
 * @param {string} normalizedText
 * @param {Map<string, string>} aliases
 * @returns {string}
 */
export function applyAliases(normalizedText, aliases) {
  let result = normalizedText;
  // Sort by descending length so longer aliases are substituted first
  const sorted = [...aliases.entries()].sort((a, b) => b[0].length - a[0].length);
  for (const [alias, canonical] of sorted) {
    // Word-boundary-style replacement: space or start/end
    result = result.split(alias).join(canonical);
  }
  return result;
}
