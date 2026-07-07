// Khớp cụm từ (substring) - dùng cho cụm dài, an toàn.
function hasPhrase(normalized, phrases) {
  return phrases.some((p) => normalized.includes(p));
}

// Khớp theo token (word-boundary) - dùng cho từ ngắn tránh dương tính giả (vd "hi" trong "nhieu").
function hasWord(normalized, words) {
  const tokens = normalized.split(/\s+/).filter(Boolean);
  return words.some((w) => tokens.includes(w));
}

// Agent xử lý chào hỏi / cảm ơn - nội bộ, không gọi API.
export const smalltalkAgent = {
  id: "smalltalk-agent",
  description: "Xử lý chào hỏi, cảm ơn, tạm biệt bằng văn phong tự nhiên.",
  priority: 10,
  enabled: () => true,
  match: ({ normalized }) =>
    hasPhrase(normalized, ["xin chao", "chao em", "chao anh", "cam on", "tam biet"]) ||
    hasWord(normalized, ["hello", "hi", "chao", "thanks", "thank", "bye"]),
  run: async ({ normalized }) => {
    let reply;
    if (normalized.includes("cam on") || normalized.includes("thank")) {
      reply = "Dạ không có gì ạ. Anh/chị cần em hỗ trợ thêm gì về khách hàng, email hay chiến dịch không?";
    } else if (normalized.includes("tam biet") || hasWord(normalized, ["bye"])) {
      reply = "Dạ, chúc anh/chị một ngày làm việc hiệu quả. Cần gì anh/chị cứ nhắn em nhé.";
    } else {
      reply = "Dạ em chào anh/chị. Em là BankRM Copilot, sẵn sàng hỗ trợ nhắc đến hạn, soạn email, gợi ý cơ hội hoặc xem chiến dịch.";
    }
    return { reply, sources: [{ endpoint: "internal://smalltalk" }], provider: "smalltalk-agent" };
  }
};

// Agent giới thiệu năng lực - nội bộ, không gọi API.
export const capabilityAgent = {
  id: "capability-agent",
  description: "Trả lời câu hỏi về năng lực, hướng dẫn sử dụng agent.",
  priority: 20,
  enabled: () => true,
  match: ({ normalized }) =>
    hasPhrase(normalized, ["lam duoc gi", "giup gi", "chuc nang", "huong dan", "ban la ai", "em la ai"]) ||
    hasWord(normalized, ["help"]),
  run: async () => ({
    reply:
      "Em là BankRM Copilot. Em có thể: (1) nhắc khách hàng có tiết kiệm sắp đến hạn, (2) soạn email chăm sóc/nhắc hạn, (3) gợi ý cơ hội bán chéo cho từng khách hàng, (4) liệt kê chiến dịch đang chạy, và soạn call script. Anh/chị cứ nhắn tự nhiên nhé.",
    sources: [{ endpoint: "internal://capability" }],
    provider: "capability-agent"
  })
};
