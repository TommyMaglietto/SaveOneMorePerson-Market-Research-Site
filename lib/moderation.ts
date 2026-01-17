import Filter from "bad-words";

const profanitySafeWords = new Set(["scunthorpe", "penistone"]);

const phoneticBadWords = new Set([
  "biatch",
  "biotch",
  "beeyotch",
  "byatch",
  "phuck",
  "fuk",
  "fuq",
  "fvck",
  "phuk",
  "shyt",
  "sht",
  "chit",
  "shiit",
  "azz",
  "asz",
  "a55",
  "cnt",
  "kunt",
  "khunt",
  "dik",
  "dck",
  "d1ck",
  "fck",
  "fk",
  "fcuk",
  "hore",
  "wh0re",
  "ho3",
  "slvt",
  "sl00t",
  "slutt",
  "btch",
  "bltch",
  "b!tch",
  "b1tch",
  "biitch",
  "dammit",
  "dayum",
  "sheeet",
]);

const substringBadWords = [
  "bitch",
  "shit",
  "fuck",
  "cunt",
  "dick",
  "pussy",
  "penis",
  "whore",
  "slut",
  "bastard",
  "asshole",
];

const leetMap: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "8": "b",
  "9": "g",
  "@": "a",
  $: "s",
  "!": "i",
  "+": "t",
  "|": "i",
  "(": "c",
  "<": "c",
};

const applyLeetSubstitutions = (value: string) =>
  value.replace(/[01345789@$!+|(<]/g, (char) => leetMap[char] ?? char);

const normalizeProfanityText = (value: string) => {
  let normalized = value.toLowerCase();
  normalized = normalized.replace(/[\u200b-\u200d\ufeff]/g, "");
  normalized = normalized.replace(/[\.\-_]/g, "");
  normalized = normalized.replace(/[*#]/g, "");
  normalized = applyLeetSubstitutions(normalized);
  normalized = normalized.replace(/\b(\w)\s+(?=\w)/g, "$1");
  normalized = normalized.replace(/(.)\1{2,}/g, "$1$1");
  return normalized;
};

const normalizeProfanityToken = (value: string) =>
  normalizeProfanityText(value).replace(/[^a-z]/g, "");

const normalizeProfanityStrict = (value: string) =>
  normalizeProfanityToken(value).replace(/(.)\1+/g, "$1");

const getProfanityTokens = (value: string) =>
  value.match(/[A-Za-z0-9@$!+|()<>]+/g) ?? [];

const fuzzyMatch = (word: string, badWord: string, threshold = 0.75) => {
  if (!word || !badWord) return false;
  const a = word.toLowerCase();
  const b = badWord.toLowerCase();
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i += 1) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j += 1) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i += 1) {
    for (let j = 1; j <= a.length; j += 1) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1,
        );
      }
    }
  }

  const distance = matrix[b.length][a.length];
  const similarity = 1 - distance / Math.max(a.length, b.length);
  return similarity >= threshold;
};

const getProfanityCandidates = (value: string) => {
  const candidates = new Set<string>();
  const normalizedText = normalizeProfanityText(value);
  const rawTokens = getProfanityTokens(value);
  const normalizedTokens = getProfanityTokens(normalizedText);

  const addCandidate = (token: string) => {
    const lower = token.toLowerCase();
    if (!lower) return;
    candidates.add(lower);
    const normalized = normalizeProfanityToken(lower);
    if (!normalized) return;
    candidates.add(normalized);
    const strict = normalizeProfanityStrict(normalized);
    if (strict) {
      candidates.add(strict);
    }
    const lookalike = normalized.replace(/l/g, "i");
    if (lookalike && lookalike !== normalized) {
      candidates.add(lookalike);
      const strictLookalike = normalizeProfanityStrict(lookalike);
      if (strictLookalike) {
        candidates.add(strictLookalike);
      }
    }
  };

  rawTokens.forEach(addCandidate);
  normalizedTokens.forEach(addCandidate);

  const concatenated = normalizedText.replace(/\s+/g, "");
  if (concatenated) {
    addCandidate(concatenated);
  }

  const tokens = normalizedTokens.length ? normalizedTokens : rawTokens;
  const maxWindow = 6;
  const maxCombinedLength = 20;
  for (let start = 0; start < tokens.length; start += 1) {
    let combined = "";
    for (
      let end = start;
      end < tokens.length && end < start + maxWindow;
      end += 1
    ) {
      combined += tokens[end];
      if (combined.length > maxCombinedLength) break;
      addCandidate(combined);
    }
  }

  return candidates;
};

export const createProfanityFilter = () => {
  const filter = new Filter();
  profanitySafeWords.forEach((word) => filter.removeWords(word));
  return filter;
};

export const containsProfanity = (value: string, filter: Filter) => {
  const candidates = getProfanityCandidates(value);
  for (const candidate of candidates) {
    if (profanitySafeWords.has(candidate)) {
      continue;
    }
    if (filter.isProfane(candidate)) {
      return true;
    }
    if (phoneticBadWords.has(candidate)) {
      return true;
    }
    if (candidate.length >= 4 && candidate.length <= 12) {
      for (const badWord of phoneticBadWords) {
        if (fuzzyMatch(candidate, badWord, 0.78)) {
          return true;
        }
      }
    }
    if (candidate.length >= 4) {
      for (const badWord of substringBadWords) {
        if (candidate.includes(badWord)) {
          return true;
        }
      }
    }
  }
  return false;
};

export const hasLinkSpam = (value: string) => {
  const urlPattern = /(https?:\/\/|www\.)/i;
  const domainPattern =
    /\b[a-z0-9-]+\.(com|net|org|io|co|ai|gg|app|dev|info|biz|link)\b/i;
  return urlPattern.test(value) || domainPattern.test(value);
};
