/**
 * matchCommand.ts — "what command, if any, starts at this token?"
 *
 * Pure lookahead: it reports what it found and how many tokens the phrase
 * covers, and never decides what to do about it. The precedence ladder in
 * matchCommand() is the one documented at the top of parse.ts.
 */

import type { ScopeCommand, TransformCommand } from "./commands.js";
import {
  CODE_BLOCK_CLOSERS,
  CODE_BLOCK_OPENS,
  HEADING_CLOSERS,
  MAX_PHRASE_WORDS,
  PHRASE_DIVIDER,
  PHRASE_EMOJI,
  PHRASE_END_ALL,
  PHRASE_END_INNERMOST,
  PHRASE_HEADING,
  PHRASE_HORIZONTAL_RULE,
  PHRASE_LINK,
  PHRASE_NEW_LINE,
  PHRASE_NEW_PARAGRAPH,
  PHRASE_NEXT_ITEM,
  PHRASE_SCRATCH_THAT,
  PHRASE_CHECK_THAT,
  PHRASE_UNCHECK_THAT,
  SCOPE_COMMANDS,
  TRANSFORM_COMMANDS,
} from "./commands.js";
import type { Token } from "./tokenize.js";

/**
 * True when the tokens starting at `index` are exactly `phrase`.
 * e.g. peekPhrase(tokens, i, ["bullet", "list"]).
 */
export function peekPhrase(
  tokens: readonly Token[],
  index: number,
  phrase: readonly string[],
): boolean {
  for (let offset = 0; offset < phrase.length; offset++) {
    const token = tokens[index + offset];
    if (token === undefined || token.word !== phrase[offset]) {
      return false;
    }
  }
  return true;
}

/**
 * Finds the scope command whose CLOSE phrase starts at `index`.
 *
 * Longest phrases first, so "end bold" is never read as some shorter match.
 */
function matchCloser(
  tokens: readonly Token[],
  index: number,
): { command: ScopeCommand; wordCount: number } | null {
  for (let length = MAX_PHRASE_WORDS; length >= 1; length--) {
    for (const command of SCOPE_COMMANDS) {
      for (const closer of command.closers) {
        if (closer.length !== length) {
          continue;
        }
        if (peekPhrase(tokens, index, closer)) {
          return { command, wordCount: length };
        }
      }
    }
  }
  return null;
}

/**
 * Finds the scope command whose OPEN phrase starts at `index`.
 *
 * Longest phrases first, so "bullet list" is never read as a bare "bullet".
 */
function matchOpen(
  tokens: readonly Token[],
  index: number,
): { command: ScopeCommand; wordCount: number } | null {
  for (let length = MAX_PHRASE_WORDS; length >= 1; length--) {
    for (const command of SCOPE_COMMANDS) {
      for (const open of command.opens) {
        if (open.length !== length) {
          continue;
        }
        if (peekPhrase(tokens, index, open)) {
          return { command, wordCount: length };
        }
      }
    }
  }
  return null;
}

/**
 * Finds the transformation whose CLOSE phrase starts at `index`.
 *
 * Longest phrases first, matching the scope matchers above.
 */
function matchTransformCloser(
  tokens: readonly Token[],
  index: number,
): { command: TransformCommand; wordCount: number } | null {
  for (let length = MAX_PHRASE_WORDS; length >= 1; length--) {
    for (const command of TRANSFORM_COMMANDS) {
      for (const closer of command.closers) {
        if (closer.length !== length) {
          continue;
        }
        if (peekPhrase(tokens, index, closer)) {
          return { command, wordCount: length };
        }
      }
    }
  }
  return null;
}

/** Finds the transformation whose OPEN phrase starts at `index`. */
function matchTransformOpen(
  tokens: readonly Token[],
  index: number,
): { command: TransformCommand; wordCount: number } | null {
  for (let length = MAX_PHRASE_WORDS; length >= 1; length--) {
    for (const command of TRANSFORM_COMMANDS) {
      for (const open of command.opens) {
        if (open.length !== length) {
          continue;
        }
        if (peekPhrase(tokens, index, open)) {
          return { command, wordCount: length };
        }
      }
    }
  }
  return null;
}

/** The commands the parser understands. */
type CommandName =
  | "endAll"
  | "endInnermost"
  | "closeScope"
  | "openScope"
  | "newParagraph"
  | "newLine"
  | "nextItem"
  | "checkThat"
  | "uncheckThat"
  | "divider"
  | "scratchThat"
  | "openCodeBlock"
  | "closeCodeBlock"
  | "openHeading"
  | "closeHeading"
  | "emoji"
  | "link"
  | "openTransform"
  | "closeTransform";

interface CommandMatch {
  name: CommandName;
  /** How many tokens the matched phrase itself covers. */
  wordCount: number;
  /** Set for openScope and closeScope. */
  command?: ScopeCommand;
  /** Set for openTransform and closeTransform. */
  transform?: TransformCommand;
}

