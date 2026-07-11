import {
  listCustomers as baseListCustomers,
  getCustomerById as baseGetCustomerById,
  getCustomerByName as baseGetCustomerByName,
  getMaturityCustomers as baseGetMaturityCustomers,
  listOpportunities as baseListOpportunities,
  getCustomerOpportunities as baseGetCustomerOpportunities,
  listInteractions as baseListInteractions,
  getCustomerInteractions as baseGetCustomerInteractions,
  listCampaigns as baseListCampaigns,
  draftEmailForCustomer,
  draftCallScript,
  formatVnd
} from "./crmService.js";
import { planQueryContext, enforceScope } from "./queryPlanner.js";

function ensureArray(value, operation) {
  if (!Array.isArray(value)) {
    throw new Error(`Dữ liệu CRM không hợp lệ khi ${operation}: cần một mảng.`);
  }
  return value;
}

export async function listCustomers(identity) {
  const plan = planQueryContext(identity);
  const data = ensureArray(await baseListCustomers(), "liệt kê khách hàng");
  return enforceScope(data, plan, "customer");
}

export async function getCustomerById(id, identity) {
  const plan = planQueryContext(identity);
  const data = await baseGetCustomerById(id);
  if (!data) return null;
  const scoped = enforceScope([data], plan, "customer");
  return scoped[0] || null;
}

export async function getCustomerByName(name, identity) {
  const plan = planQueryContext(identity);
  const data = await baseGetCustomerByName(name);
  if (!data) return null;
  const scoped = enforceScope([data], plan, "customer");
  return scoped[0] || null;
}

export async function getMaturityCustomers(daysAhead, identity) {
  const plan = planQueryContext(identity);
  const data = ensureArray(await baseGetMaturityCustomers(daysAhead), "lọc khách hàng đến hạn");
  return enforceScope(data, plan, "customer");
}

export async function listOpportunities(identity) {
  const plan = planQueryContext(identity);
  const data = ensureArray(await baseListOpportunities(), "liệt kê cơ hội");
  return enforceScope(data, plan, "opportunity");
}

export async function getCustomerOpportunities(customerId, identity) {
  const plan = planQueryContext(identity);
  const data = ensureArray(await baseGetCustomerOpportunities(customerId), "lọc cơ hội khách hàng");
  return enforceScope(data, plan, "opportunity");
}

export async function listInteractions(identity) {
  const plan = planQueryContext(identity);
  const data = ensureArray(await baseListInteractions(), "liệt kê tương tác");
  return enforceScope(data, plan, "interaction");
}

export async function getCustomerInteractions(customerId, identity) {
  const plan = planQueryContext(identity);
  const data = ensureArray(await baseGetCustomerInteractions(customerId), "lọc tương tác khách hàng");
  return enforceScope(data, plan, "interaction");
}

export async function listCampaigns(identity) {
  const plan = planQueryContext(identity);
  const data = ensureArray(await baseListCampaigns(), "liệt kê chiến dịch");
  return enforceScope(data, plan, "campaign");
}

export { draftEmailForCustomer, draftCallScript, formatVnd };
