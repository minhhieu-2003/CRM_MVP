import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import test from "node:test";
import { assertSensitiveClaimsGrounded } from "../../src/services/groundingValidator.js";

function isUngrounded(kind) {
  return (error) => error.code === "UNGROUNDED_SENSITIVE_FACT" && error.kind === kind;
}

test("grounds money and percentages only from typed evidence", () => {
  const evidence = {
    customer: { id: "C001", savingsAmountVnd: 1_200_000_000, maturityDate: "2026-07-20" },
    opportunity: { estimatedValueVnd: 85_000_000, score: 0.82 },
    profile: { age: 30 }
  };

  assert.doesNotThrow(() =>
    assertSensitiveClaimsGrounded(
      "Khách C001 có số dư 1.200.000.000 ₫, cơ hội 85 triệu đồng, xác suất 82%, đáo hạn 20/07/2026.",
      evidence
    )
  );
  assert.doesNotThrow(() =>
    assertSensitiveClaimsGrounded("Số dư 1,2 tỷ.", {
      savingsAmountVnd: 1_200_000_000
    })
  );
  assert.throws(
    () => assertSensitiveClaimsGrounded("Phí là 30 đồng.", evidence),
    isUngrounded("money")
  );
  assert.throws(
    () => assertSensitiveClaimsGrounded("Xác suất là 30%.", evidence),
    isUngrounded("percentage")
  );
});

test("rejects prefix, suffix, and financial-noun money without evidence", () => {
  const replies = [
    "Số dư 999999999",
    "Giá trị là VND 999999999",
    "Khoản tiền 999.999.999 VNĐ",
    "Hạn mức 999.999.999 ₫"
  ];

  for (const reply of replies) {
    assert.throws(() => assertSensitiveClaimsGrounded(reply, {}), isUngrounded("money"));
  }
});

test("normalizes decomposed Vietnamese currency text before matching", () => {
  const decomposed = "Số tiền là 1.000 đồng".normalize("NFD");
  assert.doesNotThrow(() =>
    assertSensitiveClaimsGrounded(decomposed, { approvedAmountVnd: 1_000 })
  );
  assert.throws(
    () => assertSensitiveClaimsGrounded(decomposed, { age: 1_000 }),
    isUngrounded("money")
  );
});

test("supports explicit money and percentage evidence strings", () => {
  assert.doesNotThrow(() =>
    assertSensitiveClaimsGrounded("Giá trị VND 450000000, tỷ lệ 65%.", {
      summary: "Giá trị 450 triệu đồng; xác suất 65%."
    })
  );
});

test("scopes dates and money to the referenced customer", () => {
  const evidence = {
    customers: [
      {
        id: "C001",
        name: "Nguyễn Văn An",
        savingsAmountVnd: 100_000_000,
        maturityDate: "2026-07-20"
      },
      {
        id: "C002",
        name: "Trần Thị Mai",
        savingsAmountVnd: 900_000_000,
        maturityDate: "2099-12-31"
      }
    ]
  };

  assert.throws(
    () => assertSensitiveClaimsGrounded("C001 có số dư 900.000.000 đồng.", evidence),
    isUngrounded("money")
  );
  assert.throws(
    () => assertSensitiveClaimsGrounded("Nguyễn Văn An đáo hạn 31/12/2099.", evidence),
    isUngrounded("date")
  );
  assert.throws(
    () =>
      assertSensitiveClaimsGrounded(
        "C001 có số dư 900.000.000 đồng. C002 đang được theo dõi.",
        evidence
      ),
    isUngrounded("money")
  );
  assert.throws(
    () => assertSensitiveClaimsGrounded("C001 và C002 có số dư 900.000.000 đồng.", evidence),
    isUngrounded("money")
  );
  assert.doesNotThrow(() =>
    assertSensitiveClaimsGrounded(
      "Nguyễn Văn An (C001) có số dư 100.000.000 đồng, đáo hạn 20/07/2026.",
      evidence
    )
  );
  assert.doesNotThrow(() =>
    assertSensitiveClaimsGrounded(
      "C001 có số dư 100.000.000 đồng. C002 có số dư 900.000.000 đồng.",
      evidence
    )
  );
});

