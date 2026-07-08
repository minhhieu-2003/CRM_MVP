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

async function detectCustomerName(message) {
  const normalized = normalizeVietnamese(message);
  const customers = await listCustomers();
  const mentionedCustomer = customers.find((customer) =>
    normalized.includes(normalizeVietnamese(customer.name))
  );
  if (mentionedCustomer) return mentionedCustomer.name;

  if (
    hasAny(normalized, [
      "bao nhieu",
      "liet ke",
      "danh sach",
      "hom nay",
      "tiep khach",
      "cham soc"
    ])
  ) {
    return null;
  }

  const match = normalized.match(/khach\s+([a-z\s]+)/i);
  if (!match) return null;
  return match[1].trim();
}

function sourceTrace(entries) {
  return entries.map((endpoint) => ({ endpoint }));
}

function hasAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
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

export async function routeConversation({ conversationId, message }) {
  const state = getState(conversationId);
  const normalized = normalizeVietnamese(message);
  const compact = normalized.replace(/\s+/g, " ").trim();
  const askedName = await detectCustomerName(message);

  const isReminderIntent =
    compact === "1" ||
    (normalized.includes("nhac") &&
      normalized.includes("tiet kiem") &&
      normalized.includes("den han"));

  const isEmailIntent =
    compact === "2" ||
    ((hasAny(normalized, ["soan", "draft"]) &&
      hasAny(normalized, ["email", "khach hang", "tiep", "follow up"])) ||
      normalized.includes("soan tiep"));

  const isOpportunityIntent =
    !askedName &&
    (compact === "3" ||
      normalized.includes("co hoi") ||
      normalized.includes("opportunity") ||
      normalized.includes("goi y"));

  const isCampaignIntent =
    compact === "4" || normalized.includes("chien dich") || normalized.includes("campaign");

  const isTodayCareIntent =
    hasAny(normalized, ["hom nay", "ngay nay"]) &&
    hasAny(normalized, ["khach", "tiep", "cham soc", "gap", "goi"]) &&
    hasAny(normalized, ["bao nhieu", "liet ke", "danh sach", "can"]);

  if (isTodayCareIntent) {
    const dueCustomers = await getMaturityCustomers(7);
    state.currentModule = "customer-profile";
    state.focusedCustomers = dueCustomers.map((item) => item.id);
    state.lastIntent = "today-care-list";

    const lines = dueCustomers.map(
      (item, index) =>
        `${index + 1}. ${item.name} - ${item.savingsProduct} - ${formatVnd(item.savingsAmountVnd)} - đến hạn ${item.maturityDate}`
    );

    return {
      reply:
        dueCustomers.length > 0
          ? `Hôm nay em đề xuất RM ưu tiên tiếp/chăm sóc ${dueCustomers.length} khách hàng có tiết kiệm sắp đến hạn trong 7 ngày tới:\n${lines.join("\n")}\n\nAnh/chị có thể nhắn "soạn email cho nhóm này" hoặc "kịch bản gọi" để em chuẩn bị nội dung chăm sóc.`
          : "Hôm nay chưa có khách hàng nào cần ưu tiên tiếp/chăm sóc theo dữ liệu CRM sandbox.",
      sources: sourceTrace(["GET /customers"]),
      context: state
    };
  }

  if (isReminderIntent) {
    const dueCustomers = await getMaturityCustomers(7);
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
        ? (await Promise.all(state.focusedCustomers.map((id) => getCustomerById(id)))).filter(Boolean)
        : [];

    const targets = candidates.length > 0 ? candidates : await getMaturityCustomers(7);

    if (targets.length === 0) {
      return {
        reply: "Em chưa có danh sách khách hàng mục tiêu. Anh/chị hãy yêu cầu nhắc đến hạn hoặc chỉ định tên khách hàng cụ thể.",
        sources: sourceTrace(["GET /customers"]),
        context: state
      };
    }

    const drafts = await Promise.all(
      targets.slice(0, 5).map((customer) =>
        draftEmailForCustomer(customer, renewalSuggestion(customer))
      )
    );

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
    const targetCustomer = targetId ? await getCustomerById(targetId) : null;

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
      reply: await draftCallScript(
        targetCustomer,
        "Ngoài ra, em có thể gửi đề xuất bảo hiểm/lãi suất ưu đãi ngay sau cuộc gọi."
      ),
      sources: sourceTrace(["GET /customers", "POST /call-script"]),
      context: state
    };
  }

  if (isOpportunityIntent) {
    state.currentModule = "opportunity";
    state.lastIntent = "suggest_opportunity";
    if (state.focusedCustomers.length > 0) {
      const customerId = state.focusedCustomers[0];
      const opps = await getCustomerOpportunities(customerId);
      const list = opps.map((o) => {
        const name = o.product || o.name || "";
        const val = o.estimatedValueVnd !== undefined ? formatVnd(o.estimatedValueVnd) : (o.valueVnd ? `${o.valueVnd.toLocaleString("vi-VN")}đ` : "");
        return `- ${name}: ${val} (Độ ấm: ${o.stage})`;
      }).join("\n");
      return {
        reply: `Cơ hội kinh doanh cho khách hàng:\n${list || "Chưa ghi nhận cơ hội mới."}`,
        sources: sourceTrace(["GET /opportunities"]),
        context: state
      };
    } else {
      return {
        reply: "RM muốn gợi ý cơ hội cho khách hàng nào? Vui lòng cung cấp tên khách hàng để em tra cứu.",
        sources: [],
        context: state
      };
    }
  }

  if (isCampaignIntent) {
    const activeCampaigns = (await listCampaigns()).filter((item) => item.status === "Active");
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

  if (askedName) {
    const customer = await getCustomerByName(askedName);
    if (!customer) {
      return {
        reply: `Em không tìm thấy khách hàng "${askedName}" trong CRM sandbox.`,
        sources: sourceTrace(["GET /customers"]),
        context: state
      };
    }

    const opps = await getCustomerOpportunities(customer.id);
    const logs = await getCustomerInteractions(customer.id);
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
