import { createHmac, randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import pg from "pg";

const { Pool } = pg;
const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const REQUIRED_SQLITE_SCHEMA_VERSION = 1;
const CACHE_KEY_SECRET = randomBytes(32);

const SUPPORTED_MODES = new Set(["mock", "sqlite", "postgres", "sandbox"]);
const LEGACY_MODE_ALIASES = new Map([["production", "sandbox"]]);
const RESTRICTED_ENVIRONMENTS = new Set(["pilot", "production"]);
const TABLES = Object.freeze({
  customers: "customers",
  opportunities: "opportunities",
  interactions: "interactions",
  campaigns: "campaigns",
  emailTemplates: "email_templates",
  callScripts: "call_scripts"
});

let postgresPool = null;
let postgresPoolKey = null;

function fingerprint(...values) {
  return createHmac("sha256", CACHE_KEY_SECRET).update(JSON.stringify(values)).digest("hex");
}

function required(value, variableName) {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`Thiếu cấu hình CRM bắt buộc: ${variableName}.`);
  return normalized;
}

function parseTimeout(value) {
  if (value === undefined || value === "") return 5000;
  if (!/^\d+$/.test(value)) throw new Error("CRM_TIMEOUT_MS phải là số nguyên dương.");

  const timeoutMs = Number(value);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000) {
    throw new Error("CRM_TIMEOUT_MS phải nằm trong khoảng 1 đến 120000 ms.");
  }
  return timeoutMs;
}

export function getCrmConfig(env = process.env) {
  const nodeEnv = (env.NODE_ENV || "development").trim().toLowerCase();
  const configuredMode = (env.CRM_MODE || "mock").trim().toLowerCase();
  const mode = LEGACY_MODE_ALIASES.get(configuredMode) || configuredMode;

  if (!SUPPORTED_MODES.has(mode)) {
    throw new Error("CRM_MODE không hợp lệ. Chỉ hỗ trợ mock, sqlite, postgres hoặc sandbox.");
  }
  if (mode === "mock" && RESTRICTED_ENVIRONMENTS.has(nodeEnv)) {
    throw new Error(`Không được dùng CRM_MODE=mock trong môi trường ${nodeEnv}.`);
  }

  const timeoutMs = parseTimeout(env.CRM_TIMEOUT_MS);
  const config = { nodeEnv, mode, timeoutMs };

  if (mode === "sqlite") {
    const configuredPath = env.CRM_SQLITE_PATH?.trim() || "db/crm.db";
    config.sqlitePath = path.resolve(REPO_ROOT, configuredPath);
    config.cacheKey = `${mode}:${fingerprint(config.sqlitePath)}`;
  } else if (mode === "postgres") {
    config.postgresUrl = required(env.CRM_POSTGRES_URL || env.DATABASE_URL, "CRM_POSTGRES_URL");
    config.cacheKey = `${mode}:${fingerprint(config.postgresUrl, timeoutMs)}`;
  } else if (mode === "sandbox") {
    config.baseUrl = required(env.CRM_API_BASE_URL, "CRM_API_BASE_URL").replace(/\/$/, "");
    config.apiKey = required(env.CRM_API_KEY, "CRM_API_KEY");
    config.authScheme = (env.CRM_API_AUTH_SCHEME || "api-key").trim().toLowerCase();
    if (config.authScheme !== "api-key" && config.authScheme !== "bearer") {
      throw new Error("CRM_API_AUTH_SCHEME chỉ hỗ trợ api-key hoặc bearer.");
    }
    config.apiKeyHeader = env.CRM_API_KEY_HEADER?.trim() || "X-API-Key";
    config.cacheKey = `${mode}:${fingerprint(
      config.baseUrl,
      config.apiKey,
      config.authScheme,
      config.apiKeyHeader,
      timeoutMs
    )}`;
  } else {
    config.cacheKey = mode;
  }

  return config;
}

function camelCaseKey(key) {
  return key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

export function mapRowToCamelCase(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return row;
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [camelCaseKey(key), value]));
}

