/**
 * parse.ts — tokens -> document model.
 *
 * PURITY: imports only from model/ and sibling parser modules. No React, no
 * DOM, no audio, no network. Given the same text and config it always produces
 * the same document.
 *
 * ---------------------------------------------------------------------------
 * HOW IT WORKS
 *
 * Two passes, because "scratch that" needs something to undo:
 *
 *   1. readActions()  tokens  -> Action[]   (the semantic edits the user spoke)
 *   2. applyActions() Action[] -> DocumentModel + ParserState
 *
 * "scratch that" simply pops the last Action, and pass 2 rebuilds the document
 * from what remains. No separate undo machinery, and two "scratch that"s in a
 * row naturally remove two actions.
 *
 * ---------------------------------------------------------------------------
 * GRAMMAR
 *
 * Commands are spoken bare; there is no trigger word. Marks and blocks are
 * opened by one phrase and closed by another, so a phrase never depends on
 * hidden state to know what it means:
 *
 *   bold this week end bold        ->  **this week**
 *   quote he said no unquote       ->  > he said no
 *
 * The escape word (default "say") is the only way to speak a command word as
 * text: "say bold" emits the literal word "bold".
 *
 * ---------------------------------------------------------------------------
 * PRECEDENCE (the order of checks matters; keep it in this order)
 *
 *   1. The escape word is checked FIRST, before any command, so "say end"
 *      emits the literal word "end".
 *   2. The universal closers "end all" and "end innermost" ("end format") are
 *      checked before the per-command closers, so their second word is never
 *      mistaken for something else.
 *   3. Among closers, LONGER wins: "end code block" is checked before "end
 *      code", or it would be read as inline code plus a stray "block".
 *   4. Per-command closers ("end bold", "unbold") before opens, so the "bold"
 *      inside "end bold" never opens a new bold scope.
 *   5. Within opens and standalone phrases alike, LONGER phrases are matched
 *      before shorter ones: "new paragraph" beats a bare "new", "bullet list"
 *      beats "bullet", "code block" beats "code".
 *   6. "link" only counts as a command when a "to" keyword follows it before
 *      the next command. Otherwise it is literal text.
 *   7. "emoji" only counts as a command when the following words name a known
 *      emoji. Otherwise it is literal text.
 *   8. Anything else is literal text. An unrecognized word after "end"
 *      ("end fnord") is not a closer, so both words fall through as text and
 *      nothing the user said is lost.
 *
 * ---------------------------------------------------------------------------
 * CLOSING RULES
 *
 *   end <x>       closes the nearest open <x>, wherever it sits in the stack.
 *                 "bold a italic b end bold" closes bold and leaves italic open.
 *   end format    closes the innermost still-open scope, mark or block. Saying
 *                 it again closes the next one out.
 *   end all       closes every still-open scope.
 *
 * A close with no matching open is a NO-OP: the words are dropped, not
 * inserted. Someone who says "end bold" plainly meant to close something, and
 * printing the literal words "end bold" into their prose would be worse than
 * doing nothing. This is the one place where recognized words are not emitted;
 * it applies only to recognized closers, never to unknown words.
 *
 * An open that is never closed simply runs to the end of the block. The UI's
 * active-mark chips show what is still open.
 *
 * ---------------------------------------------------------------------------
 * TRANSFORMATIONS
 *
 * "map", "math" and "date" are open/close pairs whose content is COMPUTED
 * rather than emitted. The words between the phrases are collected, handed to a
 * pure function in transforms/, and the result is what lands in the document:
 *
 *   math 45 plus 12 plus 82 end math   ->  139
 *   date next friday end date          ->  2026-09-11
 *   map 1600 Pennsylvania Avenue end map -> a Google Maps link
 *
 * They resolve during pass 1, scanning ahead for their own closer. "end all"
 * and "end format" also end them, but are left unconsumed so the main loop can
 * still close whatever else was open — that is what makes
 * "bold math 2 plus 2 end all" produce a bold "4".
 *
 * If a transform cannot make sense of its content, the spoken words come back
 * as literal text with a non-blocking notice. Nothing is lost, nothing throws.
 * Empty content produces nothing at all.
 *
 * ---------------------------------------------------------------------------
 * "SCRATCH THAT" SCOPE
 *
 * It removes the last action: either the last run of spoken text (every word
 * since the previous command) or the last structural action (an open, a close,
 * a break, a new paragraph, a list item, an emoji, a link).
 */

