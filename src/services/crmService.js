import {
  campaigns,
  customers,
  interactions,
  opportunities
} from "./crmData.js";

const toDate = (value) => new Date(`${value}T00:00:00+07:00`);

export function listCustomers() {
  return customers;
}

export function listOpportunities() {
  return opportunities;
}

export function listInteractions() {
  return interactions;
}

export function listCampaigns() {
  return campaigns;
}

export function getCustomerByName(name) {
  const lowered = name.toLowerCase();
  return customers.find((item) => item.name.toLowerCase().includes(lowered)) ?? null;
}

export function getCustomerById(customerId) {
  return customers.find((item) => item.id === customerId) ?? null;
}

export function getCustomerOpportunities(customerId) {
  return opportunities.filter((item) => item.customerId === customerId);
}

export function getCustomerInteractions(customerId) {
  return interactions.filter((item) => item.customerId === customerId);
}

export function getMaturityCustomers(daysAhead = 7, now = new Date("2026-07-07T08:00:00+07:00")) {
  const maxDate = new Date(now);
  maxDate.setDate(now.getDate() + daysAhead);

  return customers.filter((customer) => {
    const maturity = toDate(customer.maturityDate);
    return maturity >= now && maturity <= maxDate;
  });
}

export function draftEmailForCustomer(customer, suggestion) {
  return {
    subject: `Nhắc đến hạn ${customer.savingsProduct} - ${customer.name}`,
    body: `Kính gửi ${customer.name},\n\nKhoản ${customer.savingsProduct} số tiền ${formatVnd(customer.savingsAmountVnd)} sẽ đến hạn vào ngày ${customer.maturityDate}. ${suggestion}\n\nRM sẽ hỗ trợ anh/chị chọn phương án tối ưu theo nhu cầu hiện tại.\n\nTrân trọng,\nRelationship Manager - Bank A`
  };
}

export function draftCallScript(customer, suggestion) {
  return [
    `Chào ${customer.name}, em là RM từ Bank A.`,
    `Em gọi để nhắc khoản ${customer.savingsProduct} của anh/chị sẽ đến hạn ngày ${customer.maturityDate}.`,
    `Số dư hiện tại là ${formatVnd(customer.savingsAmountVnd)}.`,
    `${suggestion}`,
    "Nếu anh/chị đồng ý, em xin đặt lịch hẹn 15 phút để tư vấn chi tiết."
  ].join(" ");
}

export function formatVnd(value) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0
  }).format(value);
}
