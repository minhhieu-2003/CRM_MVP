import { generateLlmFallback, isLlmFallbackEnabled } from "../llmFallback.js";

// Agent dự phòng cuối cùng - gọi LLM qua proxy có logging.
// "Chờ sẵn" trong registry nhưng chỉ kích hoạt khi đã cấu hình proxy.
export const llmAgent = {
  id: "llm-fallback-agent",
  description: "Dự phòng bằng LLM (OpenAI-compatible) qua proxy đã phê duyệt.",
  priority: 90,
  enabled: () => isLlmFallbackEnabled(),
  match: () => true,
  run: async ({ message }) => {
    const llm = await generateLlmFallback({ message });
    return {
      reply: llm.reply,
      sources: [{ endpoint: "POST /llm-proxy/chat" }],
      provider: `llm-fallback:${llm.model}`
    };
  }
};
