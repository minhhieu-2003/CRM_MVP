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

export async function listCustomers(identity) {
  const plan = planQueryContext(identity);
  const data = await baseListCustomers();
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
  const data = await baseGetMaturityCustomers(daysAhead);
  return enforceScope(data, plan, "customer");
}

export async function listOpportunities(identity) {
  const plan = planQueryContext(identity);
  const data = await baseListOpportunities();
  return enforceScope(data, plan, "opportunity");
}

export async function getCustomerOpportunities(customerId, identity) {
  const plan = planQueryContext(identity);
  const data = await baseGetCustomerOpportunities(customerId);
  return enforceScope(data, plan, "opportunity");
}

export async function listInteractions(identity) {
  const plan = planQueryContext(identity);
  const data = await baseListInteractions();
  return enforceScope(data, plan, "interaction");
}

export async function getCustomerInteractions(customerId, identity) {
  const plan = planQueryContext(identity);
  const data = await baseGetCustomerInteractions(customerId);
  return enforceScope(data, plan, "interaction");
}

export async function listCampaigns(identity) {
  const plan = planQueryContext(identity);
  const data = await baseListCampaigns();
  return enforceScope(data, plan, "campaign");
}

export { draftEmailForCustomer, draftCallScript, formatVnd };
