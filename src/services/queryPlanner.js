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

export function enforceScope(items, plan, entityType) {
  if (Object.keys(plan.filters).length === 0) return items;

  return items.filter((item) => {
    if (entityType === "customer") {
      // Allow if location matches branchId OR item has no location (global)
      // For MVP, just match location with branchId.
      const matchBranch = plan.filters.location && plan.filters.location !== "default"
        ? item.location === plan.filters.location
        : true;

      const matchRm = plan.filters.rmId && plan.filters.rmId !== "default" && item.rmId
        ? item.rmId === plan.filters.rmId
        : true;

      // Assuming match if either is true, or if branch matches.
      return matchBranch && matchRm;
    }
    // For other entities, assume they belong to scoped customers, or no scope for MVP
    return true;
  });
}
