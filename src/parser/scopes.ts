/**
 * scopes.ts — what is currently open, and what opening or closing one does.
 *
 * Marks and blocks share one stack so that "end format" can close whichever was
 * opened most recently, whatever kind it was. Only one block can be open at a
 * time, because the document model does not nest them.
 *
 * Keeping this here leaves applyActions.ts as a plain list of "this action does
 * that", with none of the bookkeeping in the way.
 */

import type {
  DocumentBuilder,
  HeadingLevel,
  ListStyle,
  Mark,
} from "../model/documentModel.js";
import {
  normalizeMarks,
  startHeading,
  startList,
  startNewParagraph,
  startQuote,
} from "../model/documentModel.js";
import type { ScopeTarget } from "./commands.js";

/**
 * Whether two scopes are the same thing.
 *
 * Only the KIND is compared (plus which mark, for marks). A heading's level and
 * a list's style are settings of the scope, not part of its identity — which is
 * exactly why one spoken "end list" closes whichever list is open, and "end
 * heading" closes a heading at any level.
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
function isBlock(target: ScopeTarget): boolean {
  return target.kind !== "mark";
}

export interface Scopes {
  /** Opens a mark, or a block — which closes any block already open. */
  open: (target: ScopeTarget) => void;
  /** Closes the nearest matching scope. No match is a documented no-op. */
  close: (target: ScopeTarget) => void;
  /** Closes whatever was opened most recently, mark or block. */
  closeInnermost: () => void;
  closeAll: () => void;
  /** Ends every open block without touching marks. */
  clearBlocks: () => void;
  activeMarks: () => Mark[];
  openList: () => ListStyle | null;
  openHeading: () => HeadingLevel | null;
  inQuote: () => boolean;
}

export function createScopes(builder: DocumentBuilder): Scopes {
  /** Innermost last. */
  const stack: ScopeTarget[] = [];

  function find(predicate: (target: ScopeTarget) => boolean): ScopeTarget | undefined {
    return stack.find(predicate);
  }

  function clearBlocks(): void {
    for (let i = stack.length - 1; i >= 0; i--) {
      const scope = stack[i];
      if (scope !== undefined && isBlock(scope)) {
        stack.splice(i, 1);
      }
    }
  }

  function openBlock(target: ScopeTarget): void {
    clearBlocks();
    stack.push(target);

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
        // Unreachable: marks are not blocks.
        break;
    }
  }

  function closeInnermost(): void {
    const scope = stack.pop();
    if (scope !== undefined && isBlock(scope)) {
      startNewParagraph(builder);
    }
  }

  return {
    open(target) {
      if (isBlock(target)) {
        openBlock(target);
        return;
      }
      // Opening a mark that is already open is a no-op, so a single close is
      // always enough to end it.
      if (!stack.some((scope) => sameTarget(scope, target))) {
        stack.push(target);
      }
    },

    close(target) {
      for (let i = stack.length - 1; i >= 0; i--) {
        const scope = stack[i];
        if (scope !== undefined && sameTarget(scope, target)) {
          stack.splice(i, 1);
          if (isBlock(scope)) {
            startNewParagraph(builder);
          }
          return;
        }
      }
    },

    closeInnermost,

    closeAll() {
      while (stack.length > 0) {
        closeInnermost();
      }
    },

    clearBlocks,

    activeMarks() {
      const marks: Mark[] = [];
      for (const scope of stack) {
        if (scope.kind === "mark") {
          marks.push(scope.mark);
        }
      }
      return normalizeMarks(marks);
    },

    openList() {
      const scope = find((s) => s.kind === "list");
      return scope !== undefined && scope.kind === "list" ? scope.style : null;
    },

    openHeading() {
      const scope = find((s) => s.kind === "heading");
      return scope !== undefined && scope.kind === "heading" ? scope.level : null;
    },

    inQuote() {
      return find((s) => s.kind === "quote") !== undefined;
    },
  };
}
