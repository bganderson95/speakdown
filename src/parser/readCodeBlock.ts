/**
 * readCodeBlock.ts — collecting a fenced code block verbatim.
 *
 * The words inside are code, not commands, so nothing in here is parsed. The
 * one exception is "new line", which becomes a real line break.
 */

import {
  CODE_BLOCK_CLOSERS,
  PHRASE_END_ALL,
  PHRASE_END_INNERMOST,
  PHRASE_NEW_LINE,
  resolveCodeLanguage,
} from "./commands.js";
import { peekPhrase } from "./matchCommand.js";
import type { Token } from "./tokenize.js";

interface CodeBlockReading {
  language: string;
  code: string;
  /** Tokens consumed after the open phrase, including any closer taken. */
  wordCount: number;
}

/**
 * Collects a fenced code block's content, starting at `contentStart`.
 *
 * The words inside are code, not commands, so they are captured verbatim — the
 * one exception being "new line", which becomes an actual line break, since
 * code that cannot span lines would not be much of a code block.
 *
 * Like a transformation it ends at its own closer (consumed), at a universal
 * closer (left in place for the main loop), or at the end of the transcript.
 */
export function readCodeBlock(tokens: readonly Token[], contentStart: number): CodeBlockReading {
  let index = contentStart;

  // An optional language tag, but only if the word really names a language.
  let language = "";
  const first = tokens[index];
  if (first !== undefined) {
    const resolved = resolveCodeLanguage(first.word);
    if (resolved !== null) {
      language = resolved;
      index += 1;
    }
  }

  const codeStart = index;
  let end = tokens.length;
  let closerLength = 0;

  scan: for (; index < tokens.length; index++) {
    for (const closer of CODE_BLOCK_CLOSERS) {
      if (peekPhrase(tokens, index, closer)) {
        end = index;
        closerLength = closer.length;
        break scan;
      }
    }
    if (peekPhrase(tokens, index, PHRASE_END_ALL) || peekPhrase(tokens, index, PHRASE_END_INNERMOST)) {
      end = index;
      break scan;
    }
  }

  // Assemble the code, turning "new line" into a real newline.
  const lines: string[] = [];
  let line: string[] = [];
  for (let at = codeStart; at < end; at++) {
    if (peekPhrase(tokens, at, PHRASE_NEW_LINE)) {
      lines.push(line.join(" "));
      line = [];
      at += PHRASE_NEW_LINE.length - 1;
      continue;
    }
    const token = tokens[at];
    if (token !== undefined) {
      line.push(token.raw);
    }
  }
  lines.push(line.join(" "));

  return {
    language,
    code: lines.join("\n").trim(),
    wordCount: end - contentStart + closerLength,
  };
}