test("scopes customer and CRM record identifiers to the same entity", () => {
  const evidence = {
    customers: [
      { id: "C001", name: "Nguyen Van An" },
      { id: "C002", name: "Tran Thi Mai" }
    ],
    records: [
      { id: "O001", customerId: "C001" },
      { id: "O002", customerId: "C002" },
      { id: "I001", customerId: "C001" },
      { id: "I002", customerId: "C002" },
      { id: "CP001", customerId: "C001" },
      { id: "CP002", customerId: "C002" }
    ]
  };

  assert.throws(
    () => assertSensitiveClaimsGrounded("Nguyen Van An là khách hàng C002.", evidence),
    isUngrounded("customer-id")
  );
  assert.throws(
    () => assertSensitiveClaimsGrounded("C002 là khách hàng Nguyen Van An.", evidence),
    isUngrounded("customer-id")
  );
  for (const recordId of ["O002", "I002", "CP002"]) {
    assert.throws(
      () => assertSensitiveClaimsGrounded(`C001 có bản ghi ${recordId}.`, evidence),
      isUngrounded("record-id")
    );
  }
  assert.doesNotThrow(() =>
    assertSensitiveClaimsGrounded("Nguyen Van An (C001) có O001, I001 và CP001.", evidence)
  );
});

test("rejects signed and ranged sensitive values not present in evidence", () => {
  const evidence = { amountVnd: 500, score: 0.82 };

  for (const reply of ["VND -500", "-500 VND", "VND 500-900"]) {
    assert.throws(() => assertSensitiveClaimsGrounded(reply, evidence), isUngrounded("money"));
  }
  assert.throws(
    () => assertSensitiveClaimsGrounded("Xác suất -82%.", evidence),
    isUngrounded("percentage")
  );
});

test("canonicalizes compatibility digits, separators, and invisible format characters", () => {
  assert.throws(
    () => assertSensitiveClaimsGrounded("Khách Ｃ００１", {}),
    isUngrounded("customer-id")
  );
  assert.throws(
    () => assertSensitiveClaimsGrounded("Đáo hạn ３１／１２／２０９９", {}),
    isUngrounded("date")
  );
  assert.throws(
    () => assertSensitiveClaimsGrounded("Xác suất ９９％", {}),
    isUngrounded("percentage")
  );
  assert.throws(
    () => assertSensitiveClaimsGrounded("Khách C\u200b001", {}),
    isUngrounded("customer-id")
  );
});

test("does not infer money or percentages from similarly named fields", () => {
  const evidence = { customerValueScore: 30, rateLimit: 30, age: 30 };

  assert.throws(
    () => assertSensitiveClaimsGrounded("Giá trị VND 30.", evidence),
    isUngrounded("money")
  );
  assert.throws(
    () => assertSensitiveClaimsGrounded("Tỷ lệ 30%.", evidence),
    isUngrounded("percentage")
  );
});

test("uses strict tolerances for money and percentage claims", () => {
  const evidence = { amountVnd: 1_000_000_000, score: 0.82 };

  assert.throws(
    () => assertSensitiveClaimsGrounded("Giá trị VND 1019000000.", evidence),
    isUngrounded("money")
  );
  assert.throws(
    () => assertSensitiveClaimsGrounded("Xác suất 83%.", evidence),
    isUngrounded("percentage")
  );
});

test("walks deeply nested evidence without recursive stack overflow", () => {
  let evidence = { note: "safe" };
  for (let depth = 0; depth < 10_000; depth += 1) evidence = { child: evidence };

  assert.doesNotThrow(() => assertSensitiveClaimsGrounded("Đã kiểm tra.", evidence));
});

