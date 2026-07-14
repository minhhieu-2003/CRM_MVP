/* ══════════════════════════════════════════════════════════
   BankRM Copilot – app.js
   Features:
   - 3-panel UI controller
   - Conversation history (localStorage)
   - Tool trace panel (animated steps)
   - Source pills rendering
   - Focused customers panel
   - Basic markdown rendering
   - Auto-resize textarea
══════════════════════════════════════════════════════════ */

// ── DOM References ────────────────────────────────────────
const chatWindow       = document.getElementById('chatWindow');
const chatForm         = document.getElementById('chatForm');
const messageInput     = document.getElementById('messageInput');
const chatStatus       = document.getElementById('chatStatus');
const sendButton       = document.getElementById('sendButton');
const welcomeState     = document.getElementById('welcomeState');
const newChatBtn       = document.getElementById('newChatBtn');
const conversationList = document.getElementById('conversationList');
const convEmptyHint    = document.getElementById('convEmptyHint');
const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
const sidebar          = document.getElementById('sidebar');
const statusDot        = document.getElementById('statusDot');
const statusLabel      = document.getElementById('statusLabel');
const toolTraceBody    = document.getElementById('toolTraceBody');
const toolTraceBadge   = document.getElementById('toolTraceBadge');
const sourcesBody      = document.getElementById('sourcesBody');
const customersBody    = document.getElementById('customersBody');
const quickActionBtns  = document.querySelectorAll('.quick-actions button');
const suggestionChips  = document.querySelectorAll('.suggestion-chip');

const apiBaseUrl = (window.BANKRM_API_BASE_URL ?? '').replace(/\/$/, '');

// ── State ─────────────────────────────────────────────────
let conversationId   = crypto.randomUUID();
let messageSequence  = 0;
let activeConvId     = conversationId;
const STORAGE_KEY    = 'bankrm_conversations';

// ── Conversation Storage ──────────────────────────────────
function loadAllConversations() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveAllConversations(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch { /* quota exceeded – silently ignore */ }
}

function getConversation(id) {
  return loadAllConversations()[id] || null;
}

function pushMessageToConv(id, role, text) {
  const all = loadAllConversations();
  if (!all[id]) all[id] = { id, title: '', messages: [], createdAt: Date.now() };
  all[id].messages = all[id].messages || [];
  all[id].messages.push({ role, text, ts: Date.now() });

  // Auto-title: first user message (truncated to 40 chars)
  if (!all[id].title && role === 'user') {
    all[id].title = text.slice(0, 40) + (text.length > 40 ? '…' : '');
  }
  all[id].updatedAt = Date.now();
  saveAllConversations(all);
}

// ── Sidebar Rendering ─────────────────────────────────────
function renderSidebar() {
  const all = loadAllConversations();
  const items = Object.values(all).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  // Clear existing items (keep the empty hint)
  conversationList.querySelectorAll('.conv-item').forEach(el => el.remove());
  convEmptyHint.hidden = items.length > 0;

  items.forEach(conv => {
    const item = document.createElement('div');
    item.className = 'conv-item' + (conv.id === activeConvId ? ' is-active' : '');
    item.setAttribute('role', 'button');
    item.setAttribute('tabindex', '0');
    item.setAttribute('aria-label', `Hội thoại: ${conv.title || 'Chưa đặt tên'}`);
    item.dataset.convId = conv.id;

    const msgCount = conv.messages?.length || 0;
    const timeAgo  = formatTimeAgo(conv.updatedAt || conv.createdAt || Date.now());

    item.innerHTML = `
      <div class="conv-item-title">${escapeHtml(conv.title || 'Hội thoại mới')}</div>
      <div class="conv-item-meta">
        <span>${timeAgo}</span>
        <span class="dot"></span>
        <span>${msgCount} tin</span>
      </div>
    `;

    item.addEventListener('click', () => loadConversation(conv.id));
    item.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); loadConversation(conv.id); }
    });

    conversationList.appendChild(item);
  });
}

function formatTimeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 1)   return 'vừa xong';
  if (mins < 60)  return `${mins} phút`;
  if (hours < 24) return `${hours} giờ`;
  return `${days} ngày`;
}

// ── Load existing conversation ───────────────────────────
function loadConversation(id) {
  const conv = getConversation(id);
  if (!conv) return;

  activeConvId = id;
  conversationId = id;

  // Clear chat
  chatWindow.querySelectorAll('.msg').forEach(el => el.remove());
  if (welcomeState) welcomeState.hidden = true;

  // Replay messages
  (conv.messages || []).forEach(m => {
    renderMessage(m.role, m.text, { ts: m.ts });
  });

  // Reset side panel
  resetSidePanel();
  renderSidebar();
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

// ── New conversation ─────────────────────────────────────
function startNewConversation() {
  conversationId = crypto.randomUUID();
  activeConvId   = conversationId;

  chatWindow.querySelectorAll('.msg').forEach(el => el.remove());
  if (welcomeState) welcomeState.hidden = false;

  resetSidePanel();
  setStatus('Sẵn sàng nhận yêu cầu.');
  renderSidebar();
  messageInput.focus();
}

// ── Markdown renderer (lightweight) ──────────────────────
function renderMarkdown(text) {
  let html = escapeHtml(text);
  // Bold: **text**
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // Italic: *text*
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  // Inline code: `code`
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Unordered list: lines starting with - or •
  html = html.replace(/^[-•]\s+(.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
  // Numbered list: lines starting with 1. 2. etc
  html = html.replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>');
  // Line breaks
  html = html.replace(/\n/g, '<br>');
  return html;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Render a chat message ─────────────────────────────────
function renderMessage(role, text, { ts, sourceLabel, editableDraft, loading, tone } = {}) {
  if (welcomeState) welcomeState.hidden = true;

  const wrapper = document.createElement('div');
  wrapper.className = `msg ${role}`;
  if (loading) wrapper.classList.add('is-loading');
  if (tone)    wrapper.classList.add(`is-${tone}`);

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';

  const textEl = document.createElement('div');
  textEl.className = 'msg-text';

  if (loading) {
    textEl.textContent = text;
  } else if (role === 'bot') {
    textEl.innerHTML = renderMarkdown(text);
  } else {
    textEl.textContent = text;
  }

  bubble.appendChild(textEl);
  wrapper.appendChild(bubble);

  // Source chip
  if (sourceLabel) {
    const chip = document.createElement('div');
    chip.className = 'msg-source-chip';
    chip.innerHTML = `
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
        stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
      </svg>
      ${escapeHtml(sourceLabel)}
    `;
    wrapper.appendChild(chip);
  }

  // Timestamp
  const time = document.createElement('div');
  time.className = 'msg-time';
  time.textContent = formatTime(ts || Date.now());
  wrapper.appendChild(time);

  // Draft editor
  if (editableDraft) {
    addDraftEditor(wrapper, bubble, textEl);
  }

  chatWindow.appendChild(wrapper);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return wrapper;
}

function addMessage(role, text, opts = {}) {
  return renderMessage(role, text, opts);
}

function removeMessage(el) {
  el?.remove();
}

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

// ── Draft editor (email/script) ───────────────────────────
function addDraftEditor(wrapper, bubble, textEl) {
  wrapper.classList.add('has-editable-draft');

  const editorId = `draft-editor-${++messageSequence}`;
  const editor   = document.createElement('textarea');
  editor.id        = editorId;
  editor.className = 'draft-editor';
  editor.setAttribute('aria-label', 'Chỉnh sửa nội dung bản nháp');
  editor.hidden    = true;

  const actions    = document.createElement('div');
  actions.className = 'draft-actions';
  actions.setAttribute('role', 'group');

  const editBtn   = makeBtn('Chỉnh sửa', 'draft-action');
  const saveBtn   = makeBtn('Lưu', 'draft-action primary');
  const cancelBtn = makeBtn('Hủy', 'draft-action');
  saveBtn.hidden = cancelBtn.hidden = true;
  editBtn.setAttribute('aria-controls', editorId);
  editBtn.setAttribute('aria-expanded', 'false');

  let savedValue = textEl.textContent;

  function setEditing(on) {
    textEl.hidden        = on;
    editor.hidden        = !on;
    editBtn.hidden       = on;
    saveBtn.hidden       = !on;
    cancelBtn.hidden     = !on;
    editBtn.setAttribute('aria-expanded', String(on));
  }

  editBtn.addEventListener('click', () => {
    savedValue   = textEl.textContent;
    editor.value = savedValue;
    editor.style.height = `${Math.max(textEl.getBoundingClientRect().height, 140)}px`;
    setEditing(true);
    editor.focus();
  });
  saveBtn.addEventListener('click', () => {
    textEl.innerHTML = renderMarkdown(editor.value);
    setEditing(false);
    setStatus('Đã cập nhật bản nháp.');
    editBtn.focus();
  });
  cancelBtn.addEventListener('click', () => {
    editor.value = savedValue;
    setEditing(false);
    editBtn.focus();
  });

  bubble.insertBefore(editor, textEl.nextSibling);
  actions.append(editBtn, saveBtn, cancelBtn);
  wrapper.appendChild(actions);
}

function makeBtn(label, className) {
  const btn = document.createElement('button');
  btn.type      = 'button';
  btn.className = className;
  btn.textContent = label;
  return btn;
}

// ── Status helpers ────────────────────────────────────────
function setStatus(msg = '') {
  chatStatus.textContent = msg;
}

function setGlobalStatus(state = 'ready') {
  statusDot.className   = 'status-dot' + (state === 'loading' ? ' is-loading' : state === 'error' ? ' is-error' : '');
  statusLabel.textContent = state === 'loading' ? 'Đang xử lý...' : state === 'error' ? 'Lỗi' : 'Sẵn sàng';
}

function setComposerState(isLoading) {
  messageInput.disabled = isLoading;
  sendButton.disabled   = isLoading;
  sendButton.classList.toggle('is-loading', isLoading);
  sendButton.querySelector('.send-label').textContent = isLoading ? 'Đang gửi' : 'Gửi';
  chatWindow.setAttribute('aria-busy', String(isLoading));
  quickActionBtns.forEach(b => { b.disabled = isLoading; });
  setGlobalStatus(isLoading ? 'loading' : 'ready');
}

// ── Tool Trace Panel ──────────────────────────────────────
const TRACE_STEPS_LOADING = [
  { icon: '🔍', label: 'Kiểm tra câu hỏi', detail: 'Phân tích intent và context' },
  { icon: '⚙️', label: 'Gọi CRM tools', detail: 'Truy xuất dữ liệu nội bộ' },
  { icon: '🧠', label: 'Tổng hợp câu trả lời', detail: 'AI grounding & synthesis' },
];

function renderToolTraceLoading() {
  toolTraceBody.innerHTML = '';
  toolTraceBadge.hidden = true;

  TRACE_STEPS_LOADING.forEach((step, i) => {
    if (i > 0) {
      const connector = document.createElement('div');
      connector.className = 'trace-connector';
      toolTraceBody.appendChild(connector);
    }

    const row = document.createElement('div');
    row.className = 'trace-step';
    row.id = `trace-step-${i}`;
    row.innerHTML = `
      <div class="trace-step-icon pending">${step.icon}</div>
      <div class="trace-step-body">
        <div class="trace-step-label">${step.label}</div>
        <div class="trace-step-detail">${step.detail}</div>
      </div>
    `;
    toolTraceBody.appendChild(row);

    // Animate: make each step "running" then "done" progressively
    setTimeout(() => {
      const iconEl = row.querySelector('.trace-step-icon');
      iconEl.className = 'trace-step-icon running';
      iconEl.textContent = '⟳';
    }, i * 900);
  });
}

function renderToolTraceDone(sources = []) {
  // Mark all steps done
  TRACE_STEPS_LOADING.forEach((step, i) => {
    const row    = document.getElementById(`trace-step-${i}`);
    if (!row) return;
    const iconEl = row.querySelector('.trace-step-icon');
    iconEl.className   = 'trace-step-icon done';
    iconEl.textContent = '✓';
  });

  // Show badge with tool count
  const toolCount = sources.length;
  if (toolCount > 0) {
    toolTraceBadge.textContent = toolCount;
    toolTraceBadge.hidden = false;
  }
}

function resetSidePanel() {
  toolTraceBody.innerHTML = '<p class="sp-hint">Gửi câu hỏi để xem AI xử lý như thế nào.</p>';
  toolTraceBadge.hidden = true;
  sourcesBody.innerHTML  = '<p class="sp-hint">Các nguồn dữ liệu sử dụng sẽ hiển thị ở đây.</p>';
  customersBody.innerHTML = '<p class="sp-hint">Khách hàng được nhắc đến sẽ hiển thị ở đây.</p>';
}

// ── Sources Panel ─────────────────────────────────────────
function renderSources(sources = []) {
  if (!sources.length) return;

  sourcesBody.innerHTML = '';
  sources.forEach((src, i) => {
    const endpoint = src.endpoint || String(src);
    const parts    = endpoint.split(' ');
    const method   = parts.length > 1 ? parts[0] : 'GET';
    const path     = parts.length > 1 ? parts.slice(1).join(' ') : endpoint;

    const pill = document.createElement('div');
    pill.className = 'source-pill';
    pill.style.animationDelay = `${i * 60}ms`;
    pill.innerHTML = `
      <span class="source-pill-method">${escapeHtml(method)}</span>
      <span class="source-pill-endpoint" title="${escapeHtml(endpoint)}">${escapeHtml(path)}</span>
    `;
    sourcesBody.appendChild(pill);
  });
}

// ── Customers Panel ───────────────────────────────────────
function renderFocusedCustomers(customers = []) {
  if (!customers.length) return;

  customersBody.innerHTML = '';
  customers.slice(0, 5).forEach((cust, i) => {
    const name    = typeof cust === 'string' ? cust : (cust.name || cust.customerName || 'Khách hàng');
    const segment = typeof cust === 'object' ? (cust.segment || cust.tier || '') : '';
    const initials = name.split(' ').map(w => w[0]).slice(-2).join('').toUpperCase();

    const card = document.createElement('div');
    card.className = 'customer-card';
    card.style.animationDelay = `${i * 80}ms`;
    card.innerHTML = `
      <div class="customer-avatar">${escapeHtml(initials)}</div>
      <div class="customer-info">
        <div class="customer-name">${escapeHtml(name)}</div>
        ${segment ? `<div class="customer-meta">${escapeHtml(segment)}</div>` : ''}
      </div>
    `;
    customersBody.appendChild(card);
  });
}

// ── Source label helpers ──────────────────────────────────
function formatSourceLabel(sources = []) {
  const endpoints    = sources.map(s => s.endpoint || '');
  const hasLlm       = endpoints.some(e => e.includes('llm-proxy'));
  const hasCrm       = endpoints.some(e =>
    e.startsWith('GET /customers') ||
    e.startsWith('GET /opportunities') ||
    e.startsWith('GET /interactions') ||
    e.startsWith('GET /campaigns') ||
    e.startsWith('POST /draft-email') ||
    e.startsWith('POST /call-script')
  );
  if (hasCrm && hasLlm) return 'Đã tham chiếu CRM và AI nội bộ';
  if (hasCrm)           return 'Đã tham chiếu CRM nội bộ';
  if (hasLlm)           return 'Đã tham chiếu AI nội bộ';
  return 'Đã tham chiếu dữ liệu nội bộ';
}

function containsEditableDraft(sources = []) {
  return sources.some(s =>
    s.endpoint?.startsWith('POST /draft-email') ||
    s.endpoint?.startsWith('POST /call-script')
  );
}

// ── API ───────────────────────────────────────────────────
async function sendChatMessage(message) {
  const response = await fetch(`${apiBaseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversationId, message }),
  });

  const ct   = response.headers.get('content-type') ?? '';
  const data = ct.includes('application/json')
    ? await response.json()
    : { error: await response.text() };

  if (!response.ok) {
    throw new Error(data.error || 'Em chưa nhận được phản hồi phù hợp.');
  }
  return data;
}

// ── Main submit handler ───────────────────────────────────
async function handleMessageSubmit(message) {
  if (!message?.trim()) return;
  message = message.trim();

  // Persist + render user message
  pushMessageToConv(conversationId, 'user', message);
  addMessage('user', message);
  messageInput.value = '';
  autoResizeTextarea();
  renderSidebar();

  setComposerState(true);
  setStatus('Em đang kiểm tra dữ liệu CRM...');
  renderToolTraceLoading();

  const loadingEl = addMessage('bot', 'Em đang kiểm tra dữ liệu CRM', { loading: true });

  try {
    const data    = await sendChatMessage(message);
    const sources = Array.isArray(data.sources) ? data.sources : [];
    const ctx     = data.context || {};

    removeMessage(loadingEl);
    renderToolTraceDone(sources);

    const sourceLabel = sources.length ? formatSourceLabel(sources) : '';
    const editable    = containsEditableDraft(sources);

    addMessage('bot', data.reply, { sourceLabel, editableDraft: editable });
    pushMessageToConv(conversationId, 'bot', data.reply);
    renderSidebar();

    // Update side panels
    renderSources(sources);
    if (ctx.focusedCustomers?.length) renderFocusedCustomers(ctx.focusedCustomers);

    setStatus('Đã cập nhật câu trả lời.');
    setGlobalStatus('ready');

  } catch (err) {
    console.warn('Chat request failed', err);
    removeMessage(loadingEl);
    addMessage('bot',
      'Em chưa kết nối được hệ thống dữ liệu. Anh/chị vui lòng thử lại sau ít phút.',
      { tone: 'error' }
    );
    setStatus('Chưa nhận được dữ liệu. Vui lòng thử lại.');
    setGlobalStatus('error');

    // Mark trace as error
    toolTraceBody.querySelectorAll('.trace-step-icon.running').forEach(el => {
      el.className   = 'trace-step-icon error';
      el.textContent = '✕';
    });
  } finally {
    setComposerState(false);
    messageInput.focus();
  }
}

// ── Auto-resize textarea ──────────────────────────────────
function autoResizeTextarea() {
  messageInput.style.height = 'auto';
  messageInput.style.height = Math.min(messageInput.scrollHeight, 140) + 'px';
}

// ── Event Listeners ───────────────────────────────────────

// Form submit
chatForm.addEventListener('submit', e => {
  e.preventDefault();
  void handleMessageSubmit(messageInput.value);
});

// Textarea: Enter to send, Shift+Enter for newline
messageInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    void handleMessageSubmit(messageInput.value);
  }
});
messageInput.addEventListener('input', autoResizeTextarea);

// Quick actions (keyboard 1-4 + click)
quickActionBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const msg = btn.dataset.message?.trim();
    if (!msg || btn.disabled) return;
    void handleMessageSubmit(msg);
  });
});

// Suggestion chips on welcome screen
suggestionChips.forEach(chip => {
  chip.addEventListener('click', () => {
    const msg = chip.dataset.message?.trim();
    if (!msg) return;
    void handleMessageSubmit(msg);
  });
});

// Keyboard shortcuts: 1–4 to trigger quick actions when not typing
document.addEventListener('keydown', e => {
  const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
  if (typing || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;

  const idx = Number(e.key) - 1;
  const btn = quickActionBtns[idx];
  if (!btn || btn.disabled) return;
  e.preventDefault();
  btn.click();
});

// New conversation button
newChatBtn.addEventListener('click', startNewConversation);

// Sidebar toggle
sidebarToggleBtn.addEventListener('click', () => {
  sidebar.classList.toggle('is-collapsed');
  sidebarToggleBtn.setAttribute('aria-pressed', String(sidebar.classList.contains('is-collapsed')));
});

// ── Initialise ────────────────────────────────────────────
setStatus('Sẵn sàng nhận yêu cầu.');
renderSidebar();
autoResizeTextarea();
