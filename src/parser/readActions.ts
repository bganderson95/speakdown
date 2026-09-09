/**
 * readActions.ts — pass 1: tokens in, semantic actions out.
 *
 * Walks the tokens once, left to right. Anything that is not a command the
 * matcher recognizes is the user's own words and is emitted as literal text.
 */

import type { ParserConfig } from "./commands.js";
import { resolveHeadingLevel } from "./commands.js";
import { matchCommand } from "./matchCommand.js";
import { isEmojiNameStillArriving, readEmoji, readLink } from "./readArguments.js";
import { readCodeBlock } from "./readCodeBlock.js";
import { readTransformContent, runTransform } from "./readTransform.js";
import type { Token } from "./tokenize.js";
import type { Action, ParseNotice } from "./types.js";

/** Appends a literal word, merging it into the current run of text. */
function emitLiteral(actions: Action[], word: string): void {
  const last = actions[actions.length - 1];
  if (last !== undefined && last.kind === "text") {
    last.words.push(word);
    return;
  }
  actions.push({ kind: "text", words: [word] });
}

interface ReadResult {
  actions: Action[];
  notices: ParseNotice[];
}

/**
 * Everything a command needs while it is being read: the settings, the clock,
 * and the two lists it appends its results to.
 */
interface ReadContext {
  config: ParserConfig;
  /** Injected, so the date transformation stays deterministic. */
  now: Date;
  actions: Action[];
  notices: ParseNotice[];
}

/**
 * Applies the command found at `index`.
 *
 * Returns how many tokens were consumed, or 0 when nothing usable was found —
 * in which case the caller emits the word as literal text and moves on by one.
 */
function readCommand(tokens: readonly Token[], index: number, context: ReadContext): number {
  const { config, now, actions, notices } = context;

  const match = matchCommand(tokens, index);
  if (match === null) {
    return 0;
  }

  switch (match.name) {
    case "openScope": {
      if (match.command === undefined) {
        return 0;
      }
      actions.push({ kind: "openScope", target: match.command.target });
      return match.wordCount;
    }

    case "closeScope": {
      if (match.command === undefined) {
        return 0;
      }
      actions.push({ kind: "closeScope", target: match.command.target });
      return match.wordCount;
    }

    case "endInnermost":
      actions.push({ kind: "closeInnermost" });
      return match.wordCount;

    case "endAll":
      actions.push({ kind: "closeAll" });
      return match.wordCount;

    case "newLine":
      actions.push({ kind: "break" });
      return match.wordCount;

    case "newParagraph":
      actions.push({ kind: "newParagraph" });
      return match.wordCount;

    case "nextItem":
      actions.push({ kind: "nextItem" });
      return match.wordCount;

    case "checkThat":
      actions.push({ kind: "setChecked", checked: true });
      return match.wordCount;

    case "uncheckThat":
      actions.push({ kind: "setChecked", checked: false });
      return match.wordCount;

    case "divider":
      actions.push({ kind: "divider" });
      return match.wordCount;

    case "openCodeBlock": {
      const reading = readCodeBlock(tokens, index + match.wordCount);
      actions.push({ kind: "codeBlock", language: reading.language, code: reading.code });
      return match.wordCount + reading.wordCount;
    }

    case "closeCodeBlock":
      // A closer with no code block open is a no-op, like any other closer.
      return match.wordCount;

    case "openHeading": {
      // The level is the next word, if it is one. A bare "heading" is level 1,
      // which is what people mean when they do not say a number.
      const level = resolveHeadingLevel(tokens[index + match.wordCount]?.word);
      actions.push({ kind: "openScope", target: { kind: "heading", level: level ?? 1 } });
      return match.wordCount + (level === null ? 0 : 1);
    }

    case "closeHeading":
      // The level is not part of a heading's identity, so any level closes.
      actions.push({ kind: "closeScope", target: { kind: "heading", level: 1 } });
      return match.wordCount;

    case "scratchThat":
      // Undo: drop the most recent action. A no-op when there is nothing yet.
      actions.pop();
      return match.wordCount;

    case "emoji": {
      const reading = readEmoji(tokens, index);
      if (reading === null) {
        // Say nothing while the name could still be on its way. A live
        // transcript arrives a word at a time, so the moment someone says
        // "emoji" the name is always missing — complaining then would fire an
        // error on every single use.
        if (!isEmojiNameStillArriving(tokens, index)) {
          notices.push({
            kind: "unknownEmoji",
            message: 'No emoji matched what followed "emoji"; the words were kept as text.',
          });
        }
        return 0;
      }
      actions.push({ kind: "emoji", glyph: reading.glyph });
      return match.wordCount + reading.nameWordCount;
    }

    case "link": {
      const reading = readLink(tokens, index, config);
      if (reading === null) {
        return 0;
      }
      actions.push({ kind: "link", text: reading.text, href: reading.href });
      return reading.wordCount;
    }

    case "openTransform": {
      if (match.transform === undefined) {
        return 0;
      }
      const content = readTransformContent(tokens, index + match.wordCount, match.transform);
      const outcome = runTransform(match.transform, content, now);
      if (outcome.action !== null) {
        actions.push(outcome.action);
      }
      if (outcome.notice !== null) {
        notices.push(outcome.notice);
      }
      return match.wordCount + content.wordCount;
    }

    case "closeTransform":
      // A closer with no transformation open is a no-op, exactly like a mark
      // closer with nothing to close.
      return match.wordCount;
  }
}

/** Walks the tokens left to right, turning them into actions. */
export function readActions(tokens: readonly Token[], config: ParserConfig, now: Date): ReadResult {
  const escape = config.escapeWord.toLowerCase();

  const actions: Action[] = [];
  const notices: ParseNotice[] = [];
  const context: ReadContext = { config, now, actions, notices };
  let index = 0;

  while (index < tokens.length) {
    const token = tokens[index];
    if (token === undefined) {
      break;
    }

    // 1. Escape wins over everything, so "say bold" is the word "bold".
    if (token.word === escape) {
      const next = tokens[index + 1];
      if (next === undefined) {
        // Nothing to escape; the escape word itself is the user's last word.
        emitLiteral(actions, token.raw);
        index += 1;
        continue;
      }
      emitLiteral(actions, next.raw);
      index += 2;
      continue;
    }

    // 2. A command, if one starts here.
    const consumed = readCommand(tokens, index, context);
    if (consumed > 0) {
      index += consumed;
      continue;
    }

    // 3. Anything else is the user's own words.
    emitLiteral(actions, token.raw);
    index += 1;
  }

  return { actions, notices };
}

