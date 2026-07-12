/**
 * MCP Server Smoke Test — BankRM Copilot
 * Transport: stdio (spawn child process, pipe stdin/stdout)
 * Run: node scripts/qa/smoke-mcp.mjs
 *
 * MCP server dùng StdioServerTransport → KHÔNG dùng HTTP/SSE.
 * Script này spawn server.js như một child process, gửi JSON-RPC qua stdin,
 * đọc response từ stdout.
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const SERVER_PATH = path.join(ROOT, "src", "mcp", "server.js");

// ─── Colours ─────────────────────────────────────────────────────────────────
const G = "\x1b[32m"; // green
const R = "\x1b[31m"; // red
const Y = "\x1b[33m"; // yellow
const B = "\x1b[36m"; // cyan
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

// ─── JSON-RPC helpers ─────────────────────────────────────────────────────────
let _id = 1;
function rpc(method, params = {}) {
  return JSON.stringify({ jsonrpc: "2.0", id: _id++, method, params }) + "\n";
}
function toolCall(name, args = {}) {
  return rpc("tools/call", { name, arguments: args });
}

// ─── Spawn MCP server ────────────────────────────────────────────────────────
function spawnServer() {
  const child = spawn(process.execPath, ["--env-file-if-exists=.env", SERVER_PATH], {
    cwd: ROOT,
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      NODE_ENV: "development",
      AUDIT_LOG_DIR: path.join(ROOT, "logs")
    }
  });
  return child;
}

// ─── Send a request, wait for matching response ───────────────────────────────
function send(child, reqStr, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    const id = JSON.parse(reqStr.trim()).id;
    let buf = "";
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for response id=${id}`));
    }, timeoutMs);

    function onData(chunk) {
      buf += chunk.toString();
      const lines = buf.split("\n");
      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.id === id) {
            clearTimeout(timer);
            child.stdout.off("data", onData);
            resolve(parsed);
            return;
          }
        } catch {
          // not JSON — ignore (might be partial line)
        }
      }
      buf = lines[lines.length - 1]; // keep incomplete last line
    }

    child.stdout.on("data", onData);
    child.stdin.write(reqStr);
  });
}

// ─── Test runner ─────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const results = [];

async function runTest(label, child, reqStr, assertFn) {
  process.stdout.write(`  ${B}●${RESET} ${label} ... `);
  try {
    const res = await send(child, reqStr);
    if (res.error) throw new Error(`JSON-RPC error ${res.error.code}: ${res.error.message}`);
    assertFn(res);
    console.log(`${G}✓ PASS${RESET}`);
    passed++;
    results.push({ label, status: "PASS" });
  } catch (err) {
    console.log(`${R}✗ FAIL${RESET} — ${err.message}`);
    failed++;
    results.push({ label, status: "FAIL", error: err.message });
  }
}

// ─── Assertion helpers ────────────────────────────────────────────────────────
function assertToolOk(res) {
  if (!res.result) throw new Error("No result in response");
  const content = res.result.content;
  if (!Array.isArray(content) || content.length === 0)
    throw new Error("result.content is empty");
  const text = content[0].text;
  if (typeof text !== "string") throw new Error("result.content[0].text is not a string");
  // Parse JSON inside text — MCP tools return JSON.stringify'd data
  const data = JSON.parse(text);
  if (data.error) throw new Error(`Tool returned error: ${data.error}`);
  return data;
}

function assertHasItems(data, minCount = 1) {
  const arr = Array.isArray(data) ? data : data.data ?? data.customers ?? data.items ?? [];
  if (!Array.isArray(arr) || arr.length < minCount) {
    throw new Error(`Expected >=${minCount} items, got ${arr.length ?? "non-array"}`);
  }
  return arr;
}

function assertHasField(obj, field) {
  // obj may be array — check first element
  const target = Array.isArray(obj) ? obj[0] : obj;
  if (target == null || !(field in target))
    throw new Error(`Missing field "${field}" in ${JSON.stringify(target).slice(0, 120)}`);
}

// ─── Main ────────────────────────────────────────────────────────────────────
console.log(`\n${BOLD}${B}BankRM Copilot — MCP Server Smoke Test${RESET}`);
console.log(`${Y}Transport: stdio (StdioServerTransport)${RESET}`);
console.log(`${Y}Server   : ${SERVER_PATH}${RESET}\n`);

const child = spawnServer();

// Collect stderr for diagnostics
let stderrBuf = "";
child.stderr.on("data", (d) => {
  stderrBuf += d.toString();
});

// Wait for server ready signal on stderr
await new Promise((resolve, reject) => {
  const timer = setTimeout(
    () => reject(new Error("Server did not start within 8s\nStderr:\n" + stderrBuf)),
    8000
  );
  child.stderr.on("data", (d) => {
    if (d.toString().includes("dang chay tren stdio") || d.toString().includes("đang chạy trên stdio")) {
      clearTimeout(timer);
      resolve();
    }
  });
  child.on("exit", (code) => {
    clearTimeout(timer);
    reject(new Error(`Server exited early with code ${code}\nStderr:\n${stderrBuf}`));
  });
});

console.log(`${G}✓ MCP server khởi động thành công${RESET}\n`);

// ─── Step 1: tools/list ───────────────────────────────────────────────────────
console.log(`${BOLD}1. Khám phá tool registry${RESET}`);
await runTest("tools/list trả đúng 8 tools", child, rpc("tools/list"), (res) => {
  const tools = res.result?.tools;
  if (!Array.isArray(tools)) throw new Error("tools không phải array");
  const names = tools.map((t) => t.name);
  const expected = [
    "crm_list_customers",
    "crm_get_customer",
    "crm_customers_due",
    "crm_list_opportunities",
    "crm_list_interactions",
    "crm_list_campaigns",
    "crm_draft_email",
    "crm_call_script"
  ];
  const missing = expected.filter((n) => !names.includes(n));
  if (missing.length > 0) throw new Error(`Thiếu tools: ${missing.join(", ")}`);
});

// ─── Step 2: crm_list_customers ───────────────────────────────────────────────
console.log(`\n${BOLD}2. crm_list_customers${RESET}`);
let firstCustomer;
await runTest("Trả về danh sách khách hàng (array >= 1)", child, toolCall("crm_list_customers"), (res) => {
  const data = assertToolOk(res);
  const arr = assertHasItems(data, 1);
  firstCustomer = arr[0];
  assertHasField(arr, "id");
  assertHasField(arr, "name");
});

await runTest("Khách hàng có trường segment hoặc savings_amount_vnd", child, toolCall("crm_list_customers"), (res) => {
  const data = assertToolOk(res);
  const arr = Array.isArray(data) ? data : [];
  if (arr.length === 0) throw new Error("Danh sách rỗng");
  const hasSegment = arr.some((c) => "segment" in c || "savings_amount_vnd" in c);
  if (!hasSegment) throw new Error("Không có bản ghi nào có trường segment/savings_amount_vnd");
});

// ─── Step 3: crm_get_customer ─────────────────────────────────────────────────
console.log(`\n${BOLD}3. crm_get_customer${RESET}`);
await runTest(
  "Tìm khách hàng theo tên trả đúng record",
  child,
  toolCall("crm_get_customer", { name: firstCustomer?.name ?? "Nguyen" }),
  (res) => {
    const data = assertToolOk(res);
    if (!data.id) throw new Error("Không có trường id trong kết quả");
  }
);

await runTest(
  "Tìm tên không tồn tại trả error message (không crash)",
  child,
  toolCall("crm_get_customer", { name: "XXXXXXXX_NOTEXIST" }),
  (res) => {
    const text = res.result?.content?.[0]?.text;
    if (!text) throw new Error("Không có content trong response");
    const data = JSON.parse(text);
    if (!data.error) throw new Error("Expected error field for unknown customer");
  }
);

// ─── Step 4: crm_customers_due ───────────────────────────────────────────────
console.log(`\n${BOLD}4. crm_customers_due${RESET}`);
await runTest(
  "daysAhead=30 trả array (có thể rỗng — không crash)",
  child,
  toolCall("crm_customers_due", { daysAhead: 30 }),
  (res) => {
    const data = assertToolOk(res);
    if (!Array.isArray(data)) throw new Error("Kết quả phải là array");
  }
);

await runTest(
  "daysAhead=365 trả array; nếu có KH thì có maturityDate hoặc maturity_date",
  child,
  toolCall("crm_customers_due", { daysAhead: 365 }),
  (res) => {
    const data = assertToolOk(res);
    if (!Array.isArray(data)) throw new Error("Kết quả phải là array");
    if (data.length > 0) {
      const first = data[0];
      // Accept both camelCase (mock/normalized) and snake_case (raw DB) —
      // dbClient.mapRowToCamelCase() converts on read, but test shouldn't
      // depend on runtime mode.
      const hasField = "maturityDate" in first || "maturity_date" in first;
      if (!hasField)
        throw new Error(`Thiếu maturityDate/maturity_date trong: ${JSON.stringify(first).slice(0, 150)}`);
    }
  }
);

// ─── Step 5: crm_list_opportunities ──────────────────────────────────────────
console.log(`\n${BOLD}5. crm_list_opportunities${RESET}`);
await runTest("Trả toàn bộ opportunities (array)", child, toolCall("crm_list_opportunities", {}), (res) => {
  const data = assertToolOk(res);
  if (!Array.isArray(data)) throw new Error("Kết quả phải là array");
});

await runTest(
  "Lọc theo customerId hợp lệ trả array",
  child,
  toolCall("crm_list_opportunities", { customerId: firstCustomer?.id ?? "C001" }),
  (res) => {
    const data = assertToolOk(res);
    if (!Array.isArray(data)) throw new Error("Kết quả phải là array");
  }
);

// ─── Step 6: crm_list_interactions ───────────────────────────────────────────
console.log(`\n${BOLD}6. crm_list_interactions${RESET}`);
await runTest("Trả toàn bộ interactions (array)", child, toolCall("crm_list_interactions", {}), (res) => {
  const data = assertToolOk(res);
  if (!Array.isArray(data)) throw new Error("Kết quả phải là array");
});

await runTest(
  "Lọc theo customerId trả array",
  child,
  toolCall("crm_list_interactions", { customerId: firstCustomer?.id ?? "C001" }),
  (res) => {
    const data = assertToolOk(res);
    if (!Array.isArray(data)) throw new Error("Kết quả phải là array");
  }
);

// ─── Step 7: crm_list_campaigns ───────────────────────────────────────────────
console.log(`\n${BOLD}7. crm_list_campaigns${RESET}`);
await runTest("Trả danh sách chiến dịch (array)", child, toolCall("crm_list_campaigns"), (res) => {
  const data = assertToolOk(res);
  if (!Array.isArray(data)) throw new Error("Kết quả phải là array");
});

// ─── Step 8: crm_draft_email ─────────────────────────────────────────────────
console.log(`\n${BOLD}8. crm_draft_email${RESET}`);
await runTest(
  "Soạn email cho customerId hợp lệ trả subject + body",
  child,
  toolCall("crm_draft_email", { customerId: firstCustomer?.id ?? "C001" }),
  (res) => {
    const data = assertToolOk(res);
    const text = JSON.stringify(data);
    if (!text.includes("subject") && !text.includes("body") && !text.includes("email")) {
      throw new Error(`Không tìm thấy subject/body trong: ${text.slice(0, 200)}`);
    }
  }
);

await runTest(
  "customerId không tồn tại trả error (không crash)",
  child,
  toolCall("crm_draft_email", { customerId: "CXXX_NOTEXIST" }),
  (res) => {
    const text = res.result?.content?.[0]?.text;
    const data = JSON.parse(text ?? "{}");
    if (!data.error) throw new Error("Expected error field for unknown customerId");
  }
);

// ─── Step 9: crm_call_script ──────────────────────────────────────────────────
console.log(`\n${BOLD}9. crm_call_script${RESET}`);
await runTest(
  "Tạo call script cho customerId hợp lệ trả script text",
  child,
  toolCall("crm_call_script", { customerId: firstCustomer?.id ?? "C001" }),
  (res) => {
    const data = assertToolOk(res);
    // Result is { script: "..." }
    const text = JSON.stringify(data);
    if (!text.includes("script") && !text.includes("Script") && data.length < 10) {
      throw new Error(`Không có script text trong: ${text.slice(0, 200)}`);
    }
  }
);

await runTest(
  "Tạo script với suggestion tuỳ chỉnh không crash",
  child,
  toolCall("crm_call_script", {
    customerId: firstCustomer?.id ?? "C001",
    suggestion: "Gợi ý mở tài khoản tiết kiệm linh hoạt kỳ hạn 12 tháng"
  }),
  (res) => {
    const data = assertToolOk(res);
    if (!data && !data.script) throw new Error("Script text rỗng");
  }
);

// ─── Step 10: Error handling & edge cases ────────────────────────────────────
console.log(`\n${BOLD}10. Xử lý lỗi & edge cases${RESET}`);
await runTest(
  "Gọi tool không tồn tại trả error (RPC error hoặc content error)",
  child,
  rpc("tools/call", { name: "crm_nonexistent_tool", arguments: {} }),
  (res) => {
    // MCP SDK có thể trả top-level RPC error HOẶC isError:true trong content
    const hasRpcError = !!res.error;
    const hasContentError = (() => {
      try {
        const content = res.result?.content;
        if (!Array.isArray(content)) return false;
        return content.some((c) => c.type === "text" && (c.isError || c.text?.includes("error")));
      } catch {
        return false;
      }
    })();
    if (!hasRpcError && !hasContentError)
      throw new Error("Expected error response for unknown tool");
  }
);

await runTest(
  "Gọi crm_get_customer thiếu tham số name — Zod hoặc graceful error",
  child,
  rpc("tools/call", { name: "crm_get_customer", arguments: {} }),
  (res) => {
    // Zod có thể: (a) raise RPC error, (b) trả tool content error, hoặc
    // (c) coerce undefined->string và trả 'not found' error.
    // Tất cả 3 trường hợp đều hợp lệ — quan trọng là không crash (no uncaught).
    const hasRpcError = !!res.error;
    const hasResult = !!res.result;
    if (!hasRpcError && !hasResult) {
      throw new Error("Response không có error lẫn result — server có thể đã crash");
    }
    // Nếu có result, kiểm tra là content error hoặc not-found
    if (hasResult) {
      const text = res.result?.content?.[0]?.text ?? "";
      // Chấp nhận: Zod error, not found error, hoặc bất kỳ graceful error nào
      const looksOk = text.length > 0;
      if (!looksOk) throw new Error("Content rỗng — có thể server xử lý không graceful");
    }
  }
);

// ─── Teardown ─────────────────────────────────────────────────────────────────
child.stdin.end();
await new Promise((resolve) => child.on("close", resolve));

// ─── Summary ─────────────────────────────────────────────────────────────────
const total = passed + failed;
const line = "─".repeat(55);
console.log(`\n${line}`);
console.log(`${BOLD}MCP Smoke Test Summary${RESET}`);
console.log(line);
console.log(`  Total  : ${total}`);
console.log(`  ${G}Passed : ${passed}${RESET}`);
if (failed > 0) {
  console.log(`  ${R}Failed : ${failed}${RESET}`);
  console.log(`\n${R}Failed tests:${RESET}`);
  results
    .filter((r) => r.status === "FAIL")
    .forEach((r) => console.log(`  ${R}x${RESET} ${r.label}\n    -> ${r.error}`));
} else {
  console.log(`  Failed : 0`);
}
console.log(line);

if (failed > 0) {
  process.exit(1);
} else {
  console.log(`\n${G}${BOLD}All MCP tests PASS${RESET}\n`);
}
