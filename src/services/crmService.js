import fs from "fs";
import { campaigns, customers, interactions, opportunities } from "./crmData.js";
import { normalizeVietnamese } from "./textUtils.js";

let emailTemplates = [];
let callScripts = [];
try {
  emailTemplates = readJson("../data/mock/email_templates.json");
} catch {
  // ignore
}
try {
  callScripts = readJson("../data/mock/call_scripts.json");
} catch {
  // ignore
}

let largeCustomers = [];
let largeOpportunities = [];
let largeInteractions = [];
try {
  largeCustomers = readJson("../data/mock/large_customers.json");
  largeOpportunities = readJson("../data/mock/large_opportunities.json");
  largeInteractions = readJson("../data/mock/large_interactions.json");
} catch {
  // ignore
}

let cachedCustomers = null;
let cachedOpportunities = null;
let cachedInteractions = null;

function toDate(value) {
  return new Date(`${value}T00:00:00+07:00`);
}

export function getBusinessDate() {
  if (process.env.CRM_BUSINESS_DATE) {
    return toDate(process.env.CRM_BUSINESS_DATE);
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return toDate(`${values.year}-${values.month}-${values.day}`);
}

function readJson(relativePath) {
  const fileUrl = new URL(relativePath, import.meta.url);
  return JSON.parse(fs.readFileSync(fileUrl, "utf8").replace(/^\uFEFF/, ""));
}

async function crmRequest(endpoint, options = {}) {
  const currentMode = process.env.CRM_MODE || "mock";
  if (currentMode === "mock") return null;

  const baseUrl = process.env.CRM_API_BASE_URL?.replace(/\/$/, "");
  const apiKey = process.env.CRM_API_KEY;

  if (!baseUrl || !apiKey) {
    throw new Error("Missing CRM API configuration (CRM_API_BASE_URL or CRM_API_KEY)");
  }

  const headers = {
    Accept: "application/json",
    ...(options.body ? { "Content-Type": "application/json" } : {})
  };

  if ((process.env.CRM_API_AUTH_SCHEME || "api-key") === "bearer") {
    headers.Authorization = `Bearer ${apiKey}`;
  } else {
    headers[process.env.CRM_API_KEY_HEADER || "X-API-Key"] = apiKey;
  }

  const controller = new AbortController();
  const timeoutMs = process.env.CRM_TIMEOUT_MS ? parseInt(process.env.CRM_TIMEOUT_MS) : 5000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`CRM API ${endpoint} trả HTTP ${response.status}`);
    }

    let payload;
    try {
      payload = await response.json();
    } catch (err) {
      throw new Error(`CRM API ${endpoint} trả dữ liệu không hợp lệ (malformed)`);
    }

    return payload.data ?? payload;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`CRM API ${endpoint} timeout sau ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function withFallback(loader, fallbackValue) {
  const currentMode = process.env.CRM_MODE || "mock";
  try {
    const data = await loader();
    return data ?? fallbackValue;
  } catch (error) {
    if (currentMode === "sandbox" || currentMode === "production") {
      throw error;
    }
    return fallbackValue;
  }
}

function pickBest(items, predicate) {
  const candidates = items.filter(predicate);
  const pool = candidates.length > 0 ? candidates : items;
  return [...pool].sort(
    (a, b) => (b.rating ?? 0) - (a.rating ?? 0) || (b.use_count ?? 0) - (a.use_count ?? 0)
  )[0];
}

function fillPlaceholders(text, customer, extra = {}) {
  const reminderDate = extra.reminderDate ?? shiftDate(customer.maturityDate, -3);
  const daysUntilMaturity =
    extra.daysUntilMaturity ?? daysBetween(formatDate(getBusinessDate()), customer.maturityDate);

  return text
    .replaceAll("[Tên]", customer.name)
    .replaceAll("[Tên RM]", extra.rmName ?? "RM Bank A")
    .replaceAll("[SĐT]", extra.rmPhone ?? "1900 0000")
    .replaceAll("[Số TK]", customer.id)
    .replaceAll("[Số tiền]", formatVnd(customer.savingsAmountVnd))
    .replaceAll("[Số lãi]", extra.interestAmount ?? "theo biểu lãi suất hiện hành")
    .replaceAll("[Ngày]", customer.maturityDate)
    .replaceAll("[Ngày-3]", reminderDate)
    .replaceAll("[số ngày]", String(daysUntilMaturity))
    .replaceAll("[Số ngày]", String(daysUntilMaturity))
    .replaceAll("[Sản phẩm]", customer.savingsProduct)
    .replaceAll("[Tên sản phẩm]", customer.savingsProduct)
    .replaceAll("[Giá trị]", formatVnd(customer.savingsAmountVnd))
    .replaceAll("[Nội dung]", extra.topic ?? "Tư vấn phương án tái tục và sản phẩm phù hợp")
    .replaceAll("[Chi nhánh/Địa điểm]", customer.location)
    .replaceAll("[Tài liệu cụ thể nếu có]", "Hồ sơ định danh theo quy định KYC")
    .replaceAll("[giờ]", extra.meetingTime ?? "09:00")
    .replaceAll("[ngày]", customer.maturityDate)
    .replaceAll("[phương án]", extra.renewalOption ?? "tái tục kỳ hạn phù hợp");
}

function shiftDate(dateValue, days) {
  const date = toDate(dateValue);
  date.setDate(date.getDate() + days);
  return formatDate(date);
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function daysBetween(fromDateValue, toDateValue) {
  const fromDate = toDate(fromDateValue);
  const targetDate = toDate(toDateValue);
  return Math.max(
    0,
    Math.round((targetDate.getTime() - fromDate.getTime()) / (24 * 60 * 60 * 1000))
  );
}

export async function listCustomers() {
  if (cachedCustomers) return cachedCustomers;
  const data = await withFallback(() => crmRequest("/customers"), customers);
  const result = data === customers && largeCustomers.length > 0 ? [...customers, ...largeCustomers] : data;

  cachedCustomers = result.map(c => {
    if (!c.normalizedName) c.normalizedName = normalizeVietnamese(c.name);
    return c;
  });
  return cachedCustomers;
}

export async function listOpportunities() {
  if (cachedOpportunities) return cachedOpportunities;
  const data = await withFallback(() => crmRequest("/opportunities"), opportunities);
  cachedOpportunities = data === opportunities && largeOpportunities.length > 0 ? [...opportunities, ...largeOpportunities] : data;
  return cachedOpportunities;
}

export async function listInteractions() {
  if (cachedInteractions) return cachedInteractions;
  const data = await withFallback(() => crmRequest("/interactions"), interactions);
  cachedInteractions = data === interactions && largeInteractions.length > 0 ? [...interactions, ...largeInteractions] : data;
  return cachedInteractions;
}

export async function listCampaigns() {
  return withFallback(() => crmRequest("/campaigns"), campaigns);
}

export async function getCustomerByName(name) {
  const normalizedName = normalizeVietnamese(name);
  const allCustomers = await listCustomers();
  return (
    allCustomers.find((item) => item.normalizedName.includes(normalizedName)) ?? null
  );
}

export async function getCustomerById(customerId) {
  const allCustomers = await listCustomers();
  return allCustomers.find((item) => item.id === customerId) ?? null;
}

export async function getCustomerOpportunities(customerId) {
  const allOpportunities = await listOpportunities();
  return allOpportunities.filter((item) => item.customerId === customerId);
}

export async function getCustomerInteractions(customerId) {
  const allInteractions = await listInteractions();
  return allInteractions.filter((item) => item.customerId === customerId);
}

export async function getMaturityCustomers(daysAhead = 7, now = null) {
  now = now || getBusinessDate();
  const maxDate = new Date(now);
  maxDate.setDate(now.getDate() + daysAhead);
  const allCustomers = await listCustomers();

  return allCustomers.filter((customer) => {
    const maturity = toDate(customer.maturityDate);
    return maturity >= now && maturity <= maxDate;
  });
}

export async function draftEmailForCustomer(customer, suggestion) {
  const remoteDraft = await withFallback(
    () =>
      crmRequest("/draft-email", {
        method: "POST",
        body: { customerId: customer.id, suggestion }
      }),
    null
  );
  if (remoteDraft) return remoteDraft;

  const template = pickBest(
    emailTemplates,
    (item) => item.type === "renewal_reminder" || item.stage === "pre_maturity"
  );

  const subject = fillPlaceholders(template.subject, customer);
  const body = [
    fillPlaceholders(template.body, customer),
    "",
    `Gợi ý cá nhân hóa: ${suggestion}`
  ].join("\n");

  return {
    subject,
    body,
    templateId: template.template_id
  };
}

export async function draftCallScript(customer, suggestion) {
  const remoteScript = await withFallback(
    () =>
      crmRequest("/call-script", {
        method: "POST",
        body: { customerId: customer.id, suggestion }
      }),
    null
  );
  if (remoteScript?.script) return remoteScript.script;
  if (typeof remoteScript === "string") return remoteScript;

  const script = pickBest(
    callScripts,
    (item) => item.objective === "renewal_reminder" || item.stage === "Renewal"
  );

  const objection = script.objection_handling?.[0];
  return [
    fillPlaceholders(script.opening, customer),
    fillPlaceholders(script.main_content, customer),
    objection
      ? `Nếu khách hàng nói "${objection.objection}": ${fillPlaceholders(objection.response, customer)}`
      : "",
    suggestion,
    fillPlaceholders(script.closing, customer)
  ]
    .filter(Boolean)
    .join(" ");
}

export function formatVnd(value) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0
  }).format(value);
}
