const DEFAULT_CONTEXT = Object.freeze({
  currentModule: "general",
  focusedCustomers: Object.freeze([]),
  lastIntent: null
});

function readPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function actorKey(identity = {}) {
  const actorId = identity.userId ?? identity.actorId ?? identity.rmId ?? "anonymous";
  return JSON.stringify([
    String(actorId),
    String(identity.rmId ?? ""),
    String(identity.branchId ?? ""),
    String(identity.role ?? "")
  ]);
}

function conversationKey({ conversationId, identity }) {
  if (typeof conversationId !== "string" || conversationId.trim() === "") {
    throw new TypeError("conversationId must be a non-empty string");
  }
  return `${actorKey(identity)}:${JSON.stringify(conversationId.trim())}`;
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function immutableSnapshot(value) {
  return deepFreeze(structuredClone(value));
}

function normalizeContext(context, maxFocusedCustomers) {
  const input = context && typeof context === "object" ? structuredClone(context) : {};
  const focusedCustomers = Array.isArray(input.focusedCustomers)
    ? [...new Set(input.focusedCustomers.filter((id) => id !== null && id !== undefined))].slice(
        0,
        maxFocusedCustomers
      )
    : [];

  return {
    ...input,
    currentModule:
      typeof input.currentModule === "string" && input.currentModule.trim()
        ? input.currentModule
        : DEFAULT_CONTEXT.currentModule,
    focusedCustomers,
    lastIntent:
      typeof input.lastIntent === "string" || input.lastIntent === null
        ? input.lastIntent
        : DEFAULT_CONTEXT.lastIntent
  };
}

export function createContextManager(options = {}) {
  const ttlMs = readPositiveInteger(options.ttlMs, 30 * 60 * 1000);
  const maxConversations = readPositiveInteger(options.maxConversations, 1000);
  const maxFocusedCustomers = readPositiveInteger(options.maxFocusedCustomers, 50);
  const now = typeof options.now === "function" ? options.now : Date.now;
  const store = new Map();

  function cleanupExpired(timestamp = now()) {
    for (const [key, record] of store) {
      if (record.expiresAt <= timestamp) store.delete(key);
    }
  }

  function touch(key, context, timestamp) {
    store.delete(key);
    store.set(key, { context, expiresAt: timestamp + ttlMs });

    while (store.size > maxConversations) {
      const oldestKey = store.keys().next().value;
      store.delete(oldestKey);
    }
  }

  function getConversationContext({ conversationId, identity } = {}) {
    const key = conversationKey({ conversationId, identity });
    const timestamp = now();
    cleanupExpired(timestamp);
    const existing = store.get(key);
    const context = existing?.context ?? normalizeContext(DEFAULT_CONTEXT, maxFocusedCustomers);
    touch(key, context, timestamp);
    return immutableSnapshot(context);
  }

  function saveConversationContext({ conversationId, identity, context } = {}) {
    const key = conversationKey({ conversationId, identity });
    const timestamp = now();
    cleanupExpired(timestamp);
    const normalized = normalizeContext(context, maxFocusedCustomers);
    touch(key, normalized, timestamp);
    return immutableSnapshot(normalized);
  }

  function deleteConversationContext({ conversationId, identity } = {}) {
    cleanupExpired();
    return store.delete(conversationKey({ conversationId, identity }));
  }

  return Object.freeze({
    getConversationContext,
    saveConversationContext,
    deleteConversationContext
  });
}

const defaultManager = createContextManager({
  ttlMs: readPositiveInteger(process.env.CONTEXT_TTL_MS, 30 * 60 * 1000),
  maxConversations: readPositiveInteger(process.env.CONTEXT_MAX_CONVERSATIONS, 1000),
  maxFocusedCustomers: readPositiveInteger(process.env.CONTEXT_MAX_FOCUSED_CUSTOMERS, 50)
});

export const getConversationContext = defaultManager.getConversationContext;
export const saveConversationContext = defaultManager.saveConversationContext;
export const deleteConversationContext = defaultManager.deleteConversationContext;
