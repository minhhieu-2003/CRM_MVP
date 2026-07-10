import fs from "fs";
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
  fs.readFileSync(new URL("../../src/data/mock/bank_a_crm_test_cases.json", import.meta.url), "utf8")
);

const endpointMap = {
  customers: listCustomers,
  opportunities: listOpportunities,
  interactions: listInteractions,
  campaigns: listCampaigns
};

let failed = 0;

for (const testCase of testCases) {
  try {
    await runTestCase(testCase);
    console.log(`PASS ${testCase.id}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${testCase.id}: ${error.message}`);
  }
}

if (failed > 0) {
  console.error(`\n${failed}/${testCases.length} CRM test cases failed.`);
  process.exit(1);
}

console.log(`\nAll ${testCases.length} CRM test cases passed.`);

async function runTestCase(testCase) {
  if (testCase.type === "chat") {
    const result = await routeConversation({
      conversationId: testCase.id,
      message: testCase.prompt
    });
    assertChatResult(testCase, result);
    return;
  }

  if (testCase.type === "chat_sequence") {
    let result;
    for (const prompt of testCase.prompts) {
      result = await routeConversation({
        conversationId: testCase.id,
        message: prompt
      });
    }
    assertChatResult(testCase, result);
    return;
  }

  if (testCase.type === "draft_email") {
    const customer = await requireCustomer(testCase.customerId);
    const draft = await draftEmailForCustomer(
      customer,
      "Em đề xuất tái tục một phần và cân nhắc sản phẩm phù hợp."
    );
    const combined = `${draft.templateId}\n${draft.subject}\n${draft.body}`;
    assertKeywords(combined, testCase.expectedKeywords);
    return;
  }

  if (testCase.type === "call_script") {
    const customer = await requireCustomer(testCase.customerId);
    const script = await draftCallScript(
      customer,
      "Em có thể gửi thêm đề xuất cá nhân hóa sau cuộc gọi."
    );
    assertKeywords(script, testCase.expectedKeywords);
    return;
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
  }
}

function assertChatResult(testCase, result) {
  if (result.context.currentModule !== testCase.expectedContext) {
    throw new Error(
      `Expected context ${testCase.expectedContext}, got ${result.context.currentModule}`
    );
  }

  const sourceEndpoints = result.sources.map((source) => source.endpoint);
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
