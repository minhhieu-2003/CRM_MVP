import assert from "node:assert/strict";
import test from "node:test";
import { createLlmPiiTokenVault } from "../../src/services/llmPiiTokenVault.js";

test("tokenizes detectable customer PII and restores it only in application memory", () => {
  const vault = createLlmPiiTokenVault();
  const raw = [
    "Nguyễn Văn An và Đỗ Thu Hà",
    "khach nguyen van an co nhu cau",
    "C001 O002",
    "an@example.com 0912345678",
    "CCCD: 012345678901",
    "địa chỉ: 12 Nguyễn Trãi",
    "987654321098"
  ].join("; ");
  const protectedText = vault.protect(raw);

  assert.match(protectedText, /\[\[BANKRM_PII_[a-z]+_\d+\]\]/);
  assert.doesNotMatch(
    protectedText,
    /Nguyễn Văn An|Đỗ Thu Hà|nguyen van an|C001|O002|an@example\.com|0912345678|012345678901|987654321098|12 Nguyễn Trãi/i
  );
  assert.equal(vault.restore(protectedText), raw);
  assert.deepEqual(
    vault.restoreValue({ customerId: vault.protect("C001"), nested: [vault.protect("O002")] }),
    { customerId: "C001", nested: ["O002"] }
  );
});

test("keeps business amounts and dates visible to the model", () => {
  const vault = createLlmPiiTokenVault();
  const safeFacts = "Số dư 1.200.000.000 đồng, đáo hạn 20/07/2026, xác suất 82%.";

  assert.equal(vault.protect(safeFacts), safeFacts);
  assert.equal(vault.tokenCount(), 0);
});

test("protects PII values embedded in serialized observation fields", () => {
  const vault = createLlmPiiTokenVault();
  const serialized = JSON.stringify({
    name: "mai van binh",
    address: "12 Nguyễn Trãi, Hà Nội",
    accountNumber: "9876543210",
    phoneNumber: "0912345678",
    nested: { name: "nguyen van an", note: "hom nay" }
  });
  const protectedText = vault.protect(serialized);

  assert.doesNotMatch(protectedText, /mai van binh|nguyen van an/);
  assert.match(protectedText, /hom nay/);
  assert.doesNotMatch(protectedText, /12 Nguyễn Trãi|9876543210|0912345678/);
  assert.equal(vault.restore(protectedText), serialized);
});

test("protects lowercase Vietnamese and common lowercase English customer names", () => {
  const vault = createLlmPiiTokenVault();
  const raw = "tu van cho nguyen van an hom nay; tu van cho dinh van binh hom nay; alice smith.";
  const protectedText = vault.protect(raw);

  assert.doesNotMatch(protectedText, /nguyen van an|dinh van binh|alice smith/i);
  assert.equal(vault.restore(protectedText), raw);
  assert.equal(
    vault.protect("customer opportunity campaign; savings product active."),
    "customer opportunity campaign; savings product active."
  );
});

test("protects generic lowercase names without relying on a surname allowlist", () => {
  const cases = [
    { name: "mai van binh", raw: "mai van binh", visible: [] },
    { name: "truong thi lan", raw: "truong thi lan", visible: [] },
    { name: "le a", raw: "le a", visible: [] },
    {
      name: "mai van binh",
      raw: "tu van cho mai van binh hom nay",
      visible: ["tu van cho", "hom nay"]
    },
    {
      name: "truong thi lan",
      raw: "soan email cho truong thi lan",
      visible: ["soan email cho"]
    },
    { name: "le a", raw: "tim khach le a co nhu cau", visible: ["tim khach", "co nhu cau"] },
    {
      name: "mai van binh",
      raw: "mai van binh co nhu cau gui tiet kiem",
      visible: ["co nhu cau gui tiet kiem"]
    },
    {
      name: "mai van binh",
      raw: "xem ho so cua mai van binh",
      visible: ["xem ho so cua"]
    },
    {
      name: "truong thi lan",
      raw: "so du cua truong thi lan",
      visible: ["so du cua"]
    },
    {
      name: "le a",
      raw: "thong tin cua le a",
      visible: ["thong tin cua"]
    }
  ];

  for (const { name, raw, visible } of cases) {
    const vault = createLlmPiiTokenVault();
    const protectedText = vault.protect(raw);

    assert.match(protectedText, /\[\[BANKRM_PII_[a-z]+_\d+\]\]/);
    assert.doesNotMatch(protectedText, new RegExp(name, "i"));
    assert.equal(vault.restore(protectedText), raw);
    for (const phrase of visible) assert.match(protectedText, new RegExp(phrase, "i"));
  }
});

