export type SearchTokenKind = "ascii" | "cjk";

export type SearchToken = {
  value: string;
  kind: SearchTokenKind;
  weight: number;
  length: number;
  isIdentifier: boolean;
};

type TokenizeOptions = {
  cjkGramSizes?: number[];
  includeStopTerms?: boolean;
  includeSingleCjk?: boolean;
  maxTokens?: number;
};

const ASCII_STOP_WORDS = new Set([
  "a",
  "an",
  "are",
  "can",
  "how",
  "is",
  "of",
  "or",
  "should",
  "the",
  "to",
  "what",
  "where",
]);

const CJK_STOP_TERMS = new Set([
  "\u5982\u4f55",
  "\u600e\u4e48",
  "\u600e\u6837",
  "\u662f\u5426",
  "\u53ef\u4ee5",
  "\u80fd\u5426",
  "\u4ec0\u4e48",
  "\u54ea\u91cc",
  "\u5728\u54ea",
  "\u9700\u8981",
  "\u5e94\u8be5",
]);

const CJK_STOP_CHARS = new Set([
  "\u4f55",
  "\u600e",
  "\u4e48",
  "\u5417",
  "\u5462",
  "\u561b",
  "\u54ea",
]);

const SEARCH_PUNCTUATION_PATTERN =
  /[\uff1f?\uff01!\u3002\uff1b;\uff0c,\u3001\uff1a:"\u201c\u201d\u2018\u2019'()\uff08\uff09[\]{}<>\u300a\u300b\\|=+*^%$#@~`.-]/g;

/** Normalize text for lightweight retrieval matching while preserving identifiers. */
export function normalizeSearchText(
  input: string,
  options: { splitCamelCase?: boolean } = {}
): string {
  const splitCamelCase = options.splitCamelCase ?? true;
  const text = splitCamelCase ? splitCamel(input) : input;

  return text
    .toLowerCase()
    .replace(/\u3000/g, " ")
    .replace(SEARCH_PUNCTUATION_PATTERN, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Compact ASCII view used for matching camelCase identifiers as substrings. */
export function normalizeCompactAsciiText(input: string): string {
  return normalizeSearchText(input).replace(/[^a-z0-9_]+/g, "");
}

/** Tokenize text into weighted ASCII and CJK terms for keyword retrieval. */
export function tokenizeSearchText(
  input: string,
  options: TokenizeOptions = {}
): SearchToken[] {
  const cjkGramSizes = options.cjkGramSizes ?? [2, 3];
  const includeStopTerms = options.includeStopTerms ?? false;
  const includeSingleCjk = options.includeSingleCjk ?? true;
  const asciiTokens = getAsciiSearchTokens(input, includeStopTerms);
  const cjkTokens = getCjkSearchTokens(input, {
    cjkGramSizes,
    includeStopTerms,
    includeSingleCjk,
  });
  const tokens = uniqueTokens([...asciiTokens, ...cjkTokens]);

  return typeof options.maxTokens === "number"
    ? tokens.slice(0, options.maxTokens)
    : tokens;
}

export function tokenizeAscii(input: string): string[] {
  return normalizeSearchText(input).match(/[a-z0-9_]+/g) ?? [];
}

export function getCjkText(input: string): string {
  return Array.from(normalizeSearchText(input))
    .filter((char) => /[\u4e00-\u9fff]/.test(char))
    .join("");
}

export function countSubstringMatches(text: string, term: string): number {
  if (!text || !term) return 0;

  let count = 0;
  let index = text.indexOf(term);

  while (index >= 0) {
    count += 1;
    index = text.indexOf(term, index + term.length);
  }

  return count;
}

export function countAsciiTokenMatches(tokens: string[], term: string): number {
  return tokens.filter((token) => token === term).length;
}

function getAsciiSearchTokens(
  input: string,
  includeStopTerms: boolean
): SearchToken[] {
  const splitTokens = normalizeSearchText(input).match(/[a-z0-9_]+/g) ?? [];
  const compactTokens =
    normalizeSearchText(input, { splitCamelCase: false }).match(/[a-z0-9_]+/g) ??
    [];

  return unique([...splitTokens, ...compactTokens])
    .filter((token) => token.length >= 2)
    .filter((token) => includeStopTerms || !ASCII_STOP_WORDS.has(token))
    .map((token) => ({
      value: token,
      kind: "ascii" as const,
      weight: getAsciiTokenWeight(token),
      length: token.length,
      isIdentifier: isAsciiIdentifier(token),
    }));
}

function getCjkSearchTokens(
  input: string,
  options: Required<
    Pick<TokenizeOptions, "includeStopTerms" | "includeSingleCjk">
  > &
    Pick<TokenizeOptions, "cjkGramSizes">
): SearchToken[] {
  const cjkText = getCjkText(input);
  if (cjkText.length === 0) return [];
  if (cjkText.length === 1) {
    return options.includeSingleCjk
      ? [
          {
            value: cjkText,
            kind: "cjk",
            weight: 0.5,
            length: 1,
            isIdentifier: false,
          },
        ]
      : [];
  }

  const tokens: SearchToken[] = [];
  const gramSizes = options.cjkGramSizes ?? [2, 3];

  for (const size of gramSizes) {
    if (size <= 0 || cjkText.length < size) continue;

    for (let index = 0; index <= cjkText.length - size; index += 1) {
      const value = cjkText.slice(index, index + size);
      if (!options.includeStopTerms && isCjkStopTerm(value)) continue;

      tokens.push({
        value,
        kind: "cjk",
        weight: getCjkTokenWeight(value),
        length: value.length,
        isIdentifier: false,
      });
    }
  }

  return tokens;
}

function isCjkStopTerm(value: string): boolean {
  return (
    CJK_STOP_TERMS.has(value) ||
    Array.from(value).some((char) => CJK_STOP_CHARS.has(char))
  );
}

function getAsciiTokenWeight(token: string): number {
  let weight = 1;
  if (isAsciiIdentifier(token)) weight += 0.25;
  if (token.length >= 6) weight += 0.15;
  if (token.length >= 10) weight += 0.15;
  return weight;
}

function getCjkTokenWeight(token: string): number {
  if (token.length >= 4) return 1.5;
  if (token.length === 3) return 1.25;
  return 1;
}

function isAsciiIdentifier(token: string): boolean {
  return /[_0-9]/.test(token) || token.length >= 4;
}

function splitCamel(input: string): string {
  return input.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
}

function uniqueTokens(tokens: SearchToken[]): SearchToken[] {
  const tokensByKey = new Map<string, SearchToken>();

  for (const token of tokens) {
    const key = `${token.kind}:${token.value}`;
    const current = tokensByKey.get(key);

    if (!current || token.weight > current.weight) {
      tokensByKey.set(key, token);
    }
  }

  return Array.from(tokensByKey.values());
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
