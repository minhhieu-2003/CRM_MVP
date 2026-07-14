const CUSTOMER_ID_PATTERN = /\bC(?:-[A-Z0-9_-]+|\d{3,})\b/gi;
const RECORD_ID_PATTERN = /\b(?:O|I|CP)(?:-[A-Z0-9_-]+|\d{3,})\b/gi;
const DATE_PATTERN =
  /\b(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})\b/g;
const CUSTOMER_NAME_CLAIM_PATTERN =
  /\b(?:khách(?:\s+hàng)?|khach(?:\s+hang)?|customer|tên(?:\s+khách(?:\s+hàng)?)?|ten(?:\s+khach(?:\s+hang)?)?)\s*(?:là|la|:|=)?\s+(?!(?:có|co|đang|dang|với|voi|của|cua|cần|can|muốn|muon|được|duoc|sẽ|se|vừa|vua)(?![\p{L}\p{N}_]))([\p{L}][\p{L}.'’-]{0,30}(?:\s+[\p{L}][\p{L}.'’-]{0,30}){1,4})(?=\s+(?:có|co|đang|dang|với|voi|của|cua|cần|can|muốn|muon|được|duoc|sẽ|se|vừa|vua)(?![\p{L}\p{N}_])|[,.;:!?)]|$)/giu;
const LEADING_CUSTOMER_NAME_PATTERN =
  /(?:^|[;.!?\n]\s*)([\p{L}][\p{L}.'’-]{0,30}(?:\s+[\p{L}][\p{L}.'’-]{0,30}){1,4})(?=\s+(?:có|co|đang|dang|cần|can|muốn|muon|vừa|vua|sẽ|se)(?![\p{L}\p{N}_]))/gimu;
const ACTION_CUSTOMER_NAME_PATTERN =
  /\b(?:xin\s+)?(?:gọi|goi|liên\s*hệ|lien\s*he|email|gửi\s*mail|gui\s*mail)\s+([\p{L}][\p{L}.'’-]{0,30}(?:\s+[\p{L}][\p{L}.'’-]{0,30}){1,4})(?=\s+(?:vào|vao|lúc|luc|để|de|về|ve)(?![\p{L}\p{N}_])|[,.;:!?)]|$)/giu;
const POSSESSIVE_CUSTOMER_NAME_PATTERN =
  /\b(?:hồ\s*sơ|ho\s*so|thông\s*tin|thong\s*tin|số\s*dư|so\s*du)\s+(?:của|cua)\s+([\p{L}][\p{L}.'’-]{0,30}(?:\s+[\p{L}][\p{L}.'’-]{0,30}){1,4})(?=\s+(?:có|co|đang|dang|cần|can)(?![\p{L}\p{N}_])|[,.;:!?)]|$)/giu;
const CUSTOMER_NAME_PATTERNS = Object.freeze([
  CUSTOMER_NAME_CLAIM_PATTERN,
  LEADING_CUSTOMER_NAME_PATTERN,
  ACTION_CUSTOMER_NAME_PATTERN,
  POSSESSIVE_CUSTOMER_NAME_PATTERN
]);
const CUSTOMER_NAME_STOP_WORDS = new Set([
  "bao",
  "cao",
  "da",
  "duoc",
  "em",
  "hang",
  "khach",
  "ket",
  "qua",
  "thong",
  "tin",
  "vui"
]);
const PHONE_PATTERN =
  /(?<![\p{L}\p{N}_])(?:\+[1-9]\d{0,2}(?:[ \t\u00a0().-]*\d){7,12}|(?:\+?84|0)(?:[ .-]?\d){8,10})(?!\d)/gu;
