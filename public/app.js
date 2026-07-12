const chatWindow = document.getElementById("chatWindow");
const chatForm = document.getElementById("chatForm");
const messageInput = document.getElementById("messageInput");
const chatStatus = document.getElementById("chatStatus");
const sendButton = document.getElementById("sendButton");
const welcomeState = document.getElementById("welcomeState");
const quickActionButtons = document.querySelectorAll(".quick-actions button");
const conversationId = crypto.randomUUID();
let messageSequence = 0;

const apiBaseUrl = (window.BANKRM_API_BASE_URL ?? "").replace(/\/$/, "");

function addDraftEditor(box, content, textElement) {
  box.classList.add("has-editable-draft");

  const editorId = `draft-editor-${++messageSequence}`;
  const editor = document.createElement("textarea");
  editor.id = editorId;
  editor.className = "draft-editor";
  editor.setAttribute("aria-label", "Chỉnh sửa nội dung bản nháp");
  editor.hidden = true;

  const actions = document.createElement("div");
  actions.className = "draft-actions";
  actions.setAttribute("role", "group");
  actions.setAttribute("aria-label", "Thao tác với bản nháp");

  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.className = "draft-action";
  editButton.textContent = "Chỉnh sửa";
  editButton.setAttribute("aria-controls", editorId);
  editButton.setAttribute("aria-expanded", "false");

  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.className = "draft-action primary";
  saveButton.textContent = "Lưu";
  saveButton.hidden = true;

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.className = "draft-action";
  cancelButton.textContent = "Hủy";
  cancelButton.hidden = true;

  let valueBeforeEditing = textElement.textContent;

  function setEditing(isEditing) {
    textElement.hidden = isEditing;
    editor.hidden = !isEditing;
    editButton.hidden = isEditing;
    saveButton.hidden = !isEditing;
    cancelButton.hidden = !isEditing;
    box.classList.toggle("is-editing", isEditing);
    editButton.setAttribute("aria-expanded", String(isEditing));
  }

  editButton.addEventListener("click", () => {
    valueBeforeEditing = textElement.textContent;
    editor.value = valueBeforeEditing;
    editor.style.height = `${Math.max(textElement.getBoundingClientRect().height, 120)}px`;
    setEditing(true);
    editor.focus();
    editor.setSelectionRange(editor.value.length, editor.value.length);
  });

  saveButton.addEventListener("click", () => {
    textElement.textContent = editor.value;
    setEditing(false);
    setStatus("Đã cập nhật bản nháp trên màn hình.");
    editButton.focus();
  });

  cancelButton.addEventListener("click", () => {
    editor.value = valueBeforeEditing;
    setEditing(false);
    editButton.focus();
  });

  content.insertBefore(editor, textElement.nextSibling);
  actions.append(editButton, saveButton, cancelButton);
  box.appendChild(actions);
}

function addMessage(
  role,
  text,
  { sourceLabel = "", editableDraft = false, loading = false, tone = "" } = {}
) {
  if (welcomeState) {
    welcomeState.hidden = true;
  }

  const box = document.createElement("div");
  box.className = `msg ${role}`;
  if (loading) box.classList.add("is-loading");
  if (tone) box.classList.add(`is-${tone}`);

  const content = document.createElement("div");
  content.className = "msg-content";

  const textElement = document.createElement("div");
  textElement.className = "msg-text";
  textElement.textContent = text;
  content.appendChild(textElement);

  if (sourceLabel) {
    const source = document.createElement("div");
    source.className = "msg-source";
    source.textContent = sourceLabel;
    content.appendChild(source);
  }

  box.appendChild(content);

  if (editableDraft) {
    addDraftEditor(box, content, textElement);
  }

  chatWindow.appendChild(box);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return box;
}

function removeMessage(messageElement) {
  messageElement?.remove();
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function setStatus(message = "") {
  chatStatus.textContent = message;
}

function setComposerState(isLoading) {
  messageInput.disabled = isLoading;
  sendButton.disabled = isLoading;
  sendButton.textContent = isLoading ? "Đang gửi" : "Gửi";
  chatWindow.setAttribute("aria-busy", String(isLoading));
  quickActionButtons.forEach((button) => {
    button.disabled = isLoading;
  });
}

async function sendChatMessage(message) {
  const response = await fetch(`${apiBaseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversationId, message })
  });

  const contentType = response.headers.get("content-type") ?? "";
  const data = contentType.includes("application/json")
    ? await response.json()
    : { error: await response.text() };

  if (!response.ok) {
    throw new Error(data.error || "Em chưa nhận được phản hồi phù hợp.");
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

  if (hasCrmSources && hasLlmSources) return "Đã tham chiếu CRM và AI nội bộ";
  if (hasCrmSources) return "Đã tham chiếu CRM nội bộ";
  if (hasLlmSources) return "Đã tham chiếu AI nội bộ";
  return "Đã tham chiếu dữ liệu nội bộ";
}

function containsEditableDraft(sources = []) {
  return sources.some(
    (source) =>
      source.endpoint?.startsWith("POST /draft-email") ||
      source.endpoint?.startsWith("POST /call-script")
  );
}

setStatus("Sẵn sàng nhận yêu cầu.");

async function handleMessageSubmit(message) {
  if (!message) return;

  addMessage("user", message);
  messageInput.value = "";
  setComposerState(true);
  setStatus("Em đang kiểm tra dữ liệu CRM...");

  const loadingMessage = addMessage("bot", "Em đang kiểm tra dữ liệu CRM", {
    loading: true
  });

  try {
    const data = await sendChatMessage(message);
    const sources = Array.isArray(data.sources) ? data.sources : [];

    removeMessage(loadingMessage);
    addMessage("bot", data.reply, {
      sourceLabel: sources.length > 0 ? formatSourceLabel(sources) : "",
      editableDraft: containsEditableDraft(sources)
    });
    setStatus("Đã cập nhật câu trả lời.");
  } catch (error) {
    console.warn("Chat request failed", error);
    removeMessage(loadingMessage);
    addMessage("bot", "Em chưa kết nối được hệ thống dữ liệu. Anh/chị vui lòng thử lại sau ít phút.", {
      tone: "error"
    });
    setStatus("Chưa nhận được dữ liệu. Vui lòng thử lại.");
  } finally {
    setComposerState(false);
    messageInput.focus();
  }
}

chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const message = messageInput.value.trim();
  void handleMessageSubmit(message);
});

quickActionButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const message = button.dataset.message?.trim();
    if (!message || messageInput.disabled) return;
    void handleMessageSubmit(message);
  });
});

document.addEventListener("keydown", (event) => {
  const isTyping =
    event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;

  if (isTyping || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

  const actionIndex = Number(event.key) - 1;
  const actionButton = quickActionButtons[actionIndex];
  if (!actionButton || actionButton.disabled) return;

  event.preventDefault();
  actionButton.click();
});
