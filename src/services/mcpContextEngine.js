import {
  draftCallScript,
  draftEmailForCustomer,
  formatVnd,
  getCustomerById,
  getCustomerByName,
  getCustomerInteractions,
  getCustomerOpportunities,
  getMaturityCustomers,
  listCustomers,
  listOpportunities,
  listCampaigns
} from "./crmRepository.js";
import { normalizeVietnamese } from "./textUtils.js";
import {
  compareAndSwapConversationContext,
  getConversationContext,
  getConversationContextSnapshot
} from "./contextManager.js";
import {
  TOOL_POLICY_SOURCE,
  TOOL_SCOPE_DENIED,
  ToolPolicyDeniedError,
  assertIdentityScopes
} from "./toolPolicy.js";

const CUSTOMER_READ = Object.freeze(["customer:read"]);
const CAMPAIGN_READ = Object.freeze(["campaign:read"]);
const CUSTOMER_OPPORTUNITY_READ = Object.freeze(["customer:read", "opportunity:read"]);
const PRODUCT_SUMMARY_READ = Object.freeze(["opportunity:read", "campaign:read"]);
const CUSTOMER_INSIGHT_READ = Object.freeze([
  "customer:read",
  "opportunity:read",
  "interaction:read"
]);
const COMMUNICATION_DRAFT = Object.freeze(["customer:read", "communication:draft"]);

async function detectCustomerName(message, identity) {
  const normalized = normalizeVietnamese(message);
  if (getContinuationPageSize(normalized)) return null;

  const customers = await listCustomers(identity);
  const mentionedCustomer = customers.find((customer) =>
    normalized.includes(customer.normalizedName)
  );
  if (mentionedCustomer) return mentionedCustomer.name;

  if (
    hasAny(normalized, ["bao nhieu", "liet ke", "danh sach", "hom nay", "tiep khach", "cham soc", "nhom"])
  ) {
    return null;
  }

  const match = normalized.match(/(?:khach|khach hang|cho)\s+([a-z\s]+)/i);
  if (!match) return null;
  return match[1].trim();
}

function sourceTrace(entries) {
  return entries.map((endpoint) => ({ endpoint }));
}

function policyDeniedResult(context) {
  return {
    reply: "Em không có quyền truy cập dữ liệu cần thiết cho yêu cầu này.",
    sources: sourceTrace([TOOL_POLICY_SOURCE]),
    context,
    errorCode: TOOL_SCOPE_DENIED
  };
}

function contextConflictResult({ conversationId, identity }) {
  return {
    reply: "Ngữ cảnh hội thoại vừa thay đổi ở một yêu cầu khác. Anh/chị vui lòng thử lại.",
    sources: sourceTrace(["internal://context-conflict"]),
    context: getConversationContext({ conversationId, identity }),
    errorCode: "CONTEXT_VERSION_CONFLICT"
  };
}

function hasAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Parse a quantity constraint like "3 người đầu tiên", "5 khách", "2 mục"
 * from a normalized (no-diacritics) string.
 * Returns null if no constraint is found.
 */
function parseQuantityLimit(normalized) {
  // Patterns: "3 nguoi", "3 khach", "3 nguoi dau tien", "cho 3", "3 email"
  const match = normalized.match(
    /(?:cho\s*)?(\d{1,2})\s*(?:nguoi(?:\s+dau\s+tien)?|khach(?:\s+hang)?|email|muc|ban|cai)?/
  );
  if (!match) return null;
  const n = Number.parseInt(match[1], 10);
  return Number.isInteger(n) && n > 0 && n <= 50 ? n : null;
}

function getContinuationPageSize(normalized, fallback = 15) {
  const compact = normalized.replace(/\s+/g, " ").trim();
  if (/(^|\s)tiep khach(?:\s|$)/.test(compact)) return null;

  const beforeKeyword = compact.match(
    /(?:^|\s)(\d{1,2})\s*(?:khach(?: hang)?|dong|muc)?\s*(?:tiep|tiep theo|ke tiep|nua)(?:\s|$)/
  );
  const afterKeyword = compact.match(
    /^(?:xem tiep|tiep theo|ke tiep|tiep|them)\s*(\d{1,2})?\s*(?:khach(?: hang)?|dong|muc)?$/
  );
  const directKeyword = /^(?:khach(?: hang)?\s+)?(?:tiep|tiep theo|ke tiep|xem tiep)$/.test(
    compact
  );

  if (beforeKeyword) return Math.min(parsePositiveInteger(beforeKeyword[1], fallback), 50);
  if (afterKeyword || directKeyword) {
    return Math.min(parsePositiveInteger(afterKeyword?.[1], fallback), 50);
  }

  return null;
}

