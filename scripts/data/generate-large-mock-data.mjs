import fs from "fs";
import path from "path";

function mulberry32(a) {
  return function () {
    var t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(12345); // Seeded random

function randomItem(arr) {
  return arr[Math.floor(random() * arr.length)];
}

function randomInt(min, max) {
  return Math.floor(random() * (max - min + 1)) + min;
}

const firstNames = [
  "Nguyễn",
  "Trần",
  "Lê",
  "Phạm",
  "Hoàng",
  "Huỳnh",
  "Phan",
  "Vũ",
  "Võ",
  "Đặng",
  "Bùi",
  "Đỗ",
  "Hồ",
  "Ngô",
  "Dương",
  "Lý"
];
const middleNames = [
  "Văn",
  "Thị",
  "Hữu",
  "Thanh",
  "Minh",
  "Đức",
  "Ngọc",
  "Gia",
  "Bảo",
  "Quốc",
  "Xuân",
  "Thu",
  "Hồng",
  "Tuấn",
  "Hoài"
];
const lastNames = [
  "An",
  "Anh",
  "Bình",
  "Cường",
  "Dũng",
  "Dương",
  "Đạt",
  "Hải",
  "Hào",
  "Hiếu",
  "Hòa",
  "Huy",
  "Hùng",
  "Khang",
  "Khánh",
  "Khoa",
  "Kiên",
  "Lâm",
  "Long",
  "Nam",
  "Nghĩa",
  "Phát",
  "Phong",
  "Phúc",
  "Quân",
  "Quang",
  "Quốc",
  "Sơn",
  "Tài",
  "Tâm",
  "Thắng",
  "Thành",
  "Thiên",
  "Thịnh",
  "Trung",
  "Tuấn",
  "Tùng",
  "Vinh",
  "Việt",
  "Châu",
  "Chi",
  "Diệp",
  "Hà",
  "Hân",
  "Hạnh",
  "Hoa",
  "Hương",
  "Huyền",
  "Lan",
  "Linh",
  "Ly",
  "Mai",
  "Ngọc",
  "Nhi",
  "Nhung",
  "Phương",
  "Quyên",
  "Quỳnh",
  "Thảo",
  "Thi",
  "Thu",
  "Thủy",
  "Tiên",
  "Trang",
  "Trâm",
  "Trinh",
  "Tú",
  "Uyên",
  "Vân",
  "Vy",
  "Yến"
];

const segments = ["Mass", "Affluent", "VIP", "SME Owner", "Priority", "Payroll"];
const products = [
  "Tiết kiệm online",
  "Tiết kiệm linh hoạt",
  "Tiết kiệm bậc thang",
  "Tiết kiệm ưu đãi",
  "Thẻ tín dụng",
  "Vay mua nhà",
  "Bảo hiểm nhân thọ",
  "Quỹ mở"
];
const riskProfiles = ["Thận trọng", "Cân bằng", "Tăng trưởng"];
const locations = ["Hà Nội", "TP.HCM", "Đà Nẵng", "Cần Thơ", "Hải Phòng", "Đồng Nai", "Bình Dương"];
const opportunityProducts = [
  "Bảo hiểm sức khỏe",
  "Thẻ tín dụng Platinum",
  "Trái phiếu doanh nghiệp",
  "Quỹ mở TCBF",
  "Vay vốn lưu động",
  "Tiết kiệm tích lũy"
];
const opportunityStages = ["Discovery", "Qualified", "Proposal", "Negotiation"];
const interactionChannels = ["Call", "Email", "Meeting"];
const interactionOutcomes = [
  "Khách hàng quan tâm",
  "Chưa liên lạc được",
  "Đã gửi email",
  "Hẹn gặp tuần sau",
  "Từ chối",
  "Đồng ý nhận đề xuất"
];

function generateData() {
  const NUM_CUSTOMERS = 10000;
  const customers = [];
  const opportunities = [];
  const interactions = [];

  const baseDate = new Date("2026-07-08T00:00:00+07:00"); // Base date for offset

  for (let i = 0; i < NUM_CUSTOMERS; i++) {
    const id = `C1${String(i).padStart(4, "0")}`;
    const name = `${randomItem(firstNames)} ${randomItem(middleNames)} ${randomItem(lastNames)}`;

    // Random maturity date around baseDate (-30 to +90 days)
    const offsetDays = randomInt(-30, 90);
    const maturityDate = new Date(baseDate);
    maturityDate.setDate(maturityDate.getDate() + offsetDays);
    const maturityStr = maturityDate.toISOString().split("T")[0];

    const customer = {
      id,
      name,
      segment: randomItem(segments),
      savingsProduct: randomItem(products) + " " + randomItem(["3T", "6T", "12T", "24T"]),
      savingsAmountVnd: randomInt(5, 500) * 10000000, // 50M to 5B
      maturityDate: maturityStr,
      riskProfile: randomItem(riskProfiles),
      location: randomItem(locations)
    };
    customers.push(customer);

    // 30% chance to have an opportunity
    if (random() < 0.3) {
      opportunities.push({
        id: `O${id}`,
        customerId: id,
        product: randomItem(opportunityProducts),
        stage: randomItem(opportunityStages),
        score: parseFloat((random() * 0.5 + 0.4).toFixed(2)), // 0.40 - 0.90
        estimatedValueVnd: randomInt(1, 100) * 10000000 // 10M to 1B
      });
    }

    // 50% chance to have an interaction
    if (random() < 0.5) {
      const interactionOffset = randomInt(-60, 0);
      const interactionDate = new Date(baseDate);
      interactionDate.setDate(interactionDate.getDate() + interactionOffset);
      interactions.push({
        id: `I${id}`,
        customerId: id,
        channel: randomItem(interactionChannels),
        timestamp: interactionDate.toISOString(),
        outcome: randomItem(interactionOutcomes),
        note: "Auto generated note"
      });
    }
  }

  const outputDir = path.resolve("./src/data/mock");
  fs.writeFileSync(
    path.join(outputDir, "large_customers.json"),
    JSON.stringify(customers, null, 2)
  );
  fs.writeFileSync(
    path.join(outputDir, "large_opportunities.json"),
    JSON.stringify(opportunities, null, 2)
  );
  fs.writeFileSync(
    path.join(outputDir, "large_interactions.json"),
    JSON.stringify(interactions, null, 2)
  );

  console.log(
    `Generated ${customers.length} customers, ${opportunities.length} opportunities, ${interactions.length} interactions.`
  );
}

generateData();
