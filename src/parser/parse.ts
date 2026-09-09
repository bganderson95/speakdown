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

import { applyActions } from "./applyActions.js";
import type { ParserConfig } from "./commands.js";
import { DEFAULT_CONFIG, validateConfig } from "./commands.js";
import { readActions } from "./readActions.js";
import { tokenize } from "./tokenize.js";
import type { ParseResult } from "./types.js";

export type { ParseNotice, ParseResult, ParserState } from "./types.js";

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
