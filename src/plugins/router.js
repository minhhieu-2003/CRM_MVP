import { normalizeVietnamese } from "../services/textUtils.js";
import { smalltalkAgent, capabilityAgent } from "./agents/internalAgents.js";
import { llmAgent } from "./agents/llmAgent.js";

// Registry: các agent plugin "chờ sẵn" khi khởi động.
// Router sẽ điều hướng theo priority (thấp = ưu tiên trước) và match().
const registry = [smalltalkAgent, capabilityAgent, llmAgent];

export function listAgents() {
  return registry.map((a) => ({
    id: a.id,
    description: a.description,
    priority: a.priority,
    enabled: a.enabled()
  }));
}

export function registerAgent(agent) {
  registry.push(agent);
}

/**
 * Điều hướng dự phòng: chỉ chạy khi rule engine không khớp intent.
 * Thử lần lượt các agent đang bật + khớp theo priority.
 * Một agent lỗi/không trả kết quả -> tự chuyển agent kế tiếp (dự phòng theo chuỗi).
 * Trả về null nếu không agent nào xử lý được (caller dùng fallback tĩnh).
 */
export async function dispatchFallback({ message, onAgentError } = {}) {
  const normalized = normalizeVietnamese(message);
  const candidates = registry
    .filter((agent) => {
      try {
        return agent.enabled() && agent.match({ message, normalized });
      } catch {
        return false;
      }
    })
    .sort((a, b) => a.priority - b.priority);

  for (const agent of candidates) {
    try {
      const result = await agent.run({ message, normalized });
      if (result && result.reply) {
        return { ...result, agentId: agent.id };
      }
    } catch (error) {
      if (typeof onAgentError === "function") {
        onAgentError(agent.id, error);
      }
      // chuyển sang agent dự phòng kế tiếp
    }
  }

  return null;
}
