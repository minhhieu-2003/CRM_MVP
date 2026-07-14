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
import { assertIdentityScopes } from "./toolPolicy.js";

const CUSTOMER_READ = Object.freeze(["customer:read"]);
const OPPORTUNITY_READ = Object.freeze(["opportunity:read"]);
const INTERACTION_READ = Object.freeze(["interaction:read"]);
const CAMPAIGN_READ = Object.freeze(["campaign:read"]);

function ensureArray(value, operation) {
  if (!Array.isArray(value)) {
    throw new Error(`Du lieu CRM khong hop le khi ${operation}: can mot mang.`);
  }
  return value;
}

async function getCustomerScope(identity) {
  const plan = planQueryContext(identity);
  const customers = ensureArray(await baseListCustomers(), "liet ke khach hang");
  const scopedCustomers = enforceScope(customers, plan, "customer");
  return {
    plan,
    customerIds: new Set(scopedCustomers.map((customer) => customer.id)),
    customerSegments: new Set(
      scopedCustomers.map((customer) => customer.segment).filter(Boolean)
    )
  };
}

async function enforceCustomerLinkedScope(data, identity, entityType) {
  const scope = await getCustomerScope(identity);
  return enforceScope(data, scope.plan, entityType, scope);
}

export async function listCustomers(identity) {
  assertIdentityScopes({ identity, requiredScopes: CUSTOMER_READ });
  const plan = planQueryContext(identity);
  const data = ensureArray(await baseListCustomers(), "liet ke khach hang");
  return enforceScope(data, plan, "customer");
}

export async function getCustomerById(id, identity) {
  assertIdentityScopes({ identity, requiredScopes: CUSTOMER_READ });
  const plan = planQueryContext(identity);
  const data = await baseGetCustomerById(id);
  if (!data) return null;
  const scoped = enforceScope([data], plan, "customer");
  return scoped[0] || null;
}

export async function getCustomerByName(name, identity) {
  assertIdentityScopes({ identity, requiredScopes: CUSTOMER_READ });
  const plan = planQueryContext(identity);
  const data = await baseGetCustomerByName(name);
  if (!data) return null;
  const scoped = enforceScope([data], plan, "customer");
  return scoped[0] || null;
}

export async function getMaturityCustomers(daysAhead, identity) {
  assertIdentityScopes({ identity, requiredScopes: CUSTOMER_READ });
  const plan = planQueryContext(identity);
  const data = ensureArray(await baseGetMaturityCustomers(daysAhead), "loc khach hang den han");
  return enforceScope(data, plan, "customer");
}

export async function listOpportunities(identity) {
  assertIdentityScopes({ identity, requiredScopes: OPPORTUNITY_READ });
  const data = ensureArray(await baseListOpportunities(), "liet ke co hoi");
  return enforceCustomerLinkedScope(data, identity, "opportunity");
}

export async function getCustomerOpportunities(customerId, identity) {
  assertIdentityScopes({ identity, requiredScopes: OPPORTUNITY_READ });
  const data = ensureArray(
    await baseGetCustomerOpportunities(customerId),
    "loc co hoi khach hang"
  );
  return enforceCustomerLinkedScope(data, identity, "opportunity");
}

export async function listInteractions(identity) {
  assertIdentityScopes({ identity, requiredScopes: INTERACTION_READ });
  const data = ensureArray(await baseListInteractions(), "liet ke tuong tac");
  return enforceCustomerLinkedScope(data, identity, "interaction");
}

export async function getCustomerInteractions(customerId, identity) {
  assertIdentityScopes({ identity, requiredScopes: INTERACTION_READ });
  const data = ensureArray(
    await baseGetCustomerInteractions(customerId),
    "loc tuong tac khach hang"
  );
  return enforceCustomerLinkedScope(data, identity, "interaction");
}

export async function listCampaigns(identity) {
  assertIdentityScopes({ identity, requiredScopes: CAMPAIGN_READ });
  const data = ensureArray(await baseListCampaigns(), "liet ke chien dich");
  const scope = await getCustomerScope(identity);
  return enforceScope(data, scope.plan, "campaign", scope);
}

export { draftEmailForCustomer, draftCallScript, formatVnd };
