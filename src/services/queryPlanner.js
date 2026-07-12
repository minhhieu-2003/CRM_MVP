export function planQueryContext(identity) {
  if (!identity || identity.role === "admin") {
    return { filters: {} };
  }

  return {
    filters: {
      location: identity.branchId,
      rmId: identity.rmId
    }
  };
}

function hasFilter(plan, key) {
  const value = plan.filters[key];
  return Boolean(value && value !== "default");
}

export function enforceScope(items, plan, entityType, scope = {}) {
  if (Object.keys(plan.filters).length === 0) return items;

  if (entityType === "customer") {
    return items.filter((item) => {
      const matchBranch = !hasFilter(plan, "location") || item.location === plan.filters.location;
      const matchRm =
        !hasFilter(plan, "rmId") || !item.rmId || item.rmId === plan.filters.rmId;
      return matchBranch && matchRm;
    });
  }

  if (entityType === "opportunity" || entityType === "interaction") {
    const customerIds = scope.customerIds ?? new Set();
    return items.filter((item) => customerIds.has(item.customerId));
  }

  if (entityType === "campaign") {
    const customerSegments = scope.customerSegments ?? new Set();
    return items.filter((item) => {
      const matchBranch =
        !hasFilter(plan, "location") ||
        (!item.branchId && !item.location) ||
        item.branchId === plan.filters.location ||
        item.location === plan.filters.location;
      const matchSegment = !item.targetSegment || customerSegments.has(item.targetSegment);
      return matchBranch && matchSegment;
    });
  }

  return [];
}
