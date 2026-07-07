export const customers = [
  {
    id: "C001",
    name: "Nguyen Van An",
    segment: "Affluent",
    savingsProduct: "Tiet kiem linh hoat 12T",
    savingsAmountVnd: 1200000000,
    maturityDate: "2026-07-10",
    riskProfile: "Can bang",
    location: "Ha Noi"
  },
  {
    id: "C002",
    name: "Tran Thi Mai",
    segment: "Mass",
    savingsProduct: "Tiet kiem online 6T",
    savingsAmountVnd: 450000000,
    maturityDate: "2026-07-11",
    riskProfile: "Than trong",
    location: "TP.HCM"
  },
  {
    id: "C003",
    name: "Le Quang Minh",
    segment: "Affluent",
    savingsProduct: "Tiet kiem uu dai CBNV",
    savingsAmountVnd: 700000000,
    maturityDate: "2026-07-14",
    riskProfile: "Tang truong",
    location: "Da Nang"
  },
  {
    id: "C004",
    name: "Pham Thu Ha",
    segment: "Mass",
    savingsProduct: "Tiet kiem bac thang",
    savingsAmountVnd: 320000000,
    maturityDate: "2026-08-03",
    riskProfile: "Can bang",
    location: "Hai Phong"
  },
  {
    id: "C005",
    name: "Hoang Duc Long",
    segment: "Mass",
    savingsProduct: "Tiet kiem online 3T",
    savingsAmountVnd: 210000000,
    maturityDate: "2026-07-09",
    riskProfile: "Tang truong",
    location: "Can Tho"
  }
];

export const opportunities = [
  {
    id: "O1001",
    customerId: "C001",
    product: "Bao hiem nhan tho lien ket tin dung",
    stage: "Proposal",
    score: 0.82,
    estimatedValueVnd: 85000000
  },
  {
    id: "O1002",
    customerId: "C001",
    product: "The tin dung Platinum",
    stage: "Qualified",
    score: 0.65,
    estimatedValueVnd: 20000000
  },
  {
    id: "O1003",
    customerId: "C002",
    product: "Bao hiem suc khoe gia dinh",
    stage: "Discovery",
    score: 0.57,
    estimatedValueVnd: 15000000
  },
  {
    id: "O1004",
    customerId: "C003",
    product: "Trai phieu doanh nghiep xep hang A",
    stage: "Negotiation",
    score: 0.71,
    estimatedValueVnd: 300000000
  }
];

export const interactions = [
  {
    id: "I5001",
    customerId: "C001",
    channel: "Call",
    timestamp: "2026-06-20T09:15:00+07:00",
    outcome: "Khach hang quan tam bao hiem lien ket vay mua nha",
    note: "De nghi gui phuong an bao hiem truoc 12/07"
  },
  {
    id: "I5002",
    customerId: "C001",
    channel: "Email",
    timestamp: "2026-06-28T11:00:00+07:00",
    outcome: "Da mo email, chua phan hoi",
    note: "Can follow-up sau 3 ngay"
  },
  {
    id: "I5003",
    customerId: "C002",
    channel: "Meeting",
    timestamp: "2026-06-30T14:30:00+07:00",
    outcome: "Quan tam san pham tiet kiem tai tuc tu dong",
    note: "Uu tien nhom san pham an toan"
  },
  {
    id: "I5004",
    customerId: "C003",
    channel: "Call",
    timestamp: "2026-07-01T10:05:00+07:00",
    outcome: "Dong y nhan de xuat dau tu bo sung",
    note: "Hen goi lai trong tuan nay"
  }
];

export const campaigns = [
  {
    id: "CP01",
    name: "Gia han tiet kiem quy 3",
    targetSegment: "Mass",
    status: "Active"
  },
  {
    id: "CP02",
    name: "Bao hiem lien ket vay mua nha",
    targetSegment: "Affluent",
    status: "Active"
  },
  {
    id: "CP03",
    name: "The tin dung uu dai du lich",
    targetSegment: "Mass",
    status: "Draft"
  }
];
