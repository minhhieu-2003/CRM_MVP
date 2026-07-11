import fs from "fs";
import { campaigns, customers, interactions, opportunities } from "./crmData.js";
import { getCrmConfig, readCrmCollection, requestCrmOperation } from "./dbClient.js";
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

let cacheKey = null;
let cachedCustomers = null;
let cachedOpportunities = null;
let cachedInteractions = null;
let cachedCampaigns = null;

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

function refreshCacheForProvider() {
  const nextKey = getCrmConfig().cacheKey;
  if (nextKey !== cacheKey) {
    cacheKey = nextKey;
    cachedCustomers = null;
    cachedOpportunities = null;
    cachedInteractions = null;
    cachedCampaigns = null;
  }
}

function pickBest(items, predicate) {
  if (items.length === 0) throw new Error("Không có mẫu nội dung CRM phù hợp.");
  const candidates = items.filter(predicate);
  const pool = candidates.length > 0 ? candidates : items;
  return [...pool].sort(
    (a, b) => (b.rating ?? 0) - (a.rating ?? 0) || (b.useCount ?? 0) - (a.useCount ?? 0)
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
  refreshCacheForProvider();
  if (cachedCustomers) return cachedCustomers;
  const mockData = largeCustomers.length > 0 ? [...customers, ...largeCustomers] : customers;
  const result = await readCrmCollection("customers", mockData);

  cachedCustomers = result.map((customer) => ({
    ...customer,
    normalizedName: customer.normalizedName || normalizeVietnamese(customer.name)
  }));
  return cachedCustomers;
}

export async function listOpportunities() {
  refreshCacheForProvider();
  if (cachedOpportunities) return cachedOpportunities;
  const mockData = largeOpportunities.length > 0 ? [...opportunities, ...largeOpportunities] : opportunities;
  cachedOpportunities = await readCrmCollection("opportunities", mockData);
  return cachedOpportunities;
}

export async function listInteractions() {
  refreshCacheForProvider();
  if (cachedInteractions) return cachedInteractions;
  const mockData = largeInteractions.length > 0 ? [...interactions, ...largeInteractions] : interactions;
  cachedInteractions = await readCrmCollection("interactions", mockData);
  return cachedInteractions;
}

export async function listCampaigns() {
  refreshCacheForProvider();
  if (!cachedCampaigns) cachedCampaigns = await readCrmCollection("campaigns", campaigns);
  return cachedCampaigns;
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
  const mode = getCrmConfig().mode;
  const remoteDraft = await requestCrmOperation("/draft-email", {
    method: "POST",
    body: { customerId: customer.id, suggestion }
  });
  if (mode === "sandbox") {
    if (!remoteDraft || typeof remoteDraft !== "object" || Array.isArray(remoteDraft)) {
      throw new Error("CRM Sandbox trả về bản nháp email không hợp lệ.");
    }
    return remoteDraft;
  }

  const templates = await readCrmCollection("emailTemplates", emailTemplates);

  const template = pickBest(
    templates,
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
    templateId: template.templateId
  };
}

export async function draftCallScript(customer, suggestion) {
  const mode = getCrmConfig().mode;
  const remoteScript = await requestCrmOperation("/call-script", {
    method: "POST",
    body: { customerId: customer.id, suggestion }
  });
  if (mode === "sandbox") {
    if (remoteScript?.script) return remoteScript.script;
    if (typeof remoteScript === "string") return remoteScript;
    throw new Error("CRM Sandbox trả về kịch bản gọi không hợp lệ.");
  }

  const scripts = await readCrmCollection("callScripts", callScripts);

  const script = pickBest(
    scripts,
    (item) => item.objective === "renewal_reminder" || item.stage === "Renewal"
  );

  const objection = script.objectionHandling?.[0];
  return [
    fillPlaceholders(script.opening, customer),
    fillPlaceholders(script.mainContent, customer),
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
