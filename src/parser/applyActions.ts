/**
 * applyActions.ts — pass 2: actions in, document out.
 *
 * Replays the action list against a document builder. Rebuilding from scratch
 * each time is what makes "scratch that" a matter of dropping an action rather
 * than of undoing an edit.
 *
 * All the bookkeeping about what is currently open lives in scopes.ts, which
 * leaves this as a plain list of "this action does that".
 */

import type { DocumentModel } from "../model/documentModel.js";
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
  setCurrentItemChecked,
  startNewParagraph,
} from "../model/documentModel.js";
import { createScopes } from "./scopes.js";
import type { Action, ParserState } from "./types.js";

export function applyActions(actions: readonly Action[]): {
  document: DocumentModel;
  state: ParserState;
} {
  const builder = createBuilder();
  const scopes = createScopes(builder);

  for (const action of actions) {
    switch (action.kind) {
      case "text":
        appendText(builder, action.words.join(" "), scopes.activeMarks());
        break;

      case "openScope":
        scopes.open(action.target);
        break;

      case "closeScope":
        scopes.close(action.target);
        break;

      case "closeInnermost":
        scopes.closeInnermost();
        break;

      case "closeAll":
        scopes.closeAll();
        break;

      case "break":
        appendBreak(builder);
        break;

      case "newParagraph":
        scopes.clearBlocks();
        startNewParagraph(builder);
        break;

      case "nextItem":
        // Spoken outside a list this starts one, so the words that follow are
        // still captured rather than lost.
        if (scopes.openList() === null) {
          scopes.open({ kind: "list", style: "bullet" });
        } else {
          addListItem(builder);
        }
        break;

      case "setChecked":
        setCurrentItemChecked(builder, action.checked);
        break;

      case "divider":
        // A rule sits between blocks, so it ends whatever was open.
        scopes.clearBlocks();
        appendDivider(builder);
        break;

      case "codeBlock":
        scopes.clearBlocks();
        appendCodeBlock(builder, action.language, action.code);
        break;

      case "transformResult":
        // The computed value carries whatever marks are open, so a math result
        // inside a bold span comes out bold.
        appendText(builder, action.text, scopes.activeMarks());
        break;

      case "emoji":
        appendEmoji(builder, action.glyph);
        break;

      case "link":
        appendLink(builder, action.text, action.href, scopes.activeMarks());
        break;
    }
  }

  return {
    document: finishDocument(builder),
    state: {
      activeMarks: scopes.activeMarks(),
      inQuote: scopes.inQuote(),
      openList: scopes.openList(),
      headingLevel: scopes.openHeading(),
    },
  };
}