const ACCOUNT_CLAIM_PATTERN =
  /\b(?:stk|số\s*tài\s*khoản|so\s*tai\s*khoan|tài\s*khoản|tai\s*khoan|account(?:\s*number)?|số\s*thẻ|so\s*the|card(?:\s*number)?)\s*[:#=-]?\s*((?:\d[ .-]?){6,19})(?!\d)/giu;
const NUMBER_TOKEN_PATTERN = /[+-]?\d(?:[\d.,\s\u00a0]*\d)?/g;
const WORD_TOKEN_PATTERN = /\p{L}+/gu;
const VERBAL_NUMERIC_DATE_PATTERN =
  /\b(?:ngày|ngay)\s+(\d{1,2})\s+(?:tháng|thang)\s+(\d{1,2})\s+(?:năm|nam)\s+(\d{4})\b/giu;
const MONEY_SUFFIX_PATTERN = /^\s*(nghìn|triệu|tr|tỷ|đồng|vnđ|vnd|₫|đ)(?!\p{L})/iu;
const MONEY_PREFIX_PATTERN = /(?:vnđ|vnd|₫|đ)(?!\p{L})\s*$/iu;
const TEXT_CURRENCY_SUFFIX_PATTERN = /^\s*(?:đồng|dong|vnđ|vnd|₫|đ)(?!\p{L})/iu;
const PERCENTAGE_SUFFIX_PATTERN = /^\s*(?:%|phần\s*trăm|phan\s*tram)(?!\p{L})/iu;
const FINANCIAL_PREFIX_PATTERN =
  /(?:số\s*dư|so\s*du|số\s*tiền|so\s*tien|tiền|tien|giá\s*trị|gia\s*tri|dư\s*nợ|du\s*no|hạn\s*mức|han\s*muc|tiền\s*gửi|tien\s*gui|khoản\s*(?:tiền|vay|gửi|tiết\s*kiệm)?|khoan\s*(?:tien|vay|gui|tiet\s*kiem)?)\s*(?:là|la|:|=)?\s*$/iu;
const RANGE_SEPARATOR_PATTERN = /^\s*(?:-|–|—|đến|den|tới|toi)\s*$/iu;

const NUMBER_WORD_DIGITS = new Map([
  ["khong", 0],
  ["mot", 1],
  ["hai", 2],
  ["ba", 3],
  ["bon", 4],
  ["tu", 4],
  ["nam", 5],
  ["lam", 5],
  ["sau", 6],
  ["bay", 7],
  ["tam", 8],
  ["chin", 9]
]);
const NUMBER_WORD_CONTROLS = new Set([
  "linh",
  "le",
  "muoi",
  "tram",
  "nghin",
  "ngan",
  "trieu",
  "ty",
  "ti"
]);
const NUMBER_WORDS = new Set([...NUMBER_WORD_DIGITS.keys(), ...NUMBER_WORD_CONTROLS]);
const UNSUPPORTED_SENSITIVE_NUMBER_WORDS = new Set(["nua", "ruoi"]);
const SENSITIVE_NUMBER_WORDS = new Set([
  ...NUMBER_WORDS,
  ...UNSUPPORTED_SENSITIVE_NUMBER_WORDS
]);
const NUMBER_WORD_MAGNITUDES = new Map([
  ["nghin", 1_000],
  ["ngan", 1_000],
  ["trieu", 1_000_000],
  ["ty", 1_000_000_000],
  ["ti", 1_000_000_000]
]);

const MONEY_FIELDS = new Set([
  "amountvnd",
  "approvedamountvnd",
  "balancevnd",
  "depositamountvnd",
  "estimatedvaluevnd",
  "feevnd",
  "limitvnd",
  "loanamountvnd",
  "outstandingvnd",
  "premiumvnd",
  "pricevnd",
  "principalvnd",
  "savingsamountvnd",
  "sodu",
  "sotien",
  "valuevnd"
]);
const PERCENTAGE_FIELDS = new Set([
  "confidence",
  "conversionrate",
  "likelihood",
  "percentage",
  "probability",
  "rate",
  "ratio",
  "score",
  "successrate",
  "tyle",
  "xacsuat"
]);
const CUSTOMER_NAME_FIELDS = new Set(["name", "customername", "fullname"]);
const PHONE_FIELDS = new Set(["phone", "phonenumber", "mobile", "sodienthoai"]);
const ACCOUNT_FIELDS = new Set([
  "account",
  "accountnumber",
  "cardnumber",
  "sotaikhoan",
  "sothe"
]);

const MAX_REPLY_LENGTH = 16_000;
const MAX_EVIDENCE_CHARACTERS = 250_000;
const MAX_EVIDENCE_NODES = 20_000;
const MAX_NUMERIC_TOKEN_LENGTH = 64;
const MAX_FACTS = 20_000;
const MAX_DATE_CANDIDATE_TOKENS = 24;
const MAX_DATE_CANDIDATE_SPAN = 192;
const DATE_COMPONENT_TOKEN_PATTERN = /\p{L}+|\d+/gu;
const DATE_COMPONENT_GAP_PATTERN = /^[\s\p{P}]*$/u;
const COMPACT_DATE_SEPARATOR_PATTERN = /^\s*[-/.\u2012-\u2015]\s*$/u;

export class SensitiveFactGroundingError extends Error {
  constructor(kind, message) {
    super(message);
    this.name = "SensitiveFactGroundingError";
    this.code = "UNGROUNDED_SENSITIVE_FACT";
    this.kind = kind;
  }
}

function canonicalText(value) {
  return value.normalize("NFKC").replace(/\p{Cf}/gu, "");
}

function canonicalFieldName(value) {
  return canonicalText(value).toLocaleLowerCase("vi").replace(/[^a-z0-9]/g, "");
}

function foldVietnamese(value) {
  return canonicalText(value)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/giu, "d")
    .toLowerCase();
}

function normalizeSensitiveText(value) {
  return foldVietnamese(value).trim().replace(/\s+/g, " ");
}

function normalizeDigits(value) {
  return canonicalText(value).replace(/\D/g, "");
}

function createFactBag() {
  return {
    customerIds: new Set(),
    recordIds: new Set(),
    customerNames: new Set(),
    phones: new Set(),
    accounts: new Set(),
    dates: new Set(),
    money: [],
    percentages: []
  };
}

function pushNumber(target, value) {
  if (Number.isFinite(value) && target.length < MAX_FACTS) target.push(value);
}