import type { DocumentModel, HeadingLevel, ListStyle, Mark } from "../model/documentModel.js";
import {
  addListItem,
  appendBreak,
  appendCodeBlock,
  appendDivider,
  appendEmoji,
  appendLink,
  appendText,
  createBuilder,
  finishDocument,
  normalizeMarks,
  setCurrentItemChecked,
  startHeading,
  startList,
  startNewParagraph,
  startQuote,
} from "../model/documentModel.js";
import type { ParserConfig, ScopeCommand, ScopeTarget, TransformCommand } from "./commands.js";
import {
  CLIPBOARD_HREF_SENTINEL,
  CODE_BLOCK_CLOSERS,
  CODE_BLOCK_OPENS,
  DEFAULT_CONFIG,
  HEADING_CLOSERS,
  LINK_CLIPBOARD_KEYWORD,
  LINK_TARGET_KEYWORD,
  MAX_PHRASE_WORDS,
  PHRASE_EMOJI,
  PHRASE_END_ALL,
  PHRASE_END_INNERMOST,
  PHRASE_HEADING,
  PHRASE_LINK,
  PHRASE_NEW_LINE,
  PHRASE_NEW_PARAGRAPH,
  PHRASE_CHECK_THAT,
  PHRASE_DIVIDER,
  PHRASE_HORIZONTAL_RULE,
  PHRASE_NEXT_ITEM,
  PHRASE_SCRATCH_THAT,
  PHRASE_UNCHECK_THAT,
  SCOPE_COMMANDS,
  TRANSFORM_COMMANDS,
  resolveCodeLanguage,
  resolveHeadingLevel,
  validateConfig,
} from "./commands.js";
import { MAX_EMOJI_NAME_WORDS, isEmojiNamePrefix, lookUpEmoji } from "./emoji.js";
import { normalizeSpokenUrl } from "./normalizeSpokenUrl.js";
import { resolveDate } from "./transforms/dateResolve.js";
import { buildMapsLink } from "./transforms/mapsLink.js";
import { evaluateSpokenMath } from "./transforms/math.js";
import type { Token } from "./tokenize.js";
import { tokenize } from "./tokenize.js";

// ---------------------------------------------------------------------------
// Public shapes
// ---------------------------------------------------------------------------

/** What is still open at the end of the transcript. Drives the UI chips. */
export interface ParserState {
  activeMarks: Mark[];
  inQuote: boolean;
  /** Which list is open, or null. */
  openList: ListStyle | null;
  /** The level of the open heading, or null. */
  headingLevel: HeadingLevel | null;
}

/** A non-blocking message for the user (e.g. an emoji name we did not know). */
export interface ParseNotice {
  kind: "unknownEmoji" | "transformFailed";
  message: string;
}

export interface ParseResult {
  document: DocumentModel;
  state: ParserState;
  notices: ParseNotice[];
}

// ---------------------------------------------------------------------------
// Actions — the intermediate representation between the two passes
// ---------------------------------------------------------------------------

type Action =
  /** A run of literal spoken words. Consecutive words merge into one action. */
  | { kind: "text"; words: string[] }
  | { kind: "openScope"; target: ScopeTarget }
  | { kind: "closeScope"; target: ScopeTarget }
  | { kind: "closeInnermost" }
  | { kind: "closeAll" }
  | { kind: "break" }
  | { kind: "newParagraph" }
  | { kind: "nextItem" }
  | { kind: "setChecked"; checked: boolean }
  | { kind: "divider" }
  | { kind: "codeBlock"; language: string; code: string }
  | { kind: "emoji"; glyph: string }
  | { kind: "link"; text: string; href: string }
  /**
   * The computed output of a transformation. Kept distinct from "text" so that
   * "scratch that" removes the result on its own rather than taking the
   * surrounding sentence with it.
   */
  | { kind: "transformResult"; text: string };

