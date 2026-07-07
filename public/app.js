const chatWindow = document.getElementById("chatWindow");
const chatForm = document.getElementById("chatForm");
const messageInput = document.getElementById("messageInput");
const conversationId = crypto.randomUUID();

function addMessage(role, text) {
  const box = document.createElement("div");
  box.className = `msg ${role}`;
  box.textContent = text;

  chatWindow.appendChild(box);
  chatWindow.scrollTop = chatWindow.scrollHeight;
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

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId, message })
    });

    const data = await response.json();
    if (!response.ok) {
      addMessage("bot", `Lỗi: ${data.error}`);
      return;
    }

    addMessage("bot", data.reply);
  } catch (error) {
    addMessage("bot", `Không kết nối được server: ${error.message}`);
  }
});
