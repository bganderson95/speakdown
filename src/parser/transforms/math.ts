/**
 * math.ts — spoken math expression -> computed value.
 *
 * PURE: imports only mathTokens.ts. No I/O, no clock, no randomness.
 *
 * WHY A HAND-ROLLED EVALUATOR: the operator set is four binary operators plus
 * parentheses, which a recursive-descent parser expresses in about forty lines.
 * That is smaller and easier to audit than pulling in a dependency, and it
 * keeps Speakdown's promise that nothing arbitrary is ever executed.
 *
 * `eval` and `new Function` are NEVER used, and there is nothing here that
 * could execute a string even if one arrived. mathTokens.ts has already reduced
 * the input to numbers and operators before this file sees it.
 *
 * GRAMMAR (standard precedence: * and / bind tighter than + and -):
 *
 *   expression := term (("+" | "-") term)*
 *   term       := factor (("*" | "/") factor)*
 *   factor     := number | "-" factor | "(" expression ")"
 */

import type { MathToken } from "./mathTokens.js";
import { tokenizeMath } from "./mathTokens.js";

export type MathResult =
  | { ok: true; value: string }
  | { ok: false; reason: string };

/**
 * Formats a computed number.
 *
 * Integers render plainly ("139"). Everything else rounds to at most four
 * decimal places with trailing zeros trimmed, so 1/3 reads as "0.3333" rather
 * than a wall of digits, and 0.1 + 0.2 reads as "0.3" rather than
 * "0.30000000000000004".
 */
export function formatMathValue(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }
  return String(Number(value.toFixed(4)));
}

/** Walks the token list once, left to right. */
interface Reader {
  tokens: readonly MathToken[];
  position: number;
}

function peek(reader: Reader): MathToken | undefined {
  return reader.tokens[reader.position];
}

/** Thrown internally on a malformed expression; never escapes this module. */
class MathSyntaxError extends Error {}

function parseExpression(reader: Reader): number {
  let value = parseTerm(reader);

  for (;;) {
    const token = peek(reader);
    if (token === undefined || token.kind !== "operator") {
      return value;
    }
    if (token.symbol !== "+" && token.symbol !== "-") {
      return value;
    }

    reader.position++;
    const right = parseTerm(reader);
    value = token.symbol === "+" ? value + right : value - right;
  }
}

function parseTerm(reader: Reader): number {
  let value = parseFactor(reader);

  for (;;) {
    const token = peek(reader);
    if (token === undefined || token.kind !== "operator") {
      return value;
    }
    if (token.symbol !== "*" && token.symbol !== "/") {
      return value;
    }

    reader.position++;
    const right = parseFactor(reader);
    if (token.symbol === "*") {
      value = value * right;
    } else {
      if (right === 0) {
        throw new MathSyntaxError("divided by zero");
      }
      value = value / right;
    }
  }
}

function parseFactor(reader: Reader): number {
  const token = peek(reader);
  if (token === undefined) {
    throw new MathSyntaxError("the expression ended early");
  }

  switch (token.kind) {
    case "number":
      reader.position++;
      return token.value;

    case "operator":
      // A leading "minus" negates what follows: "minus five plus two".
      if (token.symbol === "-") {
        reader.position++;
        return -parseFactor(reader);
      }
      throw new MathSyntaxError("an operator appeared where a number was expected");

    case "openParen": {
      reader.position++;
      const value = parseExpression(reader);
      const closing = peek(reader);
      if (closing === undefined || closing.kind !== "closeParen") {
        throw new MathSyntaxError("a group was never closed");
      }
      reader.position++;
      return value;
    }

    case "closeParen":
      throw new MathSyntaxError("a group was closed before it was opened");
  }
}

/**
 * Evaluates a spoken math expression.
 *
 * Never throws: every failure comes back as { ok: false }, so the parser can
 * keep the user's original words.
 */
export function evaluateSpokenMath(words: readonly string[]): MathResult {
  if (words.length === 0) {
    return { ok: false, reason: "there was nothing to calculate" };
  }

  const tokens = tokenizeMath(words);
  if (tokens === null) {
    return { ok: false, reason: "some of those words are not numbers or operators" };
  }
  if (tokens.length === 0) {
    return { ok: false, reason: "there was nothing to calculate" };
  }

  const reader: Reader = { tokens, position: 0 };
  let value: number;
  try {
    value = parseExpression(reader);
  } catch (error) {
    if (error instanceof MathSyntaxError) {
      return { ok: false, reason: error.message };
    }
    throw error;
  }

  // Trailing tokens mean the expression was not fully understood, e.g. "2 3".
  if (reader.position !== tokens.length) {
    return { ok: false, reason: "that expression did not parse cleanly" };
  }

  if (!Number.isFinite(value)) {
    return { ok: false, reason: "that does not have a finite answer" };
  }

  return { ok: true, value: formatMathValue(value) };
}