test("protects generic names in contextual and unknown serialized string fields", () => {
  const vault = createLlmPiiTokenVault();
  const raw = JSON.stringify({
    note: "tu van cho mai van binh hom nay",
    assignee: "truong thi lan",
    contact: "le a",
    product: "tiet kiem linh hoat"
  });
  const protectedText = vault.protect(raw);

  assert.doesNotMatch(protectedText, /mai van binh|truong thi lan|"le a"/i);
  assert.match(protectedText, /tu van cho/);
  assert.match(protectedText, /hom nay/);
  assert.match(protectedText, /tiet kiem linh hoat/);
  assert.equal(vault.restore(protectedText), raw);
});

test("protects foreign formatted phone numbers", () => {
  const vault = createLlmPiiTokenVault();
  const raw = "Call +1 (415) 555-2671 or +44 20 7946 0958.";
  const protectedText = vault.protect(raw);

  assert.doesNotMatch(protectedText, /415|555-2671|7946|0958/);
  assert.equal(vault.restore(protectedText), raw);
});

test("protects unlabeled spaced account-like identifiers while preserving amounts and dates", () => {
  const vault = createLlmPiiTokenVault();
  const identifiers = "9876 5432 1098; 1234 5678 9012 3456; 4111-1111-1111-1111; 1234.5678.9012";
  const protectedIdentifiers = vault.protect(identifiers);

  assert.doesNotMatch(
    protectedIdentifiers,
    /9876 5432 1098|1234 5678 9012 3456|4111-1111-1111-1111|1234\.5678\.9012/
  );
  assert.equal(vault.restore(protectedIdentifiers), identifiers);

  const businessFacts =
    "Số dư 1 200 000 000 đồng; ngày 20 07 2026; đáo hạn 20/07/2026; xác suất 82%.";
  assert.equal(vault.protect(businessFacts), businessFacts);

  const groupedBusinessFacts =
    "S\u1ed1 d\u01b0 1.200.000.000 \u0111\u1ed3ng; ng\u00e0y 20.07.2026; ng\u00e0y 2026-07-20.";
  assert.equal(vault.protect(groupedBusinessFacts), groupedBusinessFacts);
});

test("never re-tokenizes generated vault tokens and restores stably", () => {
  for (let index = 0; index < 1_000; index += 1) {
    const vault = createLlmPiiTokenVault();
    const raw = "9876 5432 1098";
    const protectedOnce = vault.protect(raw);
    const protectedTwice = vault.protect(protectedOnce);

    assert.match(protectedOnce, /^\[\[BANKRM_PII_[a-z]{12}_1\]\]$/);
    assert.equal(protectedTwice, protectedOnce);
    assert.equal(vault.tokenCount(), 1);
    assert.equal(vault.restore(protectedTwice), raw);

    const serialized = JSON.stringify({
      name: "nguyen van an",
      accountNumber: "987654321098"
    });
    const protectedJsonOnce = vault.protect(serialized);
    const protectedJsonTwice = vault.protect(protectedJsonOnce);
    assert.equal(protectedJsonTwice, protectedJsonOnce);
    assert.equal(vault.restore(protectedJsonTwice), serialized);
  }
});

test("does not trust user-supplied strings that resemble vault tokens", () => {
  const vault = createLlmPiiTokenVault();
  const raw = [
    "[[BANKRM_PII_attacker_9876543210]]",
    "[[BANKRM_PII_attacker_9876 5432 1098]]",
    "[[BANKRM_PII_attacker_4111-1111-1111-1111]]",
    "[[BANKRM_PII_attacker_1234.5678.9012]]"
  ].join("; ");
  const protectedText = vault.protect(raw);

  assert.doesNotMatch(
    protectedText,
    /9876543210|9876 5432 1098|4111-1111-1111-1111|1234\.5678\.9012/
  );
  assert.equal(vault.restore(protectedText), raw);
  assert.equal(vault.tokenCount(), 4);
});