/**
 * Identifies the command starting at `index`, or null for ordinary words.
 *
 * The order below is the PRECEDENCE block at the top of this file, in code.
 * `emoji` and `link` are matched on their keyword only — whether they are
 * really usable is decided by readEmoji()/readLink().
 */
export function matchCommand(tokens: readonly Token[], index: number): CommandMatch | null {
  // 1. Universal closers, before anything else that starts with "end".
  if (peekPhrase(tokens, index, PHRASE_END_ALL)) {
    return { name: "endAll", wordCount: PHRASE_END_ALL.length };
  }
  if (peekPhrase(tokens, index, PHRASE_END_INNERMOST)) {
    return { name: "endInnermost", wordCount: PHRASE_END_INNERMOST.length };
  }

  // 2. The code block's closer comes first among closers because it is the
  //    longest: "end code block" must never be read as "end code" plus a
  //    stray "block".
  for (const closer of CODE_BLOCK_CLOSERS) {
    if (peekPhrase(tokens, index, closer)) {
      return { name: "closeCodeBlock", wordCount: closer.length };
    }
  }

  for (const closer of HEADING_CLOSERS) {
    if (peekPhrase(tokens, index, closer)) {
      return { name: "closeHeading", wordCount: closer.length };
    }
  }

  // 3. Per-command closers, before opens: the "bold" in "end bold" must not
  //    open a new bold scope.
  const closer = matchCloser(tokens, index);
  if (closer !== null) {
    return { name: "closeScope", wordCount: closer.wordCount, command: closer.command };
  }

  // 2b. Transformation closers, same band as the scope closers above.
  const transformCloser = matchTransformCloser(tokens, index);
  if (transformCloser !== null) {
    return {
      name: "closeTransform",
      wordCount: transformCloser.wordCount,
      transform: transformCloser.command,
    };
  }

  // 4. Multi-word standalone phrases, before the one-word opens below.
  if (peekPhrase(tokens, index, PHRASE_NEW_PARAGRAPH)) {
    return { name: "newParagraph", wordCount: PHRASE_NEW_PARAGRAPH.length };
  }
  if (peekPhrase(tokens, index, PHRASE_NEW_LINE)) {
    return { name: "newLine", wordCount: PHRASE_NEW_LINE.length };
  }
  if (peekPhrase(tokens, index, PHRASE_NEXT_ITEM)) {
    return { name: "nextItem", wordCount: PHRASE_NEXT_ITEM.length };
  }
  if (peekPhrase(tokens, index, PHRASE_CHECK_THAT)) {
    return { name: "checkThat", wordCount: PHRASE_CHECK_THAT.length };
  }
  if (peekPhrase(tokens, index, PHRASE_UNCHECK_THAT)) {
    return { name: "uncheckThat", wordCount: PHRASE_UNCHECK_THAT.length };
  }
  if (peekPhrase(tokens, index, PHRASE_HORIZONTAL_RULE)) {
    return { name: "divider", wordCount: PHRASE_HORIZONTAL_RULE.length };
  }
  if (peekPhrase(tokens, index, PHRASE_SCRATCH_THAT)) {
    return { name: "scratchThat", wordCount: PHRASE_SCRATCH_THAT.length };
  }

  // "code block" is two words and must beat the one-word "code" open below.
  for (const open of CODE_BLOCK_OPENS) {
    if (peekPhrase(tokens, index, open)) {
      return { name: "openCodeBlock", wordCount: open.length };
    }
  }

  // 5. Opens. "bullet list" is two words and is tried before one-word opens.
  const open = matchOpen(tokens, index);
  if (open !== null) {
    return { name: "openScope", wordCount: open.wordCount, command: open.command };
  }

  // 5b. Transformation opens, same band as the scope opens above. Every open
  //     phrase in both tables is one or two words, so neither can shadow the
  //     other; MAX_PHRASE_WORDS is what keeps that true.
  const transformOpen = matchTransformOpen(tokens, index);
  if (transformOpen !== null) {
    return {
      name: "openTransform",
      wordCount: transformOpen.wordCount,
      transform: transformOpen.command,
    };
  }

  if (peekPhrase(tokens, index, PHRASE_HEADING)) {
    return { name: "openHeading", wordCount: PHRASE_HEADING.length };
  }

  if (peekPhrase(tokens, index, PHRASE_DIVIDER)) {
    return { name: "divider", wordCount: PHRASE_DIVIDER.length };
  }

  // 6. Insertions.
  if (peekPhrase(tokens, index, PHRASE_EMOJI)) {
    return { name: "emoji", wordCount: PHRASE_EMOJI.length };
  }
  if (peekPhrase(tokens, index, PHRASE_LINK)) {
    return { name: "link", wordCount: PHRASE_LINK.length };
  }

  return null;
}

