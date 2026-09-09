/**
 * mathTokens.ts — spoken words -> math tokens.
 *
 * PURE: imports nothing. No I/O, no clock, no randomness.
 *
 * Turns "forty five plus 12" into [45, +, 12]. Anything it does not recognize
 * makes the whole expression fail, so math.ts can keep the user's words instead
 * of computing something they did not say.
 */

export type MathOperator = "+" | "-" | "*" | "/";

export type MathToken =
  | { kind: "number"; value: number }
  | { kind: "operator"; symbol: MathOperator }
  | { kind: "openParen" }
  | { kind: "closeParen" };

// ---------------------------------------------------------------------------
// Number words
// ---------------------------------------------------------------------------

const SMALL_NUMBER_WORDS: Readonly<Record<string, number>> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19,
};

const TENS_WORDS: Readonly<Record<string, number>> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

const SCALE_WORDS: Readonly<Record<string, number>> = {
  hundred: 100, thousand: 1000, million: 1000000,
};

function isNumberWord(word: string | undefined): boolean {
  if (word === undefined) {
    return false;
  }
  return (
    SMALL_NUMBER_WORDS[word] !== undefined ||
    TENS_WORDS[word] !== undefined ||
    SCALE_WORDS[word] !== undefined
  );
}

/**
 * Reads a numeral token like "45", "3.5" or "1,200".
 *
 * Speech recognizers usually emit digits for numbers, so this is the common
 * path; the number words below are the fallback for when they do not.
 */
function readNumeral(word: string): number | null {
  const digits = word.replace(/,/g, "");
  if (!/^(\d+(\.\d+)?|\.\d+)$/.test(digits)) {
    return null;
  }
  const value = Number(digits);
  return Number.isFinite(value) ? value : null;
}

interface NumberReading {
  value: number;
  wordCount: number;
}

/**
 * Reads a run of English number words, e.g. "forty five" or "one hundred two".
 *
 * Standard accumulator: units and tens add into `current`, "hundred" scales it,
 * and "thousand"/"million" bank it into `total`. Covers 0 to 999,999,999 —
 * far more than anyone dictates mid-sentence.
 */
function readNumberWords(words: readonly string[], start: number): NumberReading | null {
  let total = 0;
  let current = 0;
  let used = 0;
  let sawNumber = false;

  for (let i = start; i < words.length; i++) {
    const word = words[i];
    if (word === undefined) {
      break;
    }

    // "one hundred and five" — only skip "and" when a number really follows,
    // so a trailing "and" is never swallowed.
    if (word === "and" && sawNumber && isNumberWord(words[i + 1])) {
      continue;
    }

    const small = SMALL_NUMBER_WORDS[word];
    const tens = TENS_WORDS[word];
    const scale = SCALE_WORDS[word];

    if (small !== undefined) {
      current += small;
    } else if (tens !== undefined) {
      current += tens;
    } else if (scale === 100) {
      // "hundred" with nothing before it means one hundred.
      current = (current === 0 ? 1 : current) * 100;
    } else if (scale !== undefined) {
      total += (current === 0 ? 1 : current) * scale;
      current = 0;
    } else {
      break;
    }

    sawNumber = true;
    used = i - start + 1;
  }

  if (!sawNumber) {
    return null;
  }
  return { value: total + current, wordCount: used };
}

// ---------------------------------------------------------------------------
// Operators
// ---------------------------------------------------------------------------

interface OperatorReading {
  symbol: MathOperator;
  wordCount: number;
}

/**
 * Reads an operator phrase. Two-word phrases are tested first, so "divided by"
 * is never read as a bare "divided".
 */
function readOperator(words: readonly string[], start: number): OperatorReading | null {
  const first = words[start];
  const second = words[start + 1];

  if (first === undefined) {
    return null;
  }

  // Two-word operator phrases.
  if (first === "multiplied" && second === "by") {
    return { symbol: "*", wordCount: 2 };
  }
  if (first === "divided" && second === "by") {
    return { symbol: "/", wordCount: 2 };
  }

  // One-word operator phrases.
  switch (first) {
    case "plus":
    case "add":
      return { symbol: "+", wordCount: 1 };
    case "minus":
    case "subtract":
      return { symbol: "-", wordCount: 1 };
    case "times":
      return { symbol: "*", wordCount: 1 };
    case "over":
      return { symbol: "/", wordCount: 1 };
    default:
      return null;
  }
}

/** Reads a grouping phrase: "open paren" / "close parenthesis" and friends. */
function readParen(words: readonly string[], start: number): { token: MathToken; wordCount: number } | null {
  const first = words[start];
  const second = words[start + 1];
  const isParenWord = second === "paren" || second === "parenthesis" || second === "bracket";

  if (!isParenWord) {
    return null;
  }
  if (first === "open") {
    return { token: { kind: "openParen" }, wordCount: 2 };
  }
  if (first === "close") {
    return { token: { kind: "closeParen" }, wordCount: 2 };
  }
  return null;
}

// ---------------------------------------------------------------------------

/**
 * Splits hyphenated words so "forty-five" reads as two number words.
 *
 * Recognizers hyphenate compound numbers, and the parser's tokenizer keeps each
 * whitespace-separated chunk whole.
 */
function expandHyphens(words: readonly string[]): string[] {
  const expanded: string[] = [];
  for (const word of words) {
    for (const part of word.split("-")) {
      if (part.length > 0) {
        expanded.push(part);
      }
    }
  }
  return expanded;
}

/**
 * Turns spoken words into math tokens, or null when any word is not something
 * this vocabulary knows.
 *
 * Returning null rather than skipping the word is deliberate: a half-understood
 * expression would compute a number the user never asked for.
 */
export function tokenizeMath(spokenWords: readonly string[]): MathToken[] | null {
  const words = expandHyphens(spokenWords);
  const tokens: MathToken[] = [];
  let index = 0;

  while (index < words.length) {
    const word = words[index];
    if (word === undefined) {
      break;
    }

    const paren = readParen(words, index);
    if (paren !== null) {
      tokens.push(paren.token);
      index += paren.wordCount;
      continue;
    }

    const operator = readOperator(words, index);
    if (operator !== null) {
      tokens.push({ kind: "operator", symbol: operator.symbol });
      index += operator.wordCount;
      continue;
    }

    const numeral = readNumeral(word);
    if (numeral !== null) {
      tokens.push({ kind: "number", value: numeral });
      index += 1;
      continue;
    }

    const spelled = readNumberWords(words, index);
    if (spelled !== null) {
      tokens.push({ kind: "number", value: spelled.value });
      index += spelled.wordCount;
      continue;
    }

    // An unrecognized word fails the whole expression.
    return null;
  }

  return tokens;
}
