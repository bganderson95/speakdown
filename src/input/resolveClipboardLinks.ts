/**
 * resolveClipboardLinks.ts — turns clipboard link sentinels into real hrefs.
 *
 * This lives in input/ rather than parser/ on purpose. Reading the clipboard
 * needs a browser API, a secure context (localhost or HTTPS) and a user
 * gesture, none of which belong in the pure parser. parse.ts emits
 * CLIPBOARD_HREF_SENTINEL and this module resolves it afterwards.
 *
 * The transform itself is pure and takes the clipboard text as an argument, so
 * it is trivially testable. readClipboardText() is the one impure function here
 * and the UI is what calls it, inside a user gesture.
 */

import type { Block, DocumentModel, Inline, ListItem } from "../model/documentModel.js";
import { CLIPBOARD_HREF_SENTINEL } from "../parser/commands.js";

export interface ClipboardNotice {
  kind: "resolved" | "unavailable";
  message: string;
}

export interface ClipboardResolution {
  document: DocumentModel;
  notices: ClipboardNotice[];
}

/** Every inline in a block, whatever kind of block it is. */
function inlinesOf(block: Block): Inline[] {
  switch (block.kind) {
    case "paragraph":
    case "heading":
    case "quote":
      return block.children;
    case "list": {
      const inlines: Inline[] = [];
      for (const item of block.items) {
        inlines.push(...item.children);
      }
      return inlines;
    }
    case "codeBlock":
    case "divider":
      // Neither holds inline nodes, so neither can hold a link.
      return [];
  }
}

/** True when the document contains at least one unresolved clipboard link. */
export function hasClipboardLinks(document: DocumentModel): boolean {
  for (const block of document.blocks) {
    for (const inline of inlinesOf(block)) {
      if (inline.kind === "link" && inline.href === CLIPBOARD_HREF_SENTINEL) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Replaces every clipboard sentinel.
 *
 * With a usable URL the link gets that href. Without one the link degrades to
 * plain text carrying the same display words and marks — the user's words are
 * never lost, and nothing throws.
 */
function resolveInline(inline: Inline, clipboardUrl: string | null): Inline {
  if (inline.kind !== "link" || inline.href !== CLIPBOARD_HREF_SENTINEL) {
    return inline;
  }
  if (clipboardUrl === null || clipboardUrl.trim().length === 0) {
    return { kind: "text", text: inline.text, marks: inline.marks };
  }
  return { ...inline, href: clipboardUrl.trim() };
}

function resolveInlines(inlines: readonly Inline[], clipboardUrl: string | null): Inline[] {
  const resolved: Inline[] = [];
  for (const inline of inlines) {
    resolved.push(resolveInline(inline, clipboardUrl));
  }
  return resolved;
}

function resolveBlock(block: Block, clipboardUrl: string | null): Block {
  switch (block.kind) {
    case "paragraph":
      return { kind: "paragraph", children: resolveInlines(block.children, clipboardUrl) };
    case "heading":
      return {
        kind: "heading",
        level: block.level,
        children: resolveInlines(block.children, clipboardUrl),
      };
    case "quote":
      return { kind: "quote", children: resolveInlines(block.children, clipboardUrl) };
    case "list": {
      const items: ListItem[] = [];
      for (const item of block.items) {
        const resolved: ListItem = { children: resolveInlines(item.children, clipboardUrl) };
        if (item.checked !== undefined) {
          resolved.checked = item.checked;
        }
        items.push(resolved);
      }
      return { kind: "list", style: block.style, items };
    }
    case "codeBlock":
    case "divider":
      // Nothing inline to resolve.
      return block;
  }
}

/**
 * Resolves clipboard links in a document.
 *
 * Pass the clipboard text, or null when it could not be read. Returns the
 * document unchanged (same reference) when there was nothing to resolve.
 */
export function resolveClipboardLinks(
  document: DocumentModel,
  clipboardUrl: string | null,
): ClipboardResolution {
  if (!hasClipboardLinks(document)) {
    return { document, notices: [] };
  }

  const blocks: Block[] = [];
  for (const block of document.blocks) {
    blocks.push(resolveBlock(block, clipboardUrl));
  }

  const usable = clipboardUrl !== null && clipboardUrl.trim().length > 0;
  const notices: ClipboardNotice[] = [
    usable
      ? { kind: "resolved", message: `Clipboard link set to ${clipboardUrl.trim()}` }
      : {
          kind: "unavailable",
          message: "Could not read the clipboard, so the link text was kept as plain text.",
        },
  ];

  return { document: { blocks }, notices };
}

/**
 * Reads the system clipboard. Returns null when it is unavailable — no secure
 * context, no permission, or nothing on the clipboard.
 *
 * Call this from a user gesture; browsers reject clipboard reads otherwise.
 */
export async function readClipboardText(): Promise<string | null> {
  if (typeof navigator === "undefined" || navigator.clipboard === undefined) {
    return null;
  }
  try {
    const text = await navigator.clipboard.readText();
    if (text.trim().length === 0) {
      return null;
    }
    return text;
  } catch {
    return null;
  }
}