test("handles long numeric evidence in bounded time", () => {
  const startedAt = performance.now();
  assertSensitiveClaimsGrounded("Đã kiểm tra.", { note: "1".repeat(20_000) });
  const elapsedMs = performance.now() - startedAt;

  assert.ok(elapsedMs < 1_000, `grounding validation took ${elapsedMs.toFixed(1)} ms`);
});

test("detects unaccented financial nouns, textual percentages, and dotted dates", () => {
  const claims = [
    ["So du 999999999", "money"],
    ["Tiền: 999999999", "money"],
    ["Xác suất 99 phần trăm", "percentage"],
    ["Đáo hạn 31.12.2099", "date"]
  ];

  for (const [reply, kind] of claims) {
    assert.throws(() => assertSensitiveClaimsGrounded(reply, {}), isUngrounded(kind));
  }
});

test("grounds ordinary Vietnamese word-form money, percentages, and dates", () => {
  const evidence = {
    amountVnd: 900_000_000,
    score: 0.99,
    maturityDate: "2099-12-31"
  };

  assert.doesNotThrow(() =>
    assertSensitiveClaimsGrounded(
      "Số dư là chín trăm triệu đồng, tỷ lệ chín mươi chín phần trăm, ngày ba mươi mốt tháng mười hai năm hai nghìn không trăm chín mươi chín.",
      evidence
    )
  );
  for (const [reply, kind] of [
    ["So du la chin tram trieu dong.", "money"],
    ["Ty le chin muoi chin phan tram.", "percentage"],
    ["Ngay 31 thang 12 nam 2099.", "date"],
    ["Ngay ba muoi mot thang muoi hai nam hai nghin khong tram chin muoi chin.", "date"]
  ]) {
    assert.throws(() => assertSensitiveClaimsGrounded(reply, {}), isUngrounded(kind));
  }
});

test("grounds mixed-form Vietnamese verbal dates across ordinary punctuation", () => {
  const evidence = { maturityDate: "2099-12-31" };
  const replies = [
    "Ngay 31 thang muoi hai nam 2099.",
    "Ngay ba muoi mot thang 12 nam 2099.",
    "Ngay: 31, thang muoi hai, nam 2099!",
    "Ngay 31-12 nam 2099.",
    "Ngay 31/12, nam hai nghin khong tram chin muoi chin."
  ];

  for (const reply of replies) {
    assert.doesNotThrow(() => assertSensitiveClaimsGrounded(reply, evidence));
    assert.throws(() => assertSensitiveClaimsGrounded(reply, {}), isUngrounded("date"));
  }
});

test("grounds Vietnamese verbal dates without the optional ngay prefix", () => {
  const evidence = { maturityDate: "2099-12-31" };
  const replies = [
    "31 thang 12 nam 2099.",
    "Dao han 31 thang 12 nam 2099.",
    "Ba muoi mot thang muoi hai nam hai nghin khong tram chin muoi chin."
  ];

  for (const reply of replies) {
    assert.doesNotThrow(() => assertSensitiveClaimsGrounded(reply, evidence));
    assert.throws(() => assertSensitiveClaimsGrounded(reply, {}), isUngrounded("date"));
  }
});

test("fails closed for malformed marked Vietnamese date candidates", () => {
  const replies = [
    "Ngay 31 thang 13 nam 2099.",
    "Ngay 31 thang muoi hai nam khong-hop-le.",
    "Ngay ba-muoi-mot thang muoi-hai nam 20 chin chin."
  ];

  for (const reply of replies) {
    assert.throws(() => assertSensitiveClaimsGrounded(reply, {}), isUngrounded("date"));
  }
});

test("fails closed for unparseable connected number words in sensitive contexts", () => {
  for (const [reply, kind] of [
    ["So du mot nghin ty dong.", "money"],
    ["So du mot tram hai muoi ba nghin ty dong.", "money"],
    ["Ty le mot nghin ty phan tram.", "percentage"]
  ]) {
    assert.throws(() => assertSensitiveClaimsGrounded(reply, {}), isUngrounded(kind));
  }
});

