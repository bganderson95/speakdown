/**
 * types.ts — the shapes the parser hands out, and the one it uses internally.
 *
 * Kept apart from parse.ts so that both passes can name them without importing
 * the entry point that calls them. parse.ts re-exports the public three, so
 * callers still import them from there.
 */

import type { DocumentModel, HeadingLevel, ListStyle, Mark } from "../model/documentModel.js";
import type { ScopeTarget } from "./commands.js";

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

export type Action =
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