function normalizeRows(rows, collection, provider) {
  if (!Array.isArray(rows)) {
    throw new Error(`Dữ liệu ${collection} từ CRM ${provider} không hợp lệ: cần một mảng.`);
  }

  return rows.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new Error(`Dữ liệu ${collection} từ CRM ${provider} chứa bản ghi không hợp lệ.`);
    }
    const mapped = mapRowToCamelCase(row);
    if (collection === "interactions" && mapped.occurredAt && !mapped.timestamp) {
      mapped.timestamp = mapped.occurredAt;
    }
    if (collection === "callScripts" && typeof mapped.objectionHandling === "string") {
      try {
        mapped.objectionHandling = JSON.parse(mapped.objectionHandling);
      } catch (error) {
        throw new Error("Dữ liệu xử lý phản đối trong kịch bản gọi không hợp lệ.", {
          cause: error
        });
      }
    }
    if (collection === "callScripts" && !Array.isArray(mapped.objectionHandling)) {
      throw new Error("Dữ liệu xử lý phản đối trong kịch bản gọi phải là một mảng.");
    }
    return mapped;
  });
}

function querySqlite(config, table) {
  let database;
  try {
    database = new Database(config.sqlitePath, {
      readonly: true,
      fileMustExist: true,
      timeout: config.timeoutMs
    });
    database.pragma("foreign_keys = ON");
    const schemaVersion = database.pragma("user_version", { simple: true });
    if (schemaVersion !== REQUIRED_SQLITE_SCHEMA_VERSION) {
      throw new Error(
        `Schema SQLite không tương thích: cần version ${REQUIRED_SQLITE_SCHEMA_VERSION}, hiện tại ${schemaVersion}.`
      );
    }
    return database.prepare(`SELECT * FROM ${table}`).all();
  } catch (error) {
    if (error.message?.startsWith("Schema SQLite không tương thích")) throw error;
    throw new Error("Không thể đọc dữ liệu CRM từ SQLite.", { cause: error });
  } finally {
    database?.close();
  }
}

function getPostgresPool(config) {
  const key = fingerprint(config.postgresUrl, config.timeoutMs);
  if (!postgresPool || postgresPoolKey !== key) {
    if (postgresPool) void postgresPool.end();
    postgresPool = new Pool({
      connectionString: config.postgresUrl,
      connectionTimeoutMillis: config.timeoutMs,
      statement_timeout: config.timeoutMs
    });
    postgresPoolKey = key;
  }
  return postgresPool;
}

async function queryPostgres(config, table) {
  try {
    const result = await getPostgresPool(config).query(`SELECT * FROM ${table}`);
    return result.rows;
  } catch (error) {
    throw new Error("Không thể đọc dữ liệu CRM từ PostgreSQL.", { cause: error });
  }
}

async function sandboxRequest(config, endpoint, options = {}) {
  const headers = {
    Accept: "application/json",
    ...(options.body ? { "Content-Type": "application/json" } : {})
  };
  if (config.authScheme === "bearer") {
    headers.Authorization = `Bearer ${config.apiKey}`;
  } else {
    headers[config.apiKeyHeader] = config.apiKey;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetch(`${config.baseUrl}${endpoint}`, {
      method: options.method || "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`CRM API ${endpoint} trả HTTP ${response.status}.`);

    try {
      const payload = await response.json();
      return payload?.data ?? payload;
    } catch (error) {
      throw new Error(`CRM API ${endpoint} trả dữ liệu không hợp lệ (malformed).`, {
        cause: error
      });
    }
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`CRM API ${endpoint} timeout sau ${config.timeoutMs}ms.`, { cause: error });
    }
    if (error.message.startsWith("CRM API ")) throw error;
    throw new Error("Không thể kết nối CRM Sandbox.", { cause: error });
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function readCrmCollection(collection, mockData) {
  const table = TABLES[collection];
  if (!table) throw new Error(`Tập dữ liệu CRM không được hỗ trợ: ${collection}.`);

  const config = getCrmConfig();
  if (config.mode === "mock") return normalizeRows(mockData, collection, "mock");
  if (config.mode === "sqlite") {
    return normalizeRows(querySqlite(config, table), collection, "SQLite");
  }
  if (config.mode === "postgres") {
    return normalizeRows(await queryPostgres(config, table), collection, "PostgreSQL");
  }

  const data = await sandboxRequest(config, `/${collection}`);
  return normalizeRows(data, collection, "Sandbox");
}

export async function requestCrmOperation(endpoint, options = {}) {
  const config = getCrmConfig();
  if (config.mode !== "sandbox") return null;
  return sandboxRequest(config, endpoint, options);
}