function setCustomerListView(state, view) {
  state.listView = {
    ...view,
    pageSize: view.pageSize ?? 15,
    nextOffset: view.nextOffset ?? 0,
    totalCount: view.totalCount ?? 0
  };
}

function uniqueNames(items) {
  const seen = new Set();
  const names = [];

  for (const item of items) {
    const name = typeof item === "string" ? item : item?.product || item?.name;
    if (!name) continue;

    const key = normalizeVietnamese(name);
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }

  return names;
}

function parseVndThreshold(normalized) {
  const match = normalized.match(
    /(?:lon hon|tren|hon|>=|>)\s*(\d+(?:[.,]\d+)?)\s*(ti|ty|ti dong|ty dong|b|trieu|m)?/
  );
  if (!match) return null;

  const value = Number.parseFloat(match[1].replace(",", "."));
  if (!Number.isFinite(value)) return null;

  const unit = match[2] ?? "";
  if (["ti", "ty", "ti dong", "ty dong", "b"].includes(unit)) return value * 1_000_000_000;
  if (["trieu", "m"].includes(unit)) return value * 1_000_000;

  return value < 1000 ? value * 1_000_000_000 : value;
}

async function resolveCustomerListViewItems(listView, identity) {
  if (!listView || typeof listView !== "object") return null;

  if (listView.type === "maturity-reminder" || listView.type === "today-care-list") {
    return await getMaturityCustomers(parsePositiveInteger(listView.daysAhead, 7), identity);
  }

  if (listView.type === "savings-threshold-summary") {
    const threshold = Number(listView.threshold);
    if (!Number.isFinite(threshold)) return null;
    const customers = await listCustomers(identity);
    return customers
      .filter((customer) => customer.savingsAmountVnd > threshold)
      .sort((a, b) => b.savingsAmountVnd - a.savingsAmountVnd);
  }

  return null;
}

function renderCustomerListPage({ items, offset, pageSize, state, listView }) {
  const safeOffset = Math.max(0, Math.min(offset, items.length));
  const endOffset = Math.min(safeOffset + pageSize, items.length);
  const displayedCustomers = items.slice(safeOffset, endOffset);

  state.currentModule = "customer-profile";
  state.focusedCustomers = displayedCustomers.map((item) => item.id);
  state.lastIntent = listView.type;
  setCustomerListView(state, {
    ...listView,
    pageSize,
    nextOffset: endOffset,
    totalCount: items.length
  });

  if (displayedCustomers.length === 0) {
    return "Em đã hiển thị hết danh sách khách hàng đang lọc.";
  }

  const lines = displayedCustomers.map(
    (item, index) =>
      `${safeOffset + index + 1}. ${item.name} - ${item.savingsProduct} - ${formatVnd(
        item.savingsAmountVnd
      )} - đến hạn ${item.maturityDate}`
  );
  const rangeText = `${safeOffset + 1}-${endOffset}/${items.length}`;
  const nextHint =
    endOffset < items.length
      ? `\n\nAnh/chị có thể nhắn "${pageSize} khách tiếp" để xem tiếp.`
      : "\n\nEm đã hiển thị hết danh sách này.";

  return `Em hiển thị tiếp ${displayedCustomers.length} khách hàng (${rangeText}):\n${lines.join(
    "\n"
  )}${nextHint}`;
}

function renewalSuggestion(customer) {
  if (customer.segment === "VIP") {
    return "Em đề xuất tư vấn Private Banking và phân bổ một phần sang quỹ trái phiếu để tối ưu danh mục.";
  }
  if (customer.segment === "Affluent") {
    return "Em đề xuất thêm gói bảo hiểm liên kết vay mua nhà để tối ưu bảo vệ tài chính.";
  }
  if (customer.segment === "SME Owner") {
    return "Em đề xuất gói quản lý dòng tiền SME và khoản vay vốn lưu động nếu khách có nhu cầu mùa cao điểm.";
  }
  return "Em đề xuất tái tục tự động kỳ hạn linh hoạt để tối ưu dòng tiền.";
}

async function resolveTargetCustomers({ askedName, state, fallbackDue, identity }) {
  if (askedName) {
    const customer = await getCustomerByName(askedName, identity);
    if (customer) {
      state.focusedCustomers = [customer.id];
      return [customer];
    }
    return { notFound: true, name: askedName };
  }
  if (state.focusedCustomers.length > 0) {
    const candidates = await Promise.all(state.focusedCustomers.map((id) => getCustomerById(id, identity)));
    const valid = candidates.filter(Boolean);
    if (valid.length > 0) return valid;
  }
  if (fallbackDue) {
    return await getMaturityCustomers(7, identity);
  }
  return [];
}

