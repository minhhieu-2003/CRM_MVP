import crypto from "node:crypto";

const SECRET_PATTERN =
  /\b(?:Bearer\s+[A-Za-z0-9._~+/=-]+|(?:api[_ -]?key|token|password|secret)\s*[:=]\s*[^\s,;]+)/giu;
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu;
const FOREIGN_PHONE_PATTERN =
  /(?<![\p{L}\p{N}_])\+[1-9]\d{0,2}(?:[ \t\u00a0().-]*\d){7,12}(?!\d)/gu;
const PHONE_PATTERN = /(?<!\d)(?:\+?84|0)(?:[ .-]?\d){8,10}(?!\d)/g;
const LONG_IDENTIFIER_PATTERN = /(?<!\d)\d{8,19}(?!\d)/g;
const GROUPED_LONG_IDENTIFIER_PATTERN = /(?<!\d)\d{1,6}(?:[ .\-\u00a0]+\d{1,6}){1,18}(?!\d)/g;
const LABELED_IDENTIFIER_PATTERN =
  /\b(?:cccd|cmnd|citizen\s*id|national\s*id|(?:số\s*)?tài\s*khoản|(?:so\s*)?tai\s*khoan|account(?:\s*number)?|card(?:\s*number)?)\s*[:#=-]?\s*(?:\d[ .-]?){6,19}/giu;
const ADDRESS_PATTERN = /\b(?:địa\s*chỉ|dia\s*chi|address)\s*[:=-]\s*[^,;\n]{5,120}/giu;
const CUSTOMER_ID_PATTERN = /\bC(?:-[A-Z0-9_-]+|\d{3,})\b/giu;
const RECORD_ID_PATTERN = /\b(?:O|I|CP)(?:-[A-Z0-9_-]+|\d{3,})\b/giu;
const TITLE_CASE_NAME_PATTERN =
  /(?<![\p{L}\p{N}_])\p{Lu}[\p{L}'’-]{1,30}(?:\s+\p{Lu}[\p{L}'’-]{1,30}){1,4}(?![\p{L}\p{N}_])/gu;