function normalizeDateToken(token) {
  const parts = token.split(/[-/.]/).map((part) => Number.parseInt(part, 10));
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part))) return null;
  const [first, second, third] = parts;
  const [year, month, day] = first > 999 ? [first, second, third] : [third, second, first];
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    return null;
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(
    day
  ).padStart(2, "0")}`;
}

function wordTokens(text) {
  return [...text.matchAll(WORD_TOKEN_PATTERN)].map((match) => ({
    raw: match[0],
    folded: foldVietnamese(match[0]),
    start: match.index,
    end: match.index + match[0].length
  }));
}

function tokensAreConnected(text, left, right) {
  return /^[\s-]+$/.test(text.slice(left.end, right.start));
}

function parseVietnameseNumberGroup(words) {
  const meaningful = words.filter((word) => word !== "linh" && word !== "le");
  if (meaningful.length === 0) return null;
  if (meaningful.every((word) => NUMBER_WORD_DIGITS.has(word))) {
    const digits = meaningful.map((word) => NUMBER_WORD_DIGITS.get(word));
    return digits.length === 1 ? digits[0] : Number(digits.join(""));
  }

  let value = 0;
  let started = false;
  for (const word of meaningful) {
    if (NUMBER_WORD_DIGITS.has(word)) {
      value += NUMBER_WORD_DIGITS.get(word);
      started = true;
      continue;
    }
    if (word === "tram") {
      value = (started ? value : 1) * 100;
      started = true;
      continue;
    }
    if (word === "muoi") {
      value = (started ? value : 1) * 10;
      started = true;
      continue;
    }
    return null;
  }
  return started ? value : null;
}

function parseVietnameseNumberWords(words) {
  let total = 0;
  let group = [];
  let sawNumber = false;

  for (const word of words) {
    const magnitude = NUMBER_WORD_MAGNITUDES.get(word);
    if (!magnitude) {
      group.push(word);
      continue;
    }
    if (group.length === 0) return null;
    const groupValue = parseVietnameseNumberGroup(group);
    if (groupValue === null) return null;
    total += groupValue * magnitude;
    group = [];
    sawNumber = true;
  }

  if (group.length > 0) {
    const groupValue = parseVietnameseNumberGroup(group);
    if (groupValue === null) return null;
    total += groupValue;
    sawNumber = true;
  }
  return sawNumber && Number.isSafeInteger(total) ? total : null;
}

function dateComponentTokens(text) {
  return [...text.matchAll(DATE_COMPONENT_TOKEN_PATTERN)].map((match) => ({
    raw: match[0],
    folded: foldVietnamese(match[0]),
    start: match.index,
    end: match.index + match[0].length,
    numeric: /^\d+$/.test(match[0])
  }));
}

function dateTokensAreConnected(text, left, right) {
  return DATE_COMPONENT_GAP_PATTERN.test(text.slice(left.end, right.start));
}

function isDateNumberToken(token) {
  return token?.numeric || NUMBER_WORDS.has(token?.folded);
}

function parseDateNumberTokens(tokens) {
  if (tokens.length === 1 && tokens[0].numeric) {
    const value = Number(tokens[0].raw);
    return Number.isSafeInteger(value) ? value : null;
  }
  if (tokens.length === 0 || tokens.some((token) => token.numeric)) return null;
  if (!tokens.every((token) => NUMBER_WORDS.has(token.folded))) return null;
  return parseVietnameseNumberWords(tokens.map((token) => token.folded));
}

function dateNumberRunEnd(text, tokens, start, limit) {
  let end = start;
  while (
    end < limit &&
    isDateNumberToken(tokens[end]) &&
    (end === start || dateTokensAreConnected(text, tokens[end - 1], tokens[end]))
  ) {
    end += 1;
  }
  return end;
}

function parseMarkedDateAt(text, tokens, start, hasDayMarker = true) {
  const firstComponent = start + (hasDayMarker ? 1 : 0);
  const limit = Math.min(tokens.length, start + MAX_DATE_CANDIDATE_TOKENS);
  let candidate = false;
  let candidateEnd = firstComponent;

  for (let monthMarker = firstComponent + 1; monthMarker < limit; monthMarker += 1) {
    if (tokens[monthMarker].start - tokens[start].start > MAX_DATE_CANDIDATE_SPAN) break;
    if (!dateTokensAreConnected(text, tokens[monthMarker - 1], tokens[monthMarker])) break;
    if (!hasDayMarker && tokens[monthMarker].folded !== "thang") {
      if (!isDateNumberToken(tokens[monthMarker])) break;
      continue;
    }
    if (tokens[monthMarker].folded !== "thang") continue;

    for (let yearMarker = monthMarker + 1; yearMarker < limit; yearMarker += 1) {
      if (tokens[yearMarker].start - tokens[start].start > MAX_DATE_CANDIDATE_SPAN) break;
      if (!dateTokensAreConnected(text, tokens[yearMarker - 1], tokens[yearMarker])) break;
      if (!hasDayMarker && tokens[yearMarker].folded !== "nam") {
        if (!isDateNumberToken(tokens[yearMarker])) break;
        continue;
      }
      if (tokens[yearMarker].folded !== "nam") continue;
      candidate = true;

      const yearStart = yearMarker + 1;
      const yearEnd = dateNumberRunEnd(text, tokens, yearStart, limit);
      candidateEnd = Math.max(candidateEnd, yearEnd, yearMarker + 1);
      const day = parseDateNumberTokens(tokens.slice(firstComponent, monthMarker));
      const month = parseDateNumberTokens(tokens.slice(monthMarker + 1, yearMarker));
      const year = parseDateNumberTokens(tokens.slice(yearStart, yearEnd));
      const date = normalizeDateToken(`${day}/${month}/${year}`);
      if (date) return { candidate: true, date, end: yearEnd };
    }
  }

  return { candidate, date: null, end: candidateEnd };
}

function parseCompactDateAt(text, tokens, start) {
  const dayIndex = start + 1;
  const monthIndex = start + 2;
  const yearMarker = start + 3;
  const limit = Math.min(tokens.length, start + MAX_DATE_CANDIDATE_TOKENS);
  if (yearMarker >= limit || tokens[yearMarker].folded !== "nam") {
    return { candidate: false, date: null, end: dayIndex };
  }
  if (
    !dateTokensAreConnected(text, tokens[start], tokens[dayIndex]) ||
    !COMPACT_DATE_SEPARATOR_PATTERN.test(
      text.slice(tokens[dayIndex].end, tokens[monthIndex].start)
    ) ||
    !dateTokensAreConnected(text, tokens[monthIndex], tokens[yearMarker])
  ) {
    return { candidate: false, date: null, end: dayIndex };
  }

  const yearStart = yearMarker + 1;
  const yearEnd = dateNumberRunEnd(text, tokens, yearStart, limit);
  const day = parseDateNumberTokens([tokens[dayIndex]]);
  const month = parseDateNumberTokens([tokens[monthIndex]]);
  const year = parseDateNumberTokens(tokens.slice(yearStart, yearEnd));
  return {
    candidate: true,
    date: normalizeDateToken(`${day}/${month}/${year}`),
    end: yearEnd
  };
}

function extractTextualDates(text, facts, claims) {
  const seenStarts = new Set();
  for (const match of text.matchAll(VERBAL_NUMERIC_DATE_PATTERN)) {
    const date = normalizeDateToken(`${match[1]}/${match[2]}/${match[3]}`);
    if (!date) continue;
    facts.dates.add(date);
    claims.dates.push({
      value: date,
      start: match.index,
      end: match.index + match[0].length
    });
    seenStarts.add(match.index);
  }

  const tokens = dateComponentTokens(text);
  for (let index = 0; index < tokens.length; index += 1) {
    const hasDayMarker = tokens[index].folded === "ngay";
    if (!hasDayMarker && !isDateNumberToken(tokens[index])) continue;
    const start = tokens[index].start;
    if (seenStarts.has(start)) continue;

    const marked = parseMarkedDateAt(text, tokens, index, hasDayMarker);
    const result =
      marked.candidate || !hasDayMarker ? marked : parseCompactDateAt(text, tokens, index);
    if (!result.candidate) continue;

    if (result.date) facts.dates.add(result.date);
    const lastToken = tokens[Math.max(index, result.end - 1)];
    claims.dates.push({ value: result.date, start, end: lastToken.end });
    index = Math.max(index, result.end - 1);
  }
}

function extractTextualNumericClaims(text, facts, claims, dateClaims) {
  const tokens = wordTokens(text);
  for (let index = 0; index < tokens.length; index += 1) {
    if (
      !NUMBER_WORD_DIGITS.has(tokens[index].folded) &&
      tokens[index].folded !== "muoi" &&
      !UNSUPPORTED_SENSITIVE_NUMBER_WORDS.has(tokens[index].folded)
    ) {
      continue;
    }
    let endIndex = index + 1;
    while (
      endIndex < tokens.length &&
      SENSITIVE_NUMBER_WORDS.has(tokens[endIndex].folded) &&
      tokensAreConnected(text, tokens[endIndex - 1], tokens[endIndex])
    ) {
      endIndex += 1;
    }

    const integerRun = tokens.slice(index, endIndex);
    let value = parseVietnameseNumberWords(integerRun.map((token) => token.folded));
    if (
      endIndex < tokens.length &&
      tokens[endIndex].folded === "phay" &&
      tokensAreConnected(text, tokens[endIndex - 1], tokens[endIndex])
    ) {
      const decimalMarker = endIndex;
      endIndex += 1;
      const fractionalStart = endIndex;
      while (
        endIndex < tokens.length &&
        NUMBER_WORD_DIGITS.has(tokens[endIndex].folded) &&
        tokensAreConnected(text, tokens[endIndex - 1], tokens[endIndex])
      ) {
        endIndex += 1;
      }
      const fractionalWords = tokens.slice(fractionalStart, endIndex);
      if (
        value === null ||
        integerRun.some((token) => NUMBER_WORD_MAGNITUDES.has(token.folded)) ||
        fractionalWords.length === 0
      ) {
        value = null;
      } else {
        const fractionalDigits = fractionalWords
          .map((token) => NUMBER_WORD_DIGITS.get(token.folded))
          .join("");
        value = Number(`${value}.${fractionalDigits}`);
      }
      if (
        endIndex < tokens.length &&
        NUMBER_WORD_MAGNITUDES.has(tokens[endIndex].folded) &&
        tokensAreConnected(text, tokens[Math.max(decimalMarker, endIndex - 1)], tokens[endIndex])
      ) {
        if (value !== null) value *= NUMBER_WORD_MAGNITUDES.get(tokens[endIndex].folded);
        endIndex += 1;
      }
    }

    const run = tokens.slice(index, endIndex);
    const start = run[0].start;
    const end = run.at(-1).end;
    const before = text.slice(Math.max(0, start - 96), start);
    const after = text.slice(end, Math.min(text.length, end + 48));
    const isPercentage = PERCENTAGE_SUFFIX_PATTERN.test(after);
    const overlapsDate = dateClaims.some(
      (claim) => Number.isInteger(claim.end) && start < claim.end && end > claim.start
    );
    const hasMoneyMagnitude =
      !isPercentage &&
      !overlapsDate &&
      run.some((token) => NUMBER_WORD_MAGNITUDES.has(token.folded));
    const isMoney =
      hasMoneyMagnitude ||
      TEXT_CURRENCY_SUFFIX_PATTERN.test(after) ||
      FINANCIAL_PREFIX_PATTERN.test(before);

    if (isPercentage) {
      if (value !== null) pushNumber(facts.percentages, value);
      claims.percentages.push({ value: value ?? Number.NaN, start });
    }
    if (isMoney) {
      if (value !== null) pushNumber(facts.money, value);
      claims.money.push({ value: value ?? Number.NaN, start });
    }
    index = endIndex - 1;
  }
}

function splitSign(numberText) {
  const compact = numberText.replace(/[\s\u00a0]/g, "");
  if (compact.startsWith("-")) return { sign: -1, unsigned: compact.slice(1) };
  if (compact.startsWith("+")) return { sign: 1, unsigned: compact.slice(1) };
  return { sign: 1, unsigned: compact };
}

function parseBaseVndNumber(numberText) {
  const { sign, unsigned } = splitSign(numberText);
  const digits = unsigned.replace(/[^\d]/g, "");
  if (!digits) return null;
  const numeric = Number(digits);
  return Number.isFinite(numeric) ? sign * numeric : null;
}

function parseScaledNumber(numberText) {
  const { sign, unsigned } = splitSign(numberText);
  let compact = unsigned;
  const dots = compact.match(/\./g)?.length ?? 0;
  const commas = compact.match(/,/g)?.length ?? 0;

  if (dots > 0 && commas > 0) {
    const decimalSeparator = compact.lastIndexOf(",") > compact.lastIndexOf(".") ? "," : ".";
    const groupingSeparator = decimalSeparator === "," ? "." : ",";
    compact = compact.replaceAll(groupingSeparator, "").replace(decimalSeparator, ".");
  } else if (dots + commas > 1) {
    compact = compact.replace(/[.,]/g, "");
  } else if (commas === 1) {
    compact = compact.replace(",", ".");
  } else if (dots === 1) {
    const fractionLength = compact.length - compact.lastIndexOf(".") - 1;
    if (fractionLength === 3) compact = compact.replace(".", "");
  }

  const numeric = Number(compact);
  return Number.isFinite(numeric) ? sign * numeric : null;
}

function parseMoney(numberText, unit = "vnd") {
  if (numberText.length > MAX_NUMERIC_TOKEN_LENGTH) return null;
  const normalizedUnit = canonicalText(unit).toLocaleLowerCase("vi");
  const baseUnit = ["đồng", "vnđ", "vnd", "₫", "đ"].includes(normalizedUnit);
  const numeric = baseUnit ? parseBaseVndNumber(numberText) : parseScaledNumber(numberText);
  if (numeric === null) return null;
  const multiplier =
    normalizedUnit === "tỷ"
      ? 1_000_000_000
      : normalizedUnit === "triệu" || normalizedUnit === "tr"
        ? 1_000_000
        : normalizedUnit === "nghìn"
          ? 1_000
          : 1;
  return numeric * multiplier;
}

function parsePercentage(numberText) {
  if (numberText.length > MAX_NUMERIC_TOKEN_LENGTH) return null;
  return parseScaledNumber(numberText);
}

function numericTokens(text) {
  const tokens = [];
  for (const match of text.matchAll(NUMBER_TOKEN_PATTERN)) {
    const start = match.index;
    const end = start + match[0].length;
    const before = text.slice(Math.max(0, start - 96), start);
    const after = text.slice(end, Math.min(text.length, end + 48));
    const suffix = after.match(MONEY_SUFFIX_PATTERN)?.[1] ?? null;
    const prefix = MONEY_PREFIX_PATTERN.test(before);
    const financial = FINANCIAL_PREFIX_PATTERN.test(before);
    tokens.push({
      raw: match[0],
      start,
      end,
      moneyUnit: suffix ?? (prefix || financial ? "vnd" : null),
      percentage: PERCENTAGE_SUFFIX_PATTERN.test(after)
    });
  }

  for (let index = 0; index < tokens.length - 1; index += 1) {
    const current = tokens[index];
    const next = tokens[index + 1];
    const signedRange = next.raw.startsWith("-");
    const separator = `${text.slice(current.end, next.start)}${signedRange ? "-" : ""}`;
    if (!RANGE_SEPARATOR_PATTERN.test(separator)) continue;
    if (signedRange) next.rangeUnsigned = true;
    if (current.moneyUnit && !next.moneyUnit) next.moneyUnit = current.moneyUnit;
    if (next.moneyUnit && !current.moneyUnit) current.moneyUnit = next.moneyUnit;
    if (current.percentage || next.percentage) {
      current.percentage = true;
      next.percentage = true;
    }
  }
  return tokens;
}

function extractTextFacts(text) {
  const facts = createFactBag();
  const claims = {
    customerIds: [],
    recordIds: [],
    customerNames: [],
    phones: [],
    accounts: [],
    money: [],
    percentages: [],
    dates: []
  };
  for (const match of text.matchAll(CUSTOMER_ID_PATTERN)) {
    const value = match[0].toLowerCase();
    facts.customerIds.add(value);
    claims.customerIds.push({ value, start: match.index });
  }
  for (const match of text.matchAll(RECORD_ID_PATTERN)) {
    const value = match[0].toLowerCase();
    facts.recordIds.add(value);
    claims.recordIds.push({ value, start: match.index });
  }
  const seenCustomerNames = new Set();
  for (const pattern of CUSTOMER_NAME_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const value = normalizeSensitiveText(match[1]);
      const words = value.split(/\s+/).map(foldVietnamese);
      if (words.some((word) => CUSTOMER_NAME_STOP_WORDS.has(word))) continue;
      const start = match.index + match[0].indexOf(match[1]);
      const claimKey = `${start}:${value}`;
      if (seenCustomerNames.has(claimKey)) continue;
      seenCustomerNames.add(claimKey);
      facts.customerNames.add(value);
      claims.customerNames.push({ value, start });
    }
  }
  for (const match of text.matchAll(PHONE_PATTERN)) {
    const value = normalizeDigits(match[0]);
    facts.phones.add(value);
    claims.phones.push({ value, start: match.index, end: match.index + match[0].length });
  }
  for (const match of text.matchAll(ACCOUNT_CLAIM_PATTERN)) {
    const value = normalizeDigits(match[1]);
    facts.accounts.add(value);
    claims.accounts.push({
      value,
      start: match.index + match[0].indexOf(match[1]),
      end: match.index + match[0].indexOf(match[1]) + match[1].length
    });
  }
  for (const match of text.matchAll(DATE_PATTERN)) {
    const date = normalizeDateToken(match[0]);
    if (date) facts.dates.add(date);
    claims.dates.push({ value: date, start: match.index });
  }
  extractTextualDates(text, facts, claims);
  for (const token of numericTokens(text)) {
    const numericText = token.rangeUnsigned ? token.raw.slice(1) : token.raw;
    const overlapsIdentifier = [...claims.phones, ...claims.accounts].some(
      (claim) => token.start < claim.end && token.end > claim.start
    );
    if (token.moneyUnit && !overlapsIdentifier) {
      const value = parseMoney(numericText, token.moneyUnit);
      if (value !== null) {
        pushNumber(facts.money, value);
        claims.money.push({ value, start: token.start });
      } else {
        claims.money.push({ value: Number.NaN, start: token.start });
      }
    }
    if (token.percentage) {
      const value = parsePercentage(numericText);
      if (value !== null) {
        pushNumber(facts.percentages, value);
        claims.percentages.push({ value, start: token.start });
      } else {
        claims.percentages.push({ value: Number.NaN, start: token.start });
      }
    }
  }
  extractTextualNumericClaims(text, facts, claims, claims.dates);
  return { facts, claims };
}

function mergeFacts(target, source) {
  for (const value of source.customerIds) target.customerIds.add(value);
  for (const value of source.recordIds) target.recordIds.add(value);
  for (const value of source.customerNames) target.customerNames.add(value);
  for (const value of source.phones) target.phones.add(value);
  for (const value of source.accounts) target.accounts.add(value);
  for (const value of source.dates) target.dates.add(value);
  for (const value of source.money) pushNumber(target.money, value);
  for (const value of source.percentages) pushNumber(target.percentages, value);
}

function entityIdsForObject(value, inheritedIds) {
  const ids = new Set(inheritedIds);
  const candidates = [
    value.customerId,
    value.customer?.id,
    value.input?.customerId,
    typeof value.id === "string" && /^C(?:-|\d)/i.test(value.id) ? value.id : null
  ];
  const ownIds = candidates
    .filter((candidate) => typeof candidate === "string")
    .map((candidate) => canonicalText(candidate).trim().toLowerCase())
    .filter((candidate) => /^c(?:-[a-z0-9_-]+|\d{3,})$/i.test(candidate));
  if (ownIds.length > 0) return new Set(ownIds);
  return ids;
}

function addFactsToEntities(entities, entityIds, facts) {
  for (const entityId of entityIds) {
    if (!entities.has(entityId)) entities.set(entityId, createFactBag());
    mergeFacts(entities.get(entityId), facts);
  }
}

function collectEvidenceFacts(evidence) {
  const global = createFactBag();
  const entities = new Map();
  const aliases = new Map();
  const seen = new WeakSet();
  const stack = [{ value: evidence, fieldName: "", entityIds: new Set() }];
  let visitedNodes = 0;
  let consumedCharacters = 0;

  while (stack.length > 0 && visitedNodes < MAX_EVIDENCE_NODES) {
    const entry = stack.pop();
    const value = entry.value;
    visitedNodes += 1;

    if (typeof value === "number") {
      const key = canonicalFieldName(entry.fieldName);
      if (MONEY_FIELDS.has(key)) {
        const facts = createFactBag();
        pushNumber(facts.money, value);
        mergeFacts(global, facts);
        addFactsToEntities(entities, entry.entityIds, facts);
      }
      if (PERCENTAGE_FIELDS.has(key)) {
        const facts = createFactBag();
        pushNumber(facts.percentages, Math.abs(value) <= 1 ? value * 100 : value);
        mergeFacts(global, facts);
        addFactsToEntities(entities, entry.entityIds, facts);
      }
      continue;
    }

    if (typeof value === "string") {
      if (consumedCharacters >= MAX_EVIDENCE_CHARACTERS) continue;
      const remaining = MAX_EVIDENCE_CHARACTERS - consumedCharacters;
      const text = canonicalText(value).slice(0, remaining);
      consumedCharacters += text.length;
      const extracted = extractTextFacts(text).facts;
      const key = canonicalFieldName(entry.fieldName);
      const semanticNumber = parseScaledNumber(text);
      if (
        CUSTOMER_NAME_FIELDS.has(key) &&
        (key !== "name" || entry.entityIds.size > 0) &&
        text.trim().length >= 2
      ) {
        extracted.customerNames.add(normalizeSensitiveText(text));
      }
      if (PHONE_FIELDS.has(key)) {
        const phone = normalizeDigits(text);
        if (phone.length >= 8 && phone.length <= 15) extracted.phones.add(phone);
      }
      if (ACCOUNT_FIELDS.has(key)) {
        const account = normalizeDigits(text);
        if (account.length >= 6 && account.length <= 19) extracted.accounts.add(account);
      }
      if (MONEY_FIELDS.has(key) && semanticNumber !== null) {
        pushNumber(extracted.money, parseBaseVndNumber(text));
      }
      if (PERCENTAGE_FIELDS.has(key) && semanticNumber !== null) {
        pushNumber(
          extracted.percentages,
          Math.abs(semanticNumber) <= 1 ? semanticNumber * 100 : semanticNumber
        );
      }
      mergeFacts(global, extracted);
      addFactsToEntities(entities, entry.entityIds, extracted);
      continue;
    }

    if (!value || typeof value !== "object" || seen.has(value)) continue;
    seen.add(value);
    if (Array.isArray(value)) {
      for (let index = value.length - 1; index >= 0; index -= 1) {
        stack.push({ value: value[index], fieldName: entry.fieldName, entityIds: entry.entityIds });
      }
      continue;
    }

    const entityIds = entityIdsForObject(value, entry.entityIds);
    for (const entityId of entityIds) {
      if (!entities.has(entityId)) entities.set(entityId, createFactBag());
      global.customerIds.add(entityId);
      entities.get(entityId).customerIds.add(entityId);
    }
    const name = typeof value.name === "string" ? canonicalText(value.name).trim() : null;
    const customerName =
      typeof value.customerName === "string" ? canonicalText(value.customerName).trim() : null;
    for (const alias of [name, customerName]) {
      if (!alias || alias.length < 3 || entityIds.size !== 1) continue;
      aliases.set(normalizeSensitiveText(alias), [...entityIds][0]);
    }
    for (const [key, child] of Object.entries(value)) {
      stack.push({ value: child, fieldName: key, entityIds });
    }
  }

  for (const entityId of global.customerIds) {
    if (entities.has(entityId)) continue;
    const facts = createFactBag();
    facts.customerIds.add(entityId);
    entities.set(entityId, facts);
  }

  return { global, entities, aliases };
}

function entityMentions(reply, evidence) {
  const mentions = [];
  for (const match of reply.matchAll(CUSTOMER_ID_PATTERN)) {
    mentions.push({ start: match.index, entityId: match[0].toLowerCase() });
  }
  const lowerReply = foldVietnamese(reply);
  for (const [alias, entityId] of evidence.aliases) {
    let start = lowerReply.indexOf(alias);
    while (start >= 0) {
      mentions.push({ start, entityId });
      start = lowerReply.indexOf(alias, start + alias.length);
    }
  }
  return mentions.sort((left, right) => left.start - right.start);
}

function clauseBoundaries(text) {
  const boundaries = [-1];
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === "\n" || character === ";" || character === "!" || character === "?") {
      boundaries.push(index);
      continue;
    }
    if (character !== ".") continue;
    const betweenDigits = /\d/.test(text[index - 1] ?? "") && /\d/.test(text[index + 1] ?? "");
    if (!betweenDigits) boundaries.push(index);
  }
  boundaries.push(text.length);
  return boundaries;
}

function insertionIndex(sortedValues, target, includeEqual) {
  let low = 0;
  let high = sortedValues.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (sortedValues[middle] < target || (includeEqual && sortedValues[middle] === target)) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

function factsForMentions(localMentions, evidence) {
  const scopes = [];
  for (const entityId of new Set(localMentions.map((mention) => mention.entityId))) {
    scopes.push(evidence.entities.get(entityId) ?? createFactBag());
  }
  return scopes;
}

function claimScopes({
  claimStart,
  mentions,
  evidence,
  boundaries,
  claimStarts,
  includeFollowing = false
}) {
  const boundaryIndex = insertionIndex(boundaries, claimStart, false);
  const clauseStart = boundaries[boundaryIndex - 1] + 1;
  const clauseEnd = boundaries[boundaryIndex];
  const claimIndex = insertionIndex(claimStarts, claimStart, false);
  const previousClaim = claimStarts[claimIndex - 1];
  const nextClaimIndex = insertionIndex(claimStarts, claimStart, true);
  const nextClaim = claimStarts[nextClaimIndex];
  const segmentStart =
    previousClaim !== undefined && previousClaim >= clauseStart ? previousClaim + 1 : clauseStart;
  const segmentEnd = nextClaim !== undefined && nextClaim <= clauseEnd ? nextClaim : clauseEnd;

  const preceding = mentions.filter(
    (mention) => mention.start >= segmentStart && mention.start <= claimStart
  );
  const following = mentions.filter(
    (mention) => mention.start > claimStart && mention.start < segmentEnd
  );
  if (includeFollowing && preceding.length + following.length > 0) {
    return factsForMentions([...preceding, ...following], evidence);
  }
  if (preceding.length > 0) return factsForMentions(preceding, evidence);
  if (following.length > 0) return factsForMentions(following, evidence);

  const previous = mentions
    .filter(
      (mention) =>
        mention.start >= clauseStart &&
        mention.start < claimStart &&
        claimStart - mention.start <= 240
    )
    .at(-1);
  return previous ? factsForMentions([previous], evidence) : [evidence.global];
}

function hasExactNumber(numbers, expected, tolerance) {
  return Number.isFinite(expected) && numbers.some((value) => Math.abs(value - expected) <= tolerance);
}

function ungrounded(kind, description) {
  throw new SensitiveFactGroundingError(
    kind,
    `Model response introduced an unobserved ${description}.`
  );
}

export function assertSensitiveClaimsGrounded(reply, evidence) {
  if (typeof reply !== "string") throw new TypeError("reply must be a string");
  if (reply.length > MAX_REPLY_LENGTH) throw new TypeError("reply exceeds grounding limit");

  const normalizedReply = canonicalText(reply);
  const observed = collectEvidenceFacts(evidence);
  const extracted = extractTextFacts(normalizedReply);
  const mentions = entityMentions(normalizedReply, observed);
  const boundaries = clauseBoundaries(normalizedReply);
  const valueClaimStarts = [
    ...extracted.claims.recordIds,
    ...extracted.claims.customerNames,
    ...extracted.claims.phones,
    ...extracted.claims.accounts,
    ...extracted.claims.dates,
    ...extracted.claims.money,
    ...extracted.claims.percentages
  ]
    .map((claim) => claim.start)
    .sort((left, right) => left - right);
  const customerClaimStarts = extracted.claims.customerIds
    .map((claim) => claim.start)
    .sort((left, right) => left - right);
  const scopesFor = (claim, claimStarts = valueClaimStarts, includeFollowing = false) =>
    claimScopes({
      claimStart: claim.start,
      mentions,
      evidence: observed,
      boundaries,
      claimStarts,
      includeFollowing
    });

  for (const claim of extracted.claims.customerIds) {
    if (
      scopesFor(claim, customerClaimStarts, true).some(
        (scope) => !scope.customerIds.has(claim.value)
      )
    ) {
      ungrounded("customer-id", "customer identifier");
    }
  }
  for (const claim of extracted.claims.recordIds) {
    if (scopesFor(claim).some((scope) => !scope.recordIds.has(claim.value))) {
      ungrounded("record-id", "record identifier");
    }
  }
  for (const claim of extracted.claims.customerNames) {
    if (scopesFor(claim).some((scope) => !scope.customerNames.has(claim.value))) {
      ungrounded("customer-name", "customer name");
    }
  }
  for (const claim of extracted.claims.phones) {
    if (scopesFor(claim).some((scope) => !scope.phones.has(claim.value))) {
      ungrounded("phone", "phone number");
    }
  }
  for (const claim of extracted.claims.accounts) {
    if (scopesFor(claim).some((scope) => !scope.accounts.has(claim.value))) {
      ungrounded("account", "account identifier");
    }
  }
  for (const claim of extracted.claims.dates) {
    if (scopesFor(claim).some((scope) => !scope.dates.has(claim.value))) {
      ungrounded("date", "date");
    }
  }
  for (const claim of extracted.claims.money) {
    if (scopesFor(claim).some((scope) => !hasExactNumber(scope.money, claim.value, 0.5))) {
      ungrounded("money", "monetary amount");
    }
  }
  for (const claim of extracted.claims.percentages) {
    if (
      scopesFor(claim).some(
        (scope) => !hasExactNumber(scope.percentages, claim.value, 0.01)
      )
    ) {
      ungrounded("percentage", "percentage");
    }
  }
}
