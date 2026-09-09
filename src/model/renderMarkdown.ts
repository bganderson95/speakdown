/**
 * renderMarkdown.ts — DocumentModel -> markdown string ("raw" view).
 *
 * PURITY: imports only from documentModel.ts. No React, no DOM.
 *
 * Deterministic by construction: same model in, same string out.
 *
 * NOTE ON ESCAPING: v1 does not escape markdown metacharacters in spoken text.
 * Speech transcripts do not contain `*` or `_`, and escaping would make the raw
 * view harder to read for no benefit. If a future input source can produce
 * metacharacters, escaping belongs here.
 */

import type {
  Block,
  DocumentModel,
  Inline,
  ListItem,
  ListStyle,
  Mark,
  WrappingMark,
} from "./documentModel.js";
import { WRAPPING_MARK_ORDER } from "./documentModel.js";

/** The markdown delimiter for each wrapping mark. */
function delimiterFor(mark: WrappingMark): string {
  switch (mark) {
    case "bold":
      return "**";
    case "italic":
      return "*";
    case "strikethrough":
      return "~~";
    case "code":
      return "`";
  }
}

/**
 * Applies a run's marks.
 *
 * "caps" comes first because it changes the characters themselves; markdown has
 * no capitalization syntax, so real uppercase is the only form that survives.
 * The wrapping marks then nest in the canonical order from WRAPPING_MARK_ORDER:
 * bold outermost, then italic, then code. Bold + italic therefore renders as
 * `***text***` (`**` opened first, `*` second).
 */
function applyMarks(text: string, marks: readonly Mark[]): string {
  let result = marks.includes("caps") ? text.toUpperCase() : text;

  // Walk inside-out so the outermost mark is applied last.
  for (let i = WRAPPING_MARK_ORDER.length - 1; i >= 0; i--) {
    const mark = WRAPPING_MARK_ORDER[i];
    if (mark !== undefined && marks.includes(mark)) {
      const delimiter = delimiterFor(mark);
      result = `${delimiter}${result}${delimiter}`;
    }
  }
  return result;
}

function renderInline(inline: Inline): string {
  switch (inline.kind) {
    case "text":
      return applyMarks(inline.text, inline.marks);
    case "link":
      return `[${applyMarks(inline.text, inline.marks)}](${inline.href})`;
    case "emoji":
      return inline.glyph;
    case "break":
      // Markdown soft break: two trailing spaces before the newline.
      return "  \n";
  }
}

function renderInlines(inlines: readonly Inline[]): string {
  let result = "";
  for (const inline of inlines) {
    result += renderInline(inline);
  }
  return result;
}

/** Prefixes every line of `text` with `prefix` (used for blockquotes). */
function prefixLines(text: string, prefix: string): string {
  const lines = text.split("\n");
  const prefixed: string[] = [];
  for (const line of lines) {
    prefixed.push(`${prefix}${line}`);
  }
  return prefixed.join("\n");
}

/** The bullet or number that introduces a list item. */
function itemMarker(style: ListStyle, item: ListItem, index: number): string {
  switch (style) {
    case "bullet":
      return "- ";
    case "ordered":
      // Markdown renumbers automatically, but writing the real numbers makes
      // the raw view read the way the list actually looks.
      return `${index + 1}. `;
    case "task":
      return item.checked === true ? "- [x] " : "- [ ] ";
  }
}

/**
 * A fence long enough to contain the code.
 *
 * Three backticks is the norm, but code containing a run of backticks needs a
 * longer fence, or the block would end early.
 */
function fenceFor(code: string): string {
  let longest = 0;
  for (const run of code.match(/`+/g) ?? []) {
    longest = Math.max(longest, run.length);
  }
  return "`".repeat(Math.max(3, longest + 1));
}

function renderBlock(block: Block): string {
  switch (block.kind) {
    case "paragraph":
      return renderInlines(block.children);

    case "heading":
      // Headings are single-line in markdown, so a soft break becomes a space.
      return `${"#".repeat(block.level)} ${renderInlines(block.children).replace(/ {2}\n/g, " ")}`;

    case "quote":
      return prefixLines(renderInlines(block.children), "> ");

    case "list": {
      const items: string[] = [];
      for (let index = 0; index < block.items.length; index++) {
        const item = block.items[index];
        if (item === undefined) {
          continue;
        }
        const marker = itemMarker(block.style, item, index);
        // A soft break inside an item stays indented under its marker.
        const indent = " ".repeat(marker.length);
        const content = renderInlines(item.children).split("\n").join(`\n${indent}`);
        items.push(`${marker}${content}`);
      }
      return items.join("\n");
    }

    case "codeBlock": {
      const fence = fenceFor(block.code);
      return `${fence}${block.language}\n${block.code}\n${fence}`;
    }

    case "divider":
      return "---";
  }
}

/** Renders the whole document. Blocks are separated by one blank line. */
export function renderMarkdown(document: DocumentModel): string {
  const rendered: string[] = [];
  for (const block of document.blocks) {
    rendered.push(renderBlock(block));
  }
  return rendered.join("\n\n");
}
