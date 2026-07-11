const chatWindow = document.getElementById("chatWindow");
const chatForm = document.getElementById("chatForm");
const messageInput = document.getElementById("messageInput");
const conversationId = crypto.randomUUID();

const apiBaseUrl = (window.BANKRM_API_BASE_URL ?? "").replace(/\/$/, "");

function addMessage(role, text) {
  const box = document.createElement("div");
  box.className = `msg ${role}`;

  const content = document.createElement("div");
  content.textContent = text;
  box.appendChild(content);

  chatWindow.appendChild(box);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function setComposerState(isLoading) {
  messageInput.disabled = isLoading;
  chatForm.querySelector("button").disabled = isLoading;
}

async function sendChatMessage(message) {
  const response = await fetch(`${apiBaseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversationId, message })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Không thể xử lý yêu cầu.");
  }

  return data;
}

function formatSourceLabel(sources = []) {
  const endpoints = sources.map((source) => source.endpoint);
  const hasLlmSources = endpoints.some((endpoint) => endpoint.includes("llm-proxy"));
  const hasCrmSources = endpoints.some(
    (endpoint) =>
      endpoint.startsWith("GET /customers") ||
      endpoint.startsWith("GET /opportunities") ||
      endpoint.startsWith("GET /interactions") ||
      endpoint.startsWith("GET /campaigns") ||
      endpoint.startsWith("POST /draft-email") ||
      endpoint.startsWith("POST /call-script")
  );

  if (hasCrmSources && hasLlmSources) return "Hệ thống CRM + AI nội bộ";
  if (hasCrmSources) return "Hệ thống CRM";
  if (hasLlmSources) return "AI nội bộ";
  return "Nội bộ";
}

addMessage(
  "bot",
  "Xin chào RM. Em có thể nhắc lịch chăm sóc, soạn email, gợi ý cơ hội tiếp theo và chuyển context CRM."
);

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = messageInput.value.trim();
  if (!message) return;

  addMessage("user", message);
  messageInput.value = "";
  setComposerState(true);

  try {
    const data = await sendChatMessage(message);
    let botReply = data.reply;

    if (data.sources && data.sources.length > 0) {
      botReply += `\n\nNguồn dữ liệu: ${formatSourceLabel(data.sources)}`;
    }

    addMessage("bot", botReply);
  } catch (error) {
    addMessage(
      "bot",
      `Không kết nối được MCP/CRM backend: ${error.message}\n\nVui lòng chạy backend local bằng npm start hoặc cấu hình BANKRM_API_BASE_URL trong public/config.js khi deploy frontend riêng.`
    );
  } finally {
    setComposerState(false);
    messageInput.focus();
  }
});