const PII_PATTERNS = Object.freeze([
  SECRET_PATTERN,
  EMAIL_PATTERN,
  FOREIGN_PHONE_PATTERN,
  PHONE_PATTERN,
  LABELED_IDENTIFIER_PATTERN,
  ADDRESS_PATTERN,
  CUSTOMER_ID_PATTERN,
  RECORD_ID_PATTERN,
  TITLE_CASE_NAME_PATTERN
]);
const JSON_PII_FIELD_PATTERN =
  /("(?:name|customerName|fullName|email|phone|phoneNumber|mobile|address|accountNumber|cardNumber|nationalId|citizenId|cccd|cmnd|dateOfBirth|dob)"\s*:\s*")([^"\\]*(?:\\.[^"\\]*)*)(")/giu;
const JSON_STRING_PATTERN = /"([^"\\]*(?:\\.[^"\\]*)*)"/gu;
const NAME_WORD_PATTERN = /\p{L}+(?:['’.-]\p{L}+)*/gu;
const NAME_CLAUSE_PATTERN = /[^,;.!?\n]+/gu;
const NAME_CONTEXT_MARKERS = new Set([
  "anh",
  "ba",
  "chi",
  "client",
  "customer",
  "khach",
  "mr",
  "mrs",
  "ms",
  "name",
  "ong",
  "ten"
]);
const DIRECT_NAME_ACTIONS = new Set([
  "call",
  "contact",
  "email",
  "find",
  "goi",
  "gui",
  "search",
  "send",
  "tim"
]);
const NAME_RELATION_MARKERS = new Set(["cho", "cua", "for", "of"]);
const NAME_STOP_WORDS = new Set([
  "active",
  "amount",
  "and",
  "asked",
  "asks",
  "balance",
  "campaign",
  "can",
  "cau",
  "chien",
  "cho",
  "co",
  "cua",
  "customer",
  "dao",
  "dang",
  "date",
  "de",
  "dich",
  "duoc",
  "email",
  "find",
  "for",
  "gia",
  "goi",
  "gui",
  "han",
  "has",
  "hiem",
  "hoi",
  "hom",
  "is",
  "ke",
  "khach",
  "khoan",
  "khuc",
  "la",
  "liet",
  "maturity",
  "mua",
  "muon",
  "nay",
  "needs",
  "ngay",
  "nhac",
  "nhu",
  "opportunity",
  "phan",
  "please",
  "product",
  "requested",
  "requests",
  "savings",
  "search",
  "segment",
  "send",
  "so",
  "soan",
  "suat",
  "tai",
  "theo",
  "thong",
  "tiet",
  "tin",
  "tim",
  "to",
  "today",
  "tong",
  "tu",
  "va",
  "value",
  "vay",
  "ve",
  "voi",
  "wants",
  "with",
  "xem"
]);
const MONEY_AFTER_PATTERN =
  /^\s*(?:đồng|dong|vnđ|vnd|₫|đ|nghìn|nghin|triệu|trieu|tỷ|ty)(?!\p{L})/iu;
const MONEY_BEFORE_PATTERN =
  /(?:số\s*dư|so\s*du|số\s*tiền|so\s*tien|giá\s*trị|gia\s*tri|amount|vnd|vnđ|₫|đ)\s*[:=]?\s*$/iu;

function canonicalInput(value) {
  return value.normalize("NFKC").replace(/\p{Cf}/gu, "");
}

function foldNameWord(value) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/giu, "d")
    .toLowerCase();
}

function nameTokens(source, baseOffset = 0) {
  return [...source.matchAll(NAME_WORD_PATTERN)].map((match) => ({
    end: baseOffset + match.index + match[0].length,
    folded: foldNameWord(match[0]),
    start: baseOffset + match.index
  }));
}

function isWhitespaceSeparated(left, right, source) {
  return /^\s+$/u.test(source.slice(left.end, right.start));
}

function collectNameRange(tokens, startIndex, source, tokenToValue) {
  const selected = [];
  for (let index = startIndex; index < tokens.length && selected.length < 5; index += 1) {
    const token = tokens[index];
    if (
      (selected.length > 0 && !isWhitespaceSeparated(selected.at(-1), token, source)) ||
      NAME_STOP_WORDS.has(token.folded) ||
      isInsideKnownVaultToken(source, token.start, tokenToValue)
    ) {
      break;
    }
    selected.push(token);
  }
  if (selected.length < 2) return null;
  return { start: selected[0].start, end: selected.at(-1).end };
}

function rangesOverlap(left, right) {
  return left.start < right.end && right.start < left.end;
}

function addNameRange(ranges, range) {
  if (!range || ranges.some((existing) => rangesOverlap(existing, range))) return;
  ranges.push(range);
}

function candidateAfterMarker(tokens, markerIndex) {
  let startIndex = markerIndex + 1;
  const marker = tokens[markerIndex].folded;
  if (
    (marker === "ten" || marker === "name") &&
    tokens[startIndex]?.folded === "khach"
  ) {
    startIndex += 1;
  }
  if (tokens[startIndex]?.folded === "la") startIndex += 1;
  return startIndex;
}

function isBenignClausePrefix(value) {
  return /^[\s('"“”‘’*-]*$/u.test(value);
}

function findGenericNameRanges(source, tokenToValue) {
  const ranges = [];
  const tokens = nameTokens(source);

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (NAME_CONTEXT_MARKERS.has(token.folded)) {
      addNameRange(
        ranges,
        collectNameRange(tokens, candidateAfterMarker(tokens, index), source, tokenToValue)
      );
      continue;
    }
    if (DIRECT_NAME_ACTIONS.has(token.folded) || NAME_RELATION_MARKERS.has(token.folded)) {
      addNameRange(ranges, collectNameRange(tokens, index + 1, source, tokenToValue));
    }
  }

  for (const clauseMatch of source.matchAll(NAME_CLAUSE_PATTERN)) {
    const clauseStart = clauseMatch.index;
    const clauseTokens = nameTokens(clauseMatch[0], clauseStart);
    if (clauseTokens.length < 2) continue;
    if (!isBenignClausePrefix(source.slice(clauseStart, clauseTokens[0].start))) continue;
    addNameRange(ranges, collectNameRange(clauseTokens, 0, source, tokenToValue));
  }

  return ranges.sort((left, right) => left.start - right.start || right.end - left.end);
}

function protectGenericNames(source, tokenFor, tokenToValue) {
  const ranges = findGenericNameRanges(source, tokenToValue);
  if (ranges.length === 0) return source;

  let cursor = 0;
  let output = "";
  for (const range of ranges) {
    if (range.start < cursor) continue;
    output += source.slice(cursor, range.start);
    output += tokenFor(source.slice(range.start, range.end));
    cursor = range.end;
  }
  return output + source.slice(cursor);
}

function isInsideKnownVaultToken(source, offset, tokenToValue) {
  const opening = source.lastIndexOf("[[BANKRM_PII_", offset);
  if (opening < 0) return false;
  const closing = source.indexOf("]]", opening);
  if (closing < offset) return false;
  return tokenToValue.has(source.slice(opening, closing + 2));
}

function isBusinessNumberContext(match, offset, source) {
  const before = source.slice(Math.max(0, offset - 48), offset);
  const after = source.slice(offset + match.length, offset + match.length + 24);
  return MONEY_BEFORE_PATTERN.test(before) || MONEY_AFTER_PATTERN.test(after);
}

function isValidDateParts(year, month, day) {
  const value = new Date(Date.UTC(year, month - 1, day));
  return (
    value.getUTCFullYear() === year &&
    value.getUTCMonth() === month - 1 &&
    value.getUTCDate() === day
  );
}

function isGroupedDate(value) {
  const rawParts = value.split(/[ .\-\u00a0]+/);
  const parts = rawParts.map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isSafeInteger(part))) return false;
  if (rawParts[0].length === 4) {
    return isValidDateParts(parts[0], parts[1], parts[2]);
  }
  if (rawParts[2].length === 4) {
    return isValidDateParts(parts[2], parts[1], parts[0]);
  }
  return false;
}

function restoreValue(value, restoreString, seen = new WeakMap()) {
  if (typeof value === "string") return restoreString(value);
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return seen.get(value);

  const output = Array.isArray(value) ? [] : {};
  seen.set(value, output);
  if (Array.isArray(value)) {
    for (const child of value) output.push(restoreValue(child, restoreString, seen));
  } else {
    for (const [key, child] of Object.entries(value)) {
      output[key] = restoreValue(child, restoreString, seen);
    }
  }
  return output;
}

export function createLlmPiiTokenVault() {
  const nonce = [...crypto.randomBytes(12)]
    .map((value) => String.fromCharCode(97 + (value % 26)))
    .join("");
  const tokenToValue = new Map();
  const valueToToken = new Map();

  function tokenFor(value) {
    const existing = valueToToken.get(value);
    if (existing) return existing;
    const token = `[[BANKRM_PII_${nonce}_${tokenToValue.size + 1}]]`;
    valueToToken.set(value, token);
    tokenToValue.set(token, value);
    return token;
  }

  function protect(value) {
    if (typeof value !== "string") throw new TypeError("LLM PII protection requires a string.");
    let output = canonicalInput(value);
    output = output.replace(
      JSON_PII_FIELD_PATTERN,
      (match, prefix, fieldValue, suffix) =>
        tokenToValue.has(fieldValue) ? match : `${prefix}${tokenFor(fieldValue)}${suffix}`
    );
    output = output.replace(
      JSON_STRING_PATTERN,
      (match, fieldValue, offset, source) => {
        const nextCharacter = source.slice(offset + match.length).match(/^\s*(.)/u)?.[1];
        if (nextCharacter === ":") return match;
        return `"${protectGenericNames(fieldValue, tokenFor, tokenToValue)}"`;
      }
    );
    for (const pattern of PII_PATTERNS) {
      output = output.replace(pattern, (match) => tokenFor(match));
    }
    output = protectGenericNames(output, tokenFor, tokenToValue);
    output = output.replace(LONG_IDENTIFIER_PATTERN, (match, offset, source) => {
      if (
        isInsideKnownVaultToken(source, offset, tokenToValue) ||
        isBusinessNumberContext(match, offset, source)
      ) {
        return match;
      }
      return tokenFor(match);
    });
    output = output.replace(GROUPED_LONG_IDENTIFIER_PATTERN, (match, offset, source) => {
      const digitCount = match.replace(/\D/g, "").length;
      if (
        digitCount < 8 ||
        digitCount > 19 ||
        isInsideKnownVaultToken(source, offset, tokenToValue) ||
        isGroupedDate(match) ||
        isBusinessNumberContext(match, offset, source)
      ) {
        return match;
      }
      return tokenFor(match);
    });
    return output;
  }

  function restore(value) {
    if (typeof value !== "string") throw new TypeError("LLM PII restoration requires a string.");
    let output = value;
    for (const [token, original] of tokenToValue) output = output.replaceAll(token, original);
    return output;
  }

  return Object.freeze({
    protect,
    restore,
    restoreValue: (value) => restoreValue(value, restore),
    tokenCount: () => tokenToValue.size
  });
}