export async function routeConversation(payload) {
  const contextSnapshot = getConversationContextSnapshot({
    conversationId: payload.conversationId,
    identity: payload.identity
  });
  let result;
  try {
    result = await processConversation({ ...payload, initialContext: contextSnapshot.context });
  } catch (error) {
    if (error instanceof ToolPolicyDeniedError || error?.code === TOOL_SCOPE_DENIED) {
      return policyDeniedResult(contextSnapshot.context);
    }
    throw error;
  }

  if (result.sources) {
    const uniqueSources = new Map();
    for (const source of result.sources) {
      if (!uniqueSources.has(source.endpoint)) {
        uniqueSources.set(source.endpoint, source);
      }
    }
    result.sources = Array.from(uniqueSources.values());
  }

  if (result.context) {
    try {
      result.context = compareAndSwapConversationContext({
        conversationId: payload.conversationId,
        identity: payload.identity,
        context: result.context,
        expectedVersion: contextSnapshot.version
      });
    } catch (error) {
      if (error?.code === "CONTEXT_VERSION_CONFLICT") {
        return contextConflictResult(payload);
      }
      throw error;
    }
  }

  return result;
}

async function processConversation({ message, identity, initialContext }) {
  const state = structuredClone(initialContext);
  const normalized = normalizeVietnamese(message);
  const compact = normalized.replace(/\s+/g, " ").trim();
  const continuationPageSize = getContinuationPageSize(normalized);

  // ── FIX 3: Multi-turn context intent ─────────────────────────────────────
  // Detect follow-up questions that reference the current focused customer list
  const hasActiveContext = state.focusedCustomers.length > 0;
  const isContextFollowUpIntent =
    hasActiveContext &&
    !continuationPageSize &&
    (hasAny(normalized, ["trong so do", "trong do", "nhung khach do", "nhung nguoi do", "danh sach do"]) ||
      (hasAny(normalized, ["ai", "nguoi nao", "khach nao"]) &&
        hasAny(normalized, ["cao nhat", "lon nhat", "nhieu nhat", "nho nhat", "it nhat", "gan nhat", "den han nhat"])) ||
      (hasAny(normalized, ["so sanh", "phan tich", "tong hop"]) &&
        !hasAny(normalized, ["vip", "thuong", "pho thong"])));

  const isReminderIntent =
    compact === "1" ||
    // FIX 4: No-diacritics – "khach hang co tiet kiem den han" without "nhac"
    (normalized.includes("tiet kiem") &&
      normalized.includes("den han") &&
      hasAny(normalized, ["nhac", "danh sach", "liet ke", "cho em xem", "xem", "co", "bao nhieu", "nguoi nao", "khach nao"])) ||
    (normalized.includes("nhac") &&
      normalized.includes("tiet kiem") &&
      normalized.includes("den han"));

  // ── FIX 2: Urgency intent ────────────────────────────────────────────────
  const isUrgencyIntent =
    !continuationPageSize &&
    (hasAny(normalized, ["can lien he gap", "lien he gap", "khan cap", "khan", "gap", "uu tien cao", "uu tien nhat"]) &&
      hasAny(normalized, ["khach", "ai", "nguoi nao", "khach hang", "nao"])) ||
    (hasAny(normalized, ["can cham soc gap", "can uu tien", "can tiep gap", "phai tiep"])) ||
    (compact.includes("uu tien") && hasAny(normalized, ["khach", "danh sach", "ai"]));

  const isEmailIntent =
    compact === "2" ||
    (hasAny(normalized, ["soan", "viet", "draft"]) &&
      hasAny(normalized, ["email", "mail", "khach hang", "khac hang", "nhom", "tiep", "follow up", "cham soc"])) ||
    normalized.includes("soan tiep");

  const isOpportunityIntent =
    compact === "3" ||
    normalized.includes("co hoi") ||
    normalized.includes("opportunity") ||
    normalized.includes("goi y");

  const isCampaignIntent =
    compact === "4" || normalized.includes("chien dich") || normalized.includes("campaign");

  const isTodayCareIntent =
    hasAny(normalized, ["hom nay", "ngay nay"]) &&
    hasAny(normalized, ["khach", "tiep", "cham soc", "gap", "goi"]) &&
    hasAny(normalized, ["bao nhieu", "liet ke", "danh sach", "can"]);

  const isProductSummaryIntent =
    normalized.includes("san pham") &&
    hasAny(normalized, ["bao nhieu", "liet ke", "danh sach", "tiep can", "khach hang", "khac hang"]);

  const savingsThreshold = parseVndThreshold(normalized);
  const isSavingsThresholdIntent =
    savingsThreshold !== null &&
    hasAny(normalized, ["tiet kiem", "khoan tiet kiem", "so du"]) &&
    hasAny(normalized, ["bao nhieu", "nguoi", "khach", "liet ke", "danh sach"]);

  if (continuationPageSize && state.listView) {
    assertIdentityScopes({ identity, requiredScopes: CUSTOMER_READ });
    const items = await resolveCustomerListViewItems(state.listView, identity);
    if (items) {
      return {
        reply: renderCustomerListPage({
          items,
          offset: parsePositiveInteger(state.listView.nextOffset, 0),
          pageSize: continuationPageSize,
          state,
          listView: state.listView
        }),
        sources: sourceTrace(["GET /customers"]),
        context: state
      };
    }
  }

  const isCallScriptIntent =
    normalized.includes("call script") || normalized.includes("kich ban goi");
  if (isEmailIntent || isCallScriptIntent) {
    assertIdentityScopes({ identity, requiredScopes: COMMUNICATION_DRAFT });
  } else if (isOpportunityIntent) {
    assertIdentityScopes({ identity, requiredScopes: CUSTOMER_OPPORTUNITY_READ });
  }

  const skipNameDetection =
    isTodayCareIntent ||
    isSavingsThresholdIntent ||
    isProductSummaryIntent ||
    isReminderIntent ||
    isCampaignIntent ||
    isUrgencyIntent ||
    isContextFollowUpIntent;
  const askedName = skipNameDetection ? null : await detectCustomerName(message, identity);

  if (isContextFollowUpIntent) {
    assertIdentityScopes({ identity, requiredScopes: CUSTOMER_READ });
    const customers = await Promise.all(
      state.focusedCustomers.map((id) => getCustomerById(id, identity))
    );
    const valid = customers.filter(Boolean);

    if (valid.length === 0) {
      return {
        reply: "Em không tìm thấy danh sách khách hàng đang focus. Anh/chị vui lòng hỏi lại từ đầu.",
        sources: sourceTrace(["internal://clarification"]),
        context: state
      };
    }

    const wantHighest = hasAny(normalized, ["cao nhat", "lon nhat", "nhieu nhat"]);
    const wantLowest  = hasAny(normalized, ["nho nhat", "it nhat", "thap nhat"]);
    const wantSoonest = hasAny(normalized, ["den han nhat", "gan nhat", "sap den han"]);
    const wantCompare = hasAny(normalized, ["so sanh", "phan tich", "tong hop"]);

    state.lastIntent = "context-followup";

    if (wantHighest && hasAny(normalized, ["so du", "tien", "tiet kiem", "cao nhat"])) {
      const sorted = [...valid].sort((a, b) => (b.savingsAmountVnd ?? 0) - (a.savingsAmountVnd ?? 0));
      const top = sorted[0];
      return {
        reply: `Trong danh sách đang focus, khách hàng có số dư cao nhất là **${top.name}** với ${formatVnd(top.savingsAmountVnd)} (${top.savingsProduct}, đến hạn ${top.maturityDate}).`,
        sources: sourceTrace(["GET /customers"]),
        context: state
      };
    }

    if (wantLowest) {
      const sorted = [...valid].sort((a, b) => (a.savingsAmountVnd ?? 0) - (b.savingsAmountVnd ?? 0));
      const bottom = sorted[0];
      return {
        reply: `Trong danh sách đang focus, khách hàng có số dư thấp nhất là **${bottom.name}** với ${formatVnd(bottom.savingsAmountVnd)} (${bottom.savingsProduct}, đến hạn ${bottom.maturityDate}).`,
        sources: sourceTrace(["GET /customers"]),
        context: state
      };
    }

    if (wantSoonest) {
      const sorted = [...valid].sort((a, b) => new Date(a.maturityDate) - new Date(b.maturityDate));
      const first = sorted[0];
      return {
        reply: `Trong danh sách đang focus, khách hàng đến hạn sớm nhất là **${first.name}** vào ngày ${first.maturityDate} (${formatVnd(first.savingsAmountVnd)}).`,
        sources: sourceTrace(["GET /customers"]),
        context: state
      };
    }

    if (wantCompare) {
      const totalVnd = valid.reduce((sum, c) => sum + (c.savingsAmountVnd ?? 0), 0);
      const avgVnd   = totalVnd / valid.length;
      const sorted   = [...valid].sort((a, b) => (b.savingsAmountVnd ?? 0) - (a.savingsAmountVnd ?? 0));
      const lines    = sorted.map((c, i) =>
        `${i + 1}. ${c.name}: ${formatVnd(c.savingsAmountVnd)} (${c.segment}, đến hạn ${c.maturityDate})`
      );
      return {
        reply: `Tổng hợp ${valid.length} khách hàng đang focus:\n${lines.join("\n")}\n\n**Tổng số dư:** ${formatVnd(totalVnd)}\n**Trung bình:** ${formatVnd(avgVnd)}`,
        sources: sourceTrace(["GET /customers"]),
        context: state
      };
    }

    const lines = valid.map((c, i) =>
      `${i + 1}. ${c.name}: ${formatVnd(c.savingsAmountVnd)} (${c.segment})`
    );
    return {
      reply: `Danh sách ${valid.length} khách hàng đang focus:\n${lines.join("\n")}`,
      sources: sourceTrace(["GET /customers"]),
      context: state
    };
  }

  if (isUrgencyIntent) {
    assertIdentityScopes({ identity, requiredScopes: CUSTOMER_READ });
    const allDue = await getMaturityCustomers(7, identity);
    const urgent = allDue.filter((c) => {
      if (!c.maturityDate) return false;
      const daysLeft = Math.ceil((new Date(c.maturityDate) - new Date()) / 86400000);
      return daysLeft <= 3;
    });
    const toShow = urgent.length > 0 ? urgent : allDue.slice(0, 5);
    const urgencyLabel = urgent.length > 0
      ? `${toShow.length} khách hàng cần liên hệ **khẩn cấp** (đến hạn trong ≤ 3 ngày)`
      : `${toShow.length} khách hàng cần ưu tiên liên hệ (đến hạn sớm nhất)`;

    state.currentModule = "customer-profile";
    state.focusedCustomers = toShow.map((c) => c.id);
    state.lastIntent = "urgency-list";
    setCustomerListView(state, {
      type: "maturity-reminder",
      daysAhead: 3,
      pageSize: toShow.length,
      nextOffset: toShow.length,
      totalCount: toShow.length
    });

    const lines = toShow.map((c, i) =>
      `${i + 1}. **${c.name}** — ${c.savingsProduct} — ${formatVnd(c.savingsAmountVnd)} — đến hạn ${c.maturityDate}`
    );
    return {
      reply: `Em tổng hợp ${urgencyLabel}:\n${lines.join("\n")}\n\nAnh/chị có muốn em soạn email hoặc kịch bản gọi cho danh sách này không?`,
      sources: sourceTrace(["GET /customers"]),
      context: state
    };
  }

  if (isTodayCareIntent) {
    assertIdentityScopes({ identity, requiredScopes: CUSTOMER_READ });
    const dueCustomers = await getMaturityCustomers(7, identity);
    const maxItems = 15;
    const displayedCustomers = dueCustomers.slice(0, maxItems);

    state.currentModule = "customer-profile";
    state.focusedCustomers = displayedCustomers.map((item) => item.id);
    state.lastIntent = "today-care-list";
    setCustomerListView(state, {
      type: "today-care-list",
      daysAhead: 7,
      pageSize: maxItems,
      nextOffset: displayedCustomers.length,
      totalCount: dueCustomers.length
    });

    const lines = displayedCustomers.map(
      (item, index) =>
        `${index + 1}. ${item.name} - ${item.savingsProduct} - ${formatVnd(item.savingsAmountVnd)} - đến hạn ${item.maturityDate}`
    );

    let summaryText;
    if (dueCustomers.length > 0) {
      const displayNote = dueCustomers.length > maxItems ? ` (hiển thị ${maxItems} khách hàng ưu tiên nhất)` : "";
      summaryText = `Hôm nay em đề xuất RM ưu tiên tiếp/chăm sóc ${dueCustomers.length} khách hàng có tiết kiệm sắp đến hạn trong 7 ngày tới${displayNote}:\n${lines.join("\n")}\n\nAnh/chị có thể nhắn "soạn email cho nhóm này" hoặc "kịch bản gọi" để em chuẩn bị nội dung chăm sóc.`;
    } else {
      summaryText = "Hôm nay chưa có khách hàng nào cần ưu tiên tiếp/chăm sóc theo dữ liệu CRM sandbox.";
    }

    return {
      reply: summaryText,
      sources: sourceTrace(["GET /customers"]),
      context: state
    };
  }

  if (isSavingsThresholdIntent) {
    assertIdentityScopes({ identity, requiredScopes: CUSTOMER_READ });
    const customers = await listCustomers(identity);
    const matchedCustomers = customers
      .filter((customer) => customer.savingsAmountVnd > savingsThreshold)
      .sort((a, b) => b.savingsAmountVnd - a.savingsAmountVnd);
    const maxItems = 15;
    const displayedCustomers = matchedCustomers.slice(0, maxItems);

    state.currentModule = "customer-profile";
    state.focusedCustomers = displayedCustomers.map((item) => item.id);
    state.lastIntent = "savings-threshold-summary";
    setCustomerListView(state, {
      type: "savings-threshold-summary",
      threshold: savingsThreshold,
      pageSize: maxItems,
      nextOffset: displayedCustomers.length,
      totalCount: matchedCustomers.length
    });

    const lines = displayedCustomers.map(
      (item, index) =>
        `${index + 1}. ${item.name} - ${item.savingsProduct} - ${formatVnd(item.savingsAmountVnd)} - đến hạn ${item.maturityDate}`
    );
    const displayNote =
      matchedCustomers.length > maxItems ? ` (hiển thị ${maxItems} khách hàng có số dư cao nhất)` : "";
    const listText =
      displayedCustomers.length > 0
        ? `:\n${lines.join("\n")}`
        : ".";

    return {
      reply: `Có ${matchedCustomers.length} khách hàng có khoản tiết kiệm lớn hơn ${formatVnd(
        savingsThreshold
      )}${displayNote}${listText}\n\nAnh/chị có thể nhắn "soạn mail" để em soạn email chăm sóc cho nhóm khách hàng này.`,
      sources: sourceTrace(["GET /customers"]),
      context: state
    };
  }

  if (isProductSummaryIntent) {
    assertIdentityScopes({ identity, requiredScopes: PRODUCT_SUMMARY_READ });
    const opportunities = await listOpportunities(identity);
    const activeCampaigns = (await listCampaigns(identity)).filter((item) => item.status === "Active");
    const productNames = uniqueNames(opportunities);
    const maxItems = 15;
    const displayedProducts = productNames.slice(0, maxItems);

    state.currentModule = "opportunity";
    state.lastIntent = "product-summary";

    const productLines = displayedProducts.map((name, index) => `${index + 1}. ${name}`);
    const campaignLines = activeCampaigns.map(
      (item, index) => `${index + 1}. ${item.name} (${item.targetSegment})`
    );
    const productNote =
      productNames.length > maxItems ? ` (hiển thị ${maxItems} sản phẩm ưu tiên đầu tiên)` : "";

    return {
      reply: `Hiện CRM sandbox có ${productNames.length} sản phẩm/cơ hội tiếp cận khách hàng${productNote}:\n${productLines.join(
        "\n"
      )}\n\nNgoài ra có ${activeCampaigns.length} chiến dịch đang chạy:\n${campaignLines.join(
        "\n"
      )}\n\nAnh/chị có thể hỏi "gợi ý cơ hội cho khách hàng Nguyễn Văn An" để em lọc sản phẩm phù hợp cho từng khách hàng.`,
      sources: sourceTrace(["GET /opportunities", "GET /campaigns"]),
      context: state
    };
  }

  if (isReminderIntent) {
    assertIdentityScopes({ identity, requiredScopes: CUSTOMER_READ });
    const dueCustomers = await getMaturityCustomers(7, identity);
    const maxItems = 15;
    const displayedCustomers = dueCustomers.slice(0, maxItems);

    state.currentModule = "customer-profile";
    state.focusedCustomers = displayedCustomers.map((item) => item.id);
    state.lastIntent = "maturity-reminder";
    setCustomerListView(state, {
      type: "maturity-reminder",
      daysAhead: 7,
      pageSize: maxItems,
      nextOffset: displayedCustomers.length,
      totalCount: dueCustomers.length
    });

    const lines = displayedCustomers.map(
      (item, index) =>
        `${index + 1}. ${item.name} - ${item.savingsProduct} - ${formatVnd(item.savingsAmountVnd)} - đến hạn ${item.maturityDate}`
    );

    let summaryText;
    if (dueCustomers.length > 0) {
      const displayNote = dueCustomers.length > maxItems ? ` (hiển thị ${maxItems} khách hàng)` : "";
      summaryText = `Em đã lọc ${dueCustomers.length} khách hàng có tiết kiệm đến hạn trong 7 ngày tới${displayNote}:\n${lines.join("\n")}\n\nAnh/chị có muốn em soạn email nhắc hạn cho danh sách này không?`;
    } else {
      summaryText = "Hiện không có khách hàng nào đến hạn tiết kiệm trong 7 ngày tới.";
    }

    return {
      reply: summaryText,
      sources: sourceTrace(["GET /customers"]),
      context: state
    };
  }

  if (isEmailIntent) {
    assertIdentityScopes({ identity, requiredScopes: COMMUNICATION_DRAFT });
    const targets = await resolveTargetCustomers({ askedName, state, fallbackDue: true, identity });

    if (targets.notFound) {
      return {
        reply: `Em không tìm thấy khách hàng "${targets.name}" trong CRM sandbox.`,
        sources: sourceTrace(["GET /customers"]),
        context: state
      };
    }

    state.currentModule = "interaction";
    state.lastIntent = "email-draft";

    if (targets.length === 0) {
      return {
        reply:
          "Em chưa có danh sách khách hàng mục tiêu. Anh/chị hãy yêu cầu nhắc đến hạn hoặc chỉ định tên khách hàng cụ thể.",
        sources: sourceTrace(["internal://clarification"]),
        context: state
      };
    }

    // FIX 1: Parse quantity constraint e.g. "soạn email cho 3 người đầu tiên" → limit = 3
    const quantityLimit = parseQuantityLimit(normalized);
    const hardCap = 5;
    const effectiveLimit = quantityLimit ? Math.min(quantityLimit, hardCap) : hardCap;
    const maxTargets = targets.slice(0, effectiveLimit);

    const drafts = await Promise.all(
      maxTargets.map((customer) => draftEmailForCustomer(customer, renewalSuggestion(customer)))
    );

    let reply = drafts
      .map((item, index) => `Email ${index + 1}\nTiêu đề: ${item.subject}\nNội dung:\n${item.body}`)
      .join("\n\n---\n\n");

    if (quantityLimit && targets.length > quantityLimit) {
      reply = `Em đã soạn ${effectiveLimit} email theo yêu cầu (tổng có ${targets.length} khách hàng).\n\n` + reply;
    } else if (targets.length > hardCap) {
      reply = `Đã giới hạn tạo ${hardCap} email cho các khách hàng đầu tiên.\n\n` + reply;
    }

    return {
      reply,
      sources: sourceTrace(["GET /customers", "POST /draft-email"]),
      context: state
    };
  }

  if (isCallScriptIntent) {
    assertIdentityScopes({ identity, requiredScopes: COMMUNICATION_DRAFT });
    const targets = await resolveTargetCustomers({ askedName, state, fallbackDue: false, identity });

    if (targets.notFound) {
      return {
        reply: `Em không tìm thấy khách hàng "${targets.name}" trong CRM sandbox.`,
        sources: sourceTrace(["GET /customers"]),
        context: state
      };
    }

    const targetCustomer = targets[0] || null;

    if (!targetCustomer) {
      return {
        reply:
          "Em chưa xác định được khách hàng. Anh/chị vui lòng yêu cầu theo tên khách hàng trước.",
        sources: sourceTrace(["internal://clarification"]),
        context: state
      };
    }

    state.currentModule = "interaction";
    state.lastIntent = "call-script";

    return {
      reply: await draftCallScript(
        targetCustomer,
        "Ngoài ra, em có thể gửi đề xuất bảo hiểm/lãi suất ưu đãi ngay sau cuộc gọi."
      ),
      sources: sourceTrace(["GET /customers", "POST /call-script"]),
      context: state
    };
  }

  if (isOpportunityIntent) {
    assertIdentityScopes({ identity, requiredScopes: CUSTOMER_OPPORTUNITY_READ });
    state.currentModule = "opportunity";
    state.lastIntent = "suggest_opportunity";

    const targets = await resolveTargetCustomers({ askedName, state, fallbackDue: false, identity });

    if (targets.notFound) {
      return {
        reply: `Em không tìm thấy khách hàng "${targets.name}" trong CRM sandbox.`,
        sources: sourceTrace(["GET /customers"]),
        context: state
      };
    }

    const targetCustomer = targets[0] || null;

    if (targetCustomer) {
      state.focusedCustomers = [targetCustomer.id];
      const opps = await getCustomerOpportunities(targetCustomer.id, identity);
      const list = opps
        .map((o) => {
          const name = o.product || o.name || "";
          const val =
            o.estimatedValueVnd !== undefined
              ? formatVnd(o.estimatedValueVnd)
              : o.valueVnd
                ? `${o.valueVnd.toLocaleString("vi-VN")}đ`
                : "";
          return `- ${name}: ${val} (Độ ấm: ${o.stage})`;
        })
        .join("\n");
      return {
        reply: `Cơ hội kinh doanh cho khách hàng:\n${list || "Chưa ghi nhận cơ hội mới."}`,
        sources: sourceTrace(
          askedName ? ["GET /customers", "GET /opportunities"] : ["GET /opportunities"]
        ),
        context: state
      };
    } else {
      return {
        reply:
          "RM muốn gợi ý cơ hội cho khách hàng nào? Vui lòng cung cấp tên khách hàng để em tra cứu.",
        sources: sourceTrace(["internal://clarification"]),
        context: state
      };
    }
  }

  if (isCampaignIntent) {
    assertIdentityScopes({ identity, requiredScopes: CAMPAIGN_READ });
    if (state.focusedCustomers.length > 0) {
      assertIdentityScopes({ identity, requiredScopes: CUSTOMER_READ });
    }
    const activeCampaigns = (await listCampaigns(identity)).filter(
      (item) => item.status === "Active"
    );
    const focusedCustomers = (
      await Promise.all(state.focusedCustomers.map((id) => getCustomerById(id, identity)))
    ).filter(Boolean);
    const focusedSegments = new Set(focusedCustomers.map((customer) => customer.segment));
    const relevantCampaigns =
      focusedSegments.size > 0
        ? activeCampaigns.filter((campaign) => focusedSegments.has(campaign.targetSegment))
        : activeCampaigns;
    state.currentModule = "campaign";
    state.lastIntent = "campaign-summary";

    return {
      reply: `${
        focusedSegments.size > 0
          ? `Em tìm thấy ${relevantCampaigns.length} chiến dịch phù hợp với nhóm khách hàng đang focus`
          : `Hiện có ${relevantCampaigns.length} chiến dịch đang chạy`
      }:\n${relevantCampaigns
        .map((item, index) => `${index + 1}. ${item.name} (${item.targetSegment})`)
        .join("\n")}`,
      sources: sourceTrace(
        focusedSegments.size > 0 ? ["GET /customers", "GET /campaigns"] : ["GET /campaigns"]
      ),
      context: state
    };
  }

  if (askedName) {
    assertIdentityScopes({ identity, requiredScopes: CUSTOMER_INSIGHT_READ });
    const customer = await getCustomerByName(askedName, identity);
    if (!customer) {
      return {
        reply: `Em không tìm thấy khách hàng "${askedName}" trong CRM sandbox.`,
        sources: sourceTrace(["GET /customers"]),
        context: state
      };
    }

    const opps = await getCustomerOpportunities(customer.id, identity);
    const logs = await getCustomerInteractions(customer.id, identity);
    state.currentModule = "opportunity";
    state.focusedCustomers = [customer.id];
    state.lastIntent = "customer-insight";

    const bestOpp = [...opps].sort((a, b) => b.score - a.score)[0];
    const followUp = logs.length > 0 ? logs[logs.length - 1].note : "Chưa có ghi chú gần đây.";
    const recommendation = bestOpp
      ? `${bestOpp.product} (xác suất chuyển đổi ${Math.round(bestOpp.score * 100)}%, giá trị dự kiến ${formatVnd(bestOpp.estimatedValueVnd)}).`
      : "Chưa có cơ hội mở rộng sản phẩm.";

    return {
      reply: `Thông tin khách hàng ${customer.name}:\n- Segment: ${customer.segment}\n- Sản phẩm tiết kiệm: ${customer.savingsProduct}\n- Số dư: ${formatVnd(customer.savingsAmountVnd)}\n- Gợi ý cơ hội tiếp theo: ${recommendation}\n- Ghi chú lần tương tác gần nhất: ${followUp}`,
      sources: sourceTrace(["GET /customers", "GET /opportunities", "GET /interactions"]),
      context: state
    };
  }

  state.currentModule = "general";
  state.lastIntent = "fallback";

  return {
    reply:
      "Em đang sẵn sàng hỗ trợ anh/chị. Anh/chị có thể nhắn tự nhiên, ví dụ: nhắc khách hàng sắp đến hạn, soạn email chăm sóc, hỏi cơ hội cho một khách hàng cụ thể, hoặc xem chiến dịch đang chạy.",
    sources: sourceTrace(["internal://clarification"]),
    context: state,
    fallback: true
  };
}
