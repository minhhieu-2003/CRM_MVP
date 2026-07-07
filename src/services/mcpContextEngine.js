import {
  draftCallScript,
  draftEmailForCustomer,
  formatVnd,
  getCustomerById,
  getCustomerByName,
  getCustomerInteractions,
  getCustomerOpportunities,
  getMaturityCustomers,
  listCampaigns
} from "./crmService.js";
import { normalizeVietnamese } from "./textUtils.js";

const contextStore = new Map();

function getState(conversationId) {
  if (!contextStore.has(conversationId)) {
    contextStore.set(conversationId, {
      currentModule: "general",
      focusedCustomers: [],
      lastIntent: null
    });
  }
  return contextStore.get(conversationId);
}

function detectCustomerName(message) {
  const match = message.match(/khach\s+([a-zA-ZÀ-ỹ\s]+)/i);
  if (!match) return null;
  return match[1].trim();
}

function sourceTrace(entries) {
  return entries.map((endpoint) => ({ endpoint }));
}

function hasAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

export function routeConversation({ conversationId, message }) {
  const state = getState(conversationId);
  const normalized = normalizeVietnamese(message);
  const compact = normalized.replace(/\s+/g, " ").trim();

  const isReminderIntent =
    compact === "1" ||
    ((normalized.includes("nhac") || normalized.includes("nhac toi")) &&
      normalized.includes("tiet kiem") &&
      normalized.includes("den han"));

  const isEmailIntent =
    compact === "2" ||
    ((hasAny(normalized, ["soan", "draft"]) &&
      hasAny(normalized, ["email", "khach hang", "tiep", "follow up"])) ||
      normalized.includes("soan tiep"));

  const isCampaignIntent =
    compact === "4" || normalized.includes("chien dich") || normalized.includes("campaign");

  if (isReminderIntent) {
    const dueCustomers = getMaturityCustomers(7);
    state.currentModule = "customer-profile";
    state.focusedCustomers = dueCustomers.map((item) => item.id);
    state.lastIntent = "maturity-reminder";

    const lines = dueCustomers.map(
      (item, index) =>
        `${index + 1}. ${item.name} - ${item.savingsProduct} - ${formatVnd(item.savingsAmountVnd)} - đến hạn ${item.maturityDate}`
    );

    return {
      reply:
        dueCustomers.length > 0
          ? `Em đã lọc ${dueCustomers.length} khách hàng có tiết kiệm đến hạn trong 7 ngày tới:\n${lines.join("\n")}\n\nAnh/chị có muốn em soạn email nhắc hạn cho danh sách này không?`
          : "Hiện không có khách hàng nào đến hạn tiết kiệm trong 7 ngày tới.",
      sources: sourceTrace(["GET /customers"]),
      context: state
    };
  }

  if (isEmailIntent) {
    state.currentModule = "interaction";
    state.lastIntent = "email-draft";

    const candidates =
      state.focusedCustomers.length > 0
        ? state.focusedCustomers.map((id) => getCustomerById(id)).filter(Boolean)
        : [];

    const targets = candidates.length > 0 ? candidates : getMaturityCustomers(7);

    if (targets.length === 0) {
      return {
        reply: "Em chưa có danh sách khách hàng mục tiêu. Anh/chị hãy yêu cầu nhắc đến hạn hoặc chỉ định tên khách hàng cụ thể.",
        sources: sourceTrace(["GET /customers"]),
        context: state
      };
    }

    const drafts = targets.slice(0, 5).map((customer) => {
      const suggestion =
        customer.segment === "Affluent"
          ? "Em đề xuất thêm gói bảo hiểm liên kết vay mua nhà để tối ưu bảo vệ tài chính."
          : "Em đề xuất tái tục tự động kỳ hạn linh hoạt để tối ưu dòng tiền.";
      return draftEmailForCustomer(customer, suggestion);
    });

    return {
      reply: drafts
        .map(
          (item, index) =>
            `Email ${index + 1}\nTiêu đề: ${item.subject}\nNội dung:\n${item.body}`
        )
        .join("\n\n---\n\n"),
      sources: sourceTrace(["GET /customers", "POST /draft-email"]),
      context: state
    };
  }

  if (normalized.includes("call script") || normalized.includes("kich ban goi")) {
    const targetId = state.focusedCustomers[0];
    const targetCustomer = targetId ? getCustomerById(targetId) : null;

    if (!targetCustomer) {
      return {
        reply: "Em chưa xác định được khách hàng. Anh/chị vui lòng yêu cầu theo tên khách hàng trước.",
        sources: sourceTrace(["GET /customers"]),
        context: state
      };
    }

    state.currentModule = "interaction";
    state.lastIntent = "call-script";

    return {
      reply: draftCallScript(
        targetCustomer,
        "Ngoài ra, em có thể gửi đề xuất bảo hiểm/lãi suất ưu đãi ngay sau cuộc gọi."
      ),
      sources: sourceTrace(["GET /customers", "POST /call-script"]),
      context: state
    };
  }

  if (isCampaignIntent) {
    const activeCampaigns = listCampaigns().filter((item) => item.status === "Active");
    state.currentModule = "campaign";
    state.lastIntent = "campaign-summary";

    return {
      reply: `Hiện có ${activeCampaigns.length} chiến dịch đang chạy:\n${activeCampaigns
        .map((item, index) => `${index + 1}. ${item.name} (${item.targetSegment})`)
        .join("\n")}`,
      sources: sourceTrace(["GET /campaigns"]),
      context: state
    };
  }

  const askedName = detectCustomerName(message);
  if (askedName) {
    const customer = getCustomerByName(askedName);
    if (!customer) {
      return {
        reply: `Em không tìm thấy khách hàng "${askedName}" trong CRM sandbox.`,
        sources: sourceTrace(["GET /customers"]),
        context: state
      };
    }

    const opps = getCustomerOpportunities(customer.id);
    const logs = getCustomerInteractions(customer.id);
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
      sources: sourceTrace([
        "GET /customers",
        "GET /opportunities",
        "GET /interactions"
      ]),
      context: state
    };
  }

  state.currentModule = "general";
  state.lastIntent = "fallback";

  return {
    reply:
      "Em đang sẵn sàng hỗ trợ anh/chị. Anh/chị có thể nhắn tự nhiên, ví dụ: nhắc khách hàng sắp đến hạn, soạn email chăm sóc, hỏi cơ hội cho một khách hàng cụ thể, hoặc xem chiến dịch đang chạy.",
    sources: sourceTrace(["GET /customers", "GET /opportunities", "GET /campaigns"]),
    context: state,
    fallback: true
  };
}
