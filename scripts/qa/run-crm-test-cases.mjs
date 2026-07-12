import fs from "fs";
import path from "path";
process.env.CRM_BUSINESS_DATE = "2026-07-07";
import { routeConversation } from "../../src/services/mcpContextEngine.js";
import {
  draftCallScript,
  draftEmailForCustomer,
  getCustomerById,
  listCampaigns,
  listCustomers,
  listInteractions,
  listOpportunities
} from "../../src/services/crmService.js";

const testCases = JSON.parse(
  fs.readFileSync(
    new URL("../../src/data/mock/bank_a_crm_test_cases.json", import.meta.url),
    "utf8"
  )
);

const endpointMap = {
  customers: listCustomers,
  opportunities: listOpportunities,
  interactions: listInteractions,
  campaigns: listCampaigns
};

const isReportMode = process.argv.includes("--report");
let failedCount = 0;
let passCount = 0;
const results = [];
let missingSourcesCount = 0;

for (const testCase of testCases) {
  const startTime = performance.now();
  let testCaseResult = { id: testCase.id, type: testCase.type, passed: false };

  try {
    const result = await runTestCase(testCase);
    if (result && result.missingSources) {
      missingSourcesCount++;
      throw new Error("Response is missing sources");
    }
    passCount++;
    testCaseResult.passed = true;
    console.log(`PASS ${testCase.id}`);
  } catch (error) {
    failedCount++;
    testCaseResult.reason = error.message;
    console.error(`FAIL ${testCase.id}: ${error.message}`);
  }

  const endTime = performance.now();
  testCaseResult.latency = endTime - startTime;
  results.push(testCaseResult);
}

const totalCases = testCases.length;
const accuracy = passCount / totalCases;
const latencies = results.map((r) => r.latency).sort((a, b) => a - b);
const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length || 0;
const p95Index = Math.max(0, Math.ceil(latencies.length * 0.95) - 1);
const p95Latency = latencies[p95Index] || 0;
const failedCasesList = results
  .filter((r) => !r.passed)
  .map((r) => ({ id: r.id, reason: r.reason }));

console.log(`\n--- EVALUATION REPORT ---`);
console.log(`Total Cases: ${totalCases}`);
console.log(`Passed: ${passCount}`);
console.log(`Failed: ${failedCount}`);
console.log(`Accuracy: ${(accuracy * 100).toFixed(2)}%`);
console.log(`Average Latency: ${avgLatency.toFixed(2)}ms`);
console.log(`P95 Latency: ${p95Latency.toFixed(2)}ms`);
console.log(`Missing Sources: ${missingSourcesCount}`);

if (failedCount > 0) {
  console.log(`\nFailed Cases:`);
  failedCasesList.forEach((c) => console.log(`  - ${c.id}: ${c.reason}`));
}

const reportData = {
  totalCases,
  passCount,
  failedCount,
  accuracy,
  avgLatencyMs: avgLatency,
  p95LatencyMs: p95Latency,
  missingSourcesCount,
  failedCases: failedCasesList,
  results
};

if (isReportMode) {
  const reportsDir = path.join(process.cwd(), "reports");
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }
  const reportPath = path.join(reportsDir, "eval-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2), "utf8");
  console.log(`\nReport saved to ${reportPath}`);
}

if (accuracy < 0.85 || missingSourcesCount > 0) {
  console.error(
    `\nFAILED CI: Accuracy must be >= 85% and no responses can be missing sources. Current accuracy: ${(accuracy * 100).toFixed(2)}%, Missing sources count: ${missingSourcesCount}`
  );
  process.exit(1);
}

console.log(`\nAll criteria met successfully.`);
process.exit(0);

async function runTestCase(testCase) {
  let missingSources = false;

  if (testCase.type === "chat") {
    const result = await routeConversation({
      conversationId: testCase.id,
      message: testCase.prompt
    });
    if (!result.sources || result.sources.length === 0) {
      missingSources = true;
    }
    assertChatResult(testCase, result);
    return { missingSources };
  }

  if (testCase.type === "chat_sequence") {
    let result;
    for (const prompt of testCase.prompts) {
      result = await routeConversation({
        conversationId: testCase.id,
        message: prompt
      });
      if (!result.sources || result.sources.length === 0) {
        missingSources = true;
      }
    }
    assertChatResult(testCase, result);
    return { missingSources };
  }

  if (testCase.type === "draft_email") {
    const customer = await requireCustomer(testCase.customerId);
    const draft = await draftEmailForCustomer(
      customer,
      "Em đề xuất tái tục một phần và cân nhắc sản phẩm phù hợp."
    );
    const combined = `${draft.templateId}\n${draft.subject}\n${draft.body}`;
    assertKeywords(combined, testCase.expectedKeywords);
    return { missingSources: false };
  }

  if (testCase.type === "call_script") {
    const customer = await requireCustomer(testCase.customerId);
    const script = await draftCallScript(
      customer,
      "Em có thể gửi thêm đề xuất cá nhân hóa sau cuộc gọi."
    );
    assertKeywords(script, testCase.expectedKeywords);
    return { missingSources: false };
  }

  if (testCase.type === "crm_endpoint") {
    const list = await endpointMap[testCase.endpoint]?.();
    if (!Array.isArray(list)) {
      throw new Error(`Unknown endpoint fixture: ${testCase.endpoint}`);
    }
    if (list.length < testCase.expectedCountAtLeast) {
      throw new Error(
        `Expected at least ${testCase.expectedCountAtLeast} records, got ${list.length}`
      );
    }
    return { missingSources: false };
  }
}

function assertChatResult(testCase, result) {
  if (result.context.currentModule !== testCase.expectedContext) {
    throw new Error(
      `Expected context ${testCase.expectedContext}, got ${result.context.currentModule}`
    );
  }

  const sourceEndpoints = result.sources ? result.sources.map((source) => source.endpoint) : [];
  for (const endpoint of testCase.expectedSources) {
    if (!sourceEndpoints.includes(endpoint)) {
      throw new Error(`Missing source ${endpoint}`);
    }
  }

  assertKeywords(result.reply, testCase.expectedKeywords);
}

function assertKeywords(text, keywords = []) {
  for (const keyword of keywords) {
    if (!text.includes(keyword)) {
      throw new Error(`Missing keyword "${keyword}"`);
    }
  }
}

async function requireCustomer(customerId) {
  const customer = await getCustomerById(customerId);
  if (!customer) throw new Error(`Unknown customer ${customerId}`);
  return customer;
}
