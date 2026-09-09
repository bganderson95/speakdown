/**
 * readArguments.ts — the commands that swallow the words after them.
 *
 * "emoji" takes a name, "link" takes display words and a target. Each reader
 * reports what it read and how far it got, or null when the shape is not there
 * — in which case the caller falls back to literal text and the user keeps
 * their words.
 */

import type { ParserConfig } from "./commands.js";
import {
  CLIPBOARD_HREF_SENTINEL,
  LINK_CLIPBOARD_KEYWORD,
  LINK_TARGET_KEYWORD,
} from "./commands.js";
import { MAX_EMOJI_NAME_WORDS, isEmojiNamePrefix, lookUpEmoji } from "./emoji.js";
import { matchCommand } from "./matchCommand.js";
import { normalizeSpokenUrl } from "./normalizeSpokenUrl.js";
import type { Token } from "./tokenize.js";

interface EmojiReading {
  glyph: string;
  /** Words consumed after the "emoji" keyword. */
  nameWordCount: number;
}

/**
 * Resolves the emoji name following the "emoji" keyword at `keywordIndex`.
 *
 * Longest name first, so "thumbs up" wins over a hypothetical "thumbs".
 * Returns null when nothing matches; the caller then falls through to literal
 * text so the words are kept.
 */
export function readEmoji(tokens: readonly Token[], keywordIndex: number): EmojiReading | null {
  for (let length = MAX_EMOJI_NAME_WORDS; length >= 1; length--) {
    const words: string[] = [];
    for (let offset = 0; offset < length; offset++) {
      const token = tokens[keywordIndex + 1 + offset];
      if (token === undefined) {
        break;
      }
      words.push(token.word);
    }
    if (words.length < length) {
      continue;
    }

    const glyph = lookUpEmoji(words.join(" "));
    if (glyph !== null) {
      return { glyph, nameWordCount: length };
    }
  }
  return null;
}

/**
 * True when the transcript runs out before the emoji name could be finished.
 *
 * Only relevant at the end of the input: if a full name's worth of words is
 * already there and none of them matched, the name really is unknown.
 */
export function isEmojiNameStillArriving(tokens: readonly Token[], keywordIndex: number): boolean {
  const following: string[] = [];
  for (let offset = 1; offset <= MAX_EMOJI_NAME_WORDS; offset++) {
    const token = tokens[keywordIndex + offset];
    if (token === undefined) {
      break;
    }
    following.push(token.word);
  }

  if (following.length === MAX_EMOJI_NAME_WORDS) {
    return false;
  }
  return isEmojiNamePrefix(following);
}

/**
 * The index where a command's free-form words must stop: the escape word, the
 * start of any other command, or the end of the transcript.
 *
 * This is what lets "link the docs to example dot com bold now" work — the URL
 * ends where the next command begins. It also means a URL word that happens to
 * be a command word ends the URL, which is the honest consequence of a grammar
 * with no trigger word.
 */
function findRegionEnd(tokens: readonly Token[], from: number, config: ParserConfig): number {
  const escape = config.escapeWord.toLowerCase();

  for (let index = from; index < tokens.length; index++) {
    const token = tokens[index];
    if (token === undefined) {
      continue;
    }
    if (token.word === escape) {
      return index;
    }
    if (matchCommand(tokens, index) !== null) {
      return index;
    }
  }
  return tokens.length;
}

interface LinkReading {
  text: string;
  href: string;
  /** Words consumed including the "link" keyword itself. */
  wordCount: number;
}

/**
 * Reads "link <display words> to <spoken url | clipboard>".
 *
 * Returns null when the shape is not there (no "to", no display words, no
 * target, or a target that does not normalize to a URL). The caller then falls
 * through to literal text.
 */
export function readLink(
  tokens: readonly Token[],
  keywordIndex: number,
  config: ParserConfig,
): LinkReading | null {
  const regionEnd = findRegionEnd(tokens, keywordIndex + 1, config);

  // The FIRST "to" separates display words from the target.
  let targetKeywordIndex = -1;
  for (let index = keywordIndex + 1; index < regionEnd; index++) {
    if (tokens[index]?.word === LINK_TARGET_KEYWORD) {
      targetKeywordIndex = index;
      break;
    }
  }
  if (targetKeywordIndex === -1) {
    return null;
  }

  const displayWords: string[] = [];
  for (let index = keywordIndex + 1; index < targetKeywordIndex; index++) {
    const token = tokens[index];
    if (token !== undefined) {
      displayWords.push(token.raw);
    }
  }
  if (displayWords.length === 0) {
    return null;
  }

  const targetTokens = tokens.slice(targetKeywordIndex + 1, regionEnd);
  if (targetTokens.length === 0) {
    return null;
  }

  const wordCount = regionEnd - keywordIndex;
  const text = displayWords.join(" ");

  // "to clipboard" defers the href to the input/UI layer, which is the only
  // place allowed to touch navigator.clipboard.
  if (targetTokens.length === 1 && targetTokens[0]?.word === LINK_CLIPBOARD_KEYWORD) {
    return { text, href: CLIPBOARD_HREF_SENTINEL, wordCount };
  }

  const spoken: string[] = [];
  for (const token of targetTokens) {
    spoken.push(token.word);
  }
  const href = normalizeSpokenUrl(spoken.join(" "));
  if (href.length === 0) {
    return null;
  }

  return { text, href, wordCount };
}