test("treats bare large-magnitude number words as monetary claims", () => {
  const grounded = { amountVnd: 900_000_000 };
  for (const reply of ["Khach co chin tram trieu.", "Chin tram trieu."]) {
    assert.doesNotThrow(() => assertSensitiveClaimsGrounded(reply, grounded));
    assert.throws(() => assertSensitiveClaimsGrounded(reply, {}), isUngrounded("money"));
  }

  assert.throws(
    () => assertSensitiveClaimsGrounded("Gia tri khoang nua ty dong.", {}),
    isUngrounded("money")
  );
});

test("grounds customer names, phones, and accounts only from entity-scoped evidence", () => {
  const evidence = {
    customers: [
      {
        id: "C001",
        name: "Nguyễn Văn An",
        phone: "0912345678",
        accountNumber: "123456789012"
      },
      {
        id: "C002",
        name: "Trần Thị Mai",
        phone: "0987654321",
        accountNumber: "210987654321"
      }
    ]
  };

  assert.doesNotThrow(() =>
    assertSensitiveClaimsGrounded(
      "Khách hàng Nguyễn Văn An có số điện thoại 0912345678, tài khoản 123456789012.",
      evidence
    )
  );
  assert.doesNotThrow(() =>
    assertSensitiveClaimsGrounded("Nguyen Van An co so dien thoai 0912345678.", evidence)
  );
  for (const [reply, kind] of [
    ["Khách hàng Nguyễn Văn B.", "customer-name"],
    ["Nguyen Van B can duoc goi lai.", "customer-name"],
    ["Xin goi Nguyen Van B.", "customer-name"],
    ["Số điện thoại 0912345678.", "phone"],
    ["Tài khoản 123456789012.", "account"],
    ["STK 987654321098.", "account"]
  ]) {
    assert.throws(() => assertSensitiveClaimsGrounded(reply, {}), isUngrounded(kind));
  }
  assert.throws(
    () => assertSensitiveClaimsGrounded("C001 có số điện thoại 0987654321.", evidence),
    isUngrounded("phone")
  );
  assert.throws(
    () => assertSensitiveClaimsGrounded("C001 có tài khoản 210987654321.", evidence),
    isUngrounded("account")
  );
  assert.throws(
    () => assertSensitiveClaimsGrounded("C001 là khách hàng Lê Văn B.", evidence),
    isUngrounded("customer-name")
  );
  assert.throws(
    () => assertSensitiveClaimsGrounded("Nguyen Van B co so dien thoai 0912345678.", evidence),
    isUngrounded("customer-name")
  );
});

test("rejects compact and word-decimal sensitive formats unless exactly grounded", () => {
  assert.throws(() => assertSensitiveClaimsGrounded("Đáo hạn 31/12/99.", {}), isUngrounded("date"));

  assert.doesNotThrow(() =>
    assertSensitiveClaimsGrounded("Giá trị 900tr.", { amountVnd: 900_000_000 })
  );
  assert.throws(() => assertSensitiveClaimsGrounded("Giá trị 900tr.", {}), isUngrounded("money"));

  assert.doesNotThrow(() =>
    assertSensitiveClaimsGrounded("Tỷ lệ chín mươi chín phẩy năm phần trăm.", {
      score: 0.995
    })
  );
  assert.throws(
    () =>
      assertSensitiveClaimsGrounded("Tỷ lệ chín mươi chín phẩy năm phần trăm.", {
        score: 0.05
      }),
    isUngrounded("percentage")
  );

  assert.doesNotThrow(() =>
    assertSensitiveClaimsGrounded("Giá trị một phẩy hai tỷ.", {
      amountVnd: 1_200_000_000
    })
  );
  assert.throws(
    () =>
      assertSensitiveClaimsGrounded("Giá trị một phẩy hai tỷ.", {
        amountVnd: 2_000_000_000
      }),
    isUngrounded("money")
  );
});
