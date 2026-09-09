/**
 * tokenize.ts — raw string -> tokens.
 *
 * PURITY: imports nothing. No React, no DOM.
 *
 * Deliberately dumb and predictable: split on whitespace, keep each chunk
 * whole. No smart punctuation inference in v1.
 *
 * Every token carries both its original casing (`raw`, what we emit as literal
 * text) and a lowercased copy (`lower`, what we match commands against), so
 * command matching is case-insensitive without ever damaging the user's words.
 */

export interface Token {
  /** The word exactly as it arrived. Emitted verbatim as literal text. */
  raw: string;
  /** Lowercased copy used only for command matching. */
  lower: string;
  /**
   * `raw` with surrounding punctuation stripped, lowercased.
   *
   * Speech-to-text engines punctuate, so "bold," must still match the `bold`
   * command. Matching uses this; emitting always uses `raw`.
   */
  word: string;
}

/** Punctuation stripped from the edges of a token before command matching. */
const EDGE_PUNCTUATION = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];

  for (const chunk of text.split(/\s+/)) {
    if (chunk.length === 0) {
      continue;
    }
    const lower = chunk.toLowerCase();
    tokens.push({
      raw: chunk,
      lower,
      word: lower.replace(EDGE_PUNCTUATION, ""),
    });
  }

  return tokens;
}
