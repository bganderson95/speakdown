/**
 * readTransform.ts — collecting a transformation's content and computing it.
 *
 * "map", "math" and "date" are open/close pairs whose content is computed
 * rather than emitted; see the TRANSFORMATIONS note at the top of parse.ts.
 */

import type { TransformCommand } from "./commands.js";
import { PHRASE_END_ALL, PHRASE_END_INNERMOST } from "./commands.js";
import { peekPhrase } from "./matchCommand.js";
import type { Token } from "./tokenize.js";
import { resolveDate } from "./transforms/dateResolve.js";
import { buildMapsLink } from "./transforms/mapsLink.js";
import { evaluateSpokenMath } from "./transforms/math.js";
import type { Action, ParseNotice } from "./types.js";

interface TransformContent {
  /** The spoken words, original casing, for the display text or a fallback. */
  rawWords: string[];
  /** The same words lowercased and depunctuated, for matching. */
  matchWords: string[];
  /** Tokens consumed after the open phrase, including any closer taken. */
  wordCount: number;
  /**
   * False when the content simply ran to the end of the transcript, which
   * during live dictation means the speaker has not finished yet.
   */
  closed: boolean;
}

/**
 * Collects the words between a transformation's open phrase and its close.
 *
 * The content ends at the command's own closer (which is consumed), or at a
 * universal closer (which is NOT consumed, so the main loop still applies it to
 * whatever else is open), or at the end of the transcript.
 *
 * That last case means an unclosed transformation resolves at the end of the
 * input, consistent with an unclosed mark running to the end of its block.
 */
export function readTransformContent(
  tokens: readonly Token[],
  contentStart: number,
  command: TransformCommand,
): TransformContent {
  let end = tokens.length;
  let closerLength = 0;
  let closed = false;

  scan: for (let index = contentStart; index < tokens.length; index++) {
    for (const closer of command.closers) {
      if (peekPhrase(tokens, index, closer)) {
        end = index;
        closerLength = closer.length;
        closed = true;
        break scan;
      }
    }
    // "end all" and "end format" close a transformation too, but they are left
    // in place so the main loop can also close anything else still open.
    if (peekPhrase(tokens, index, PHRASE_END_ALL) || peekPhrase(tokens, index, PHRASE_END_INNERMOST)) {
      end = index;
      closed = true;
      break scan;
    }
  }

  const rawWords: string[] = [];
  const matchWords: string[] = [];
  for (let index = contentStart; index < end; index++) {
    const token = tokens[index];
    if (token !== undefined) {
      rawWords.push(token.raw);
      matchWords.push(token.word);
    }
  }

  return { rawWords, matchWords, wordCount: end - contentStart + closerLength, closed };
}

interface TransformOutcome {
  /** The action to emit, or null to emit nothing at all. */
  action: Action | null;
  notice: ParseNotice | null;
}

/**
 * Runs the transformation over its collected content.
 *
 * Every branch is total: on failure the user's own words come back as literal
 * text with a non-blocking notice, so nothing is ever lost and nothing throws.
 * Empty content produces nothing at all — there is no result to compute and no
 * words to lose.
 *
 * A failure is only REPORTED once the block has been closed. Until then the
 * speaker is mid-sentence — "math 45 plus" is not a broken expression, it is an
 * unfinished one — and complaining on every partial transcript would make the
 * notice area flicker through a whole dictation. The words still fall through
 * to literal text either way, so nothing is lost while we wait.
 */
export function runTransform(
  command: TransformCommand,
  content: TransformContent,
  now: Date,
): TransformOutcome {
  /** Only complain once the speaker has actually finished the block. */
  function failed(reason: string): TransformOutcome {
    if (!content.closed) {
      return { action: spokenBack, notice: null };
    }
    return {
      action: spokenBack,
      notice: { kind: "transformFailed", message: reason },
    };
  }

  if (content.rawWords.length === 0) {
    return { action: null, notice: null };
  }

  const spokenBack: Action = { kind: "text", words: content.rawWords };

  switch (command.kind) {
    case "map": {
      const link = buildMapsLink(content.rawWords.join(" "));
      if (link === null) {
        return { action: null, notice: null };
      }
      return { action: { kind: "link", text: link.text, href: link.href }, notice: null };
    }

    case "math": {
      const result = evaluateSpokenMath(content.matchWords);
      if (!result.ok) {
        return failed(`Could not calculate that — ${result.reason}. Your words were kept as text.`);
      }
      return { action: { kind: "transformResult", text: result.value }, notice: null };
    }

    case "date": {
      const result = resolveDate(content.matchWords.join(" "), now);
      if (!result.ok) {
        return failed(`Could not resolve that date — ${result.reason}. Your words were kept as text.`);
      }
      return { action: { kind: "transformResult", text: result.iso }, notice: null };
    }
  }
}