// ---------------------------------------------------------------------------
// Phrase matching
// ---------------------------------------------------------------------------

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
function matchCommand(tokens: readonly Token[], index: number): CommandMatch | null {
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

// ---------------------------------------------------------------------------
// Emoji and link readers
// ---------------------------------------------------------------------------

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
function readEmoji(tokens: readonly Token[], keywordIndex: number): EmojiReading | null {
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
function isEmojiNameStillArriving(tokens: readonly Token[], keywordIndex: number): boolean {
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
function readLink(
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

// ---------------------------------------------------------------------------
// Transformations
// ---------------------------------------------------------------------------

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
function readTransformContent(
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
function runTransform(
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

// ---------------------------------------------------------------------------
// Fenced code blocks
// ---------------------------------------------------------------------------

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
function readCodeBlock(tokens: readonly Token[], contentStart: number): CodeBlockReading {
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

// ---------------------------------------------------------------------------
// Pass 1: tokens -> actions
// ---------------------------------------------------------------------------

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
 * Applies the command found at `index`.
 *
 * Returns how many tokens were consumed, or 0 when nothing usable was found —
 * in which case the caller emits the word as literal text and moves on by one.
 */
function readCommand(
  tokens: readonly Token[],
  index: number,
  config: ParserConfig,
  now: Date,
  actions: Action[],
  notices: ParseNotice[],
): number {
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
function readActions(tokens: readonly Token[], config: ParserConfig, now: Date): ReadResult {
  const escape = config.escapeWord.toLowerCase();

  const actions: Action[] = [];
  const notices: ParseNotice[] = [];
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
    const consumed = readCommand(tokens, index, config, now, actions, notices);
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

// ---------------------------------------------------------------------------
// Pass 2: actions -> document
// ---------------------------------------------------------------------------

/**
 * Whether two scopes are the same thing.
 *
 * Only the KIND is compared (plus which mark, for marks). A heading's level, a
 * list's style and a code block's language are settings of the scope, not part
 * of its identity — which is exactly why one spoken "end list" closes whichever
 * list is open, and "end heading" closes a heading at any level.
 */
function sameTarget(a: ScopeTarget, b: ScopeTarget): boolean {
  if (a.kind !== b.kind) {
    return false;
  }
  if (a.kind === "mark" && b.kind === "mark") {
    return a.mark === b.mark;
  }
  return true;
}

/** Marks are inline; everything else occupies the one open block slot. */
function isBlockScope(target: ScopeTarget): boolean {
  return target.kind !== "mark";
}

/**
 * The open scopes, innermost last. Marks and blocks live together so that
 * "end format" can close whichever was opened most recently.
 */
type ScopeStack = ScopeTarget[];

function activeMarksOf(scopes: ScopeStack): Mark[] {
  const marks: Mark[] = [];
  for (const scope of scopes) {
    if (scope.kind === "mark") {
      marks.push(scope.mark);
    }
  }
  return normalizeMarks(marks);
}

function openListStyle(scopes: ScopeStack): ListStyle | null {
  for (const scope of scopes) {
    if (scope.kind === "list") {
      return scope.style;
    }
  }
  return null;
}

function openHeadingLevel(scopes: ScopeStack): HeadingLevel | null {
  for (const scope of scopes) {
    if (scope.kind === "heading") {
      return scope.level;
    }
  }
  return null;
}

function hasQuote(scopes: ScopeStack): boolean {
  for (const scope of scopes) {
    if (scope.kind === "quote") {
      return true;
    }
  }
  return false;
}

function applyActions(actions: readonly Action[]): { document: DocumentModel; state: ParserState } {
  const builder = createBuilder();
  const scopes: ScopeStack = [];

  /** Drops every open block scope, without touching the builder. */
  function removeBlockScopes(): void {
    for (let i = scopes.length - 1; i >= 0; i--) {
      const scope = scopes[i];
      if (scope !== undefined && isBlockScope(scope)) {
        scopes.splice(i, 1);
      }
    }
  }

  /** Opens a block, closing any block already open — the model does not nest. */
  function openBlockScope(target: ScopeTarget): void {
    removeBlockScopes();
    scopes.push(target);

    switch (target.kind) {
      case "quote":
        startQuote(builder);
        break;
      case "list":
        startList(builder, target.style);
        break;
      case "heading":
        startHeading(builder, target.level);
        break;
      case "mark":
        // Unreachable: marks are not block scopes.
        break;
    }
  }

  /**
   * Opens a mark. Opening one that is already open is a no-op, so a single
   * close is always enough to end it.
   */
  function openMark(target: ScopeTarget): void {
    for (const scope of scopes) {
      if (sameTarget(scope, target)) {
        return;
      }
    }
    scopes.push(target);
  }

  /** Closes the nearest matching open scope. No match is a documented no-op. */
  function closeScope(target: ScopeTarget): void {
    for (let i = scopes.length - 1; i >= 0; i--) {
      const scope = scopes[i];
      if (scope !== undefined && sameTarget(scope, target)) {
        scopes.splice(i, 1);
        if (isBlockScope(scope)) {
          startNewParagraph(builder);
        }
        return;
      }
    }
  }

  /** Closes whatever was opened most recently, mark or block. */
  function closeInnermost(): void {
    const scope = scopes.pop();
    if (scope !== undefined && isBlockScope(scope)) {
      startNewParagraph(builder);
    }
  }

  for (const action of actions) {
    switch (action.kind) {
      case "text":
        appendText(builder, action.words.join(" "), activeMarksOf(scopes));
        break;

      case "openScope":
        if (isBlockScope(action.target)) {
          openBlockScope(action.target);
        } else {
          openMark(action.target);
        }
        break;

      case "closeScope":
        closeScope(action.target);
        break;

      case "closeInnermost":
        closeInnermost();
        break;

      case "closeAll":
        while (scopes.length > 0) {
          closeInnermost();
        }
        break;

      case "break":
        appendBreak(builder);
        break;

      case "newParagraph":
        removeBlockScopes();
        startNewParagraph(builder);
        break;

      case "nextItem":
        // Spoken outside a list this starts one, so the words that follow are
        // still captured rather than lost.
        if (openListStyle(scopes) === null) {
          openBlockScope({ kind: "list", style: "bullet" });
        } else {
          addListItem(builder);
        }
        break;

      case "setChecked":
        setCurrentItemChecked(builder, action.checked);
        break;

      case "divider":
        // A rule sits between blocks, so it ends whatever was open.
        removeBlockScopes();
        appendDivider(builder);
        break;

      case "codeBlock":
        removeBlockScopes();
        appendCodeBlock(builder, action.language, action.code);
        break;

      case "transformResult":
        // The computed value carries whatever marks are open, so a math result
        // inside a bold span comes out bold.
        appendText(builder, action.text, activeMarksOf(scopes));
        break;

      case "emoji":
        appendEmoji(builder, action.glyph);
        break;

      case "link":
        appendLink(builder, action.text, action.href, activeMarksOf(scopes));
        break;
    }
  }

  return {
    document: finishDocument(builder),
    state: {
      activeMarks: activeMarksOf(scopes),
      inQuote: hasQuote(scopes),
      openList: openListStyle(scopes),
      headingLevel: openHeadingLevel(scopes),
    },
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Parses a transcript into a document model.
 *
 * The input is a plain string, whatever produced it — a textarea, or a live
 * speech stream. The parser neither knows nor cares.
 *
 * DETERMINISM: for any fixed (text, config, now) the output is identical. The
 * clock is a parameter rather than something this module reads, so the date
 * transformation stays pure and testable; `now` defaults to the current time
 * purely as a convenience for callers that use no date commands, and that
 * default is the single place in the parser where the clock is touched.
 */
export function parse(
  text: string,
  config: ParserConfig = DEFAULT_CONFIG,
  now: Date = new Date(),
): ParseResult {
  validateConfig(config);

  const tokens = tokenize(text);
  const { actions, notices } = readActions(tokens, config, now);
  const { document, state } = applyActions(actions);

  return { document, state, notices };
}
