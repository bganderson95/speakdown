/**
 * documentModel.ts — the backbone of Speakdown.
 *
 * The parser writes this model; both renderers (markdown + HTML) read it.
 * Because there is exactly one model, the "rendered" and "raw" views can never
 * disagree.
 *
 * PURITY: this module imports nothing. No React, no DOM, no audio, no network.
 */

/** Inline styling marks that can stack on a run of text. */
export type Mark = "bold" | "italic" | "code" | "strikethrough" | "caps";

/**
 * Marks applied by WRAPPING the text in delimiters or tags.
 *
 * Marks are order-independent as data, but renderers need a stable nesting
 * order so output is deterministic. Outermost first: bold wraps italic wraps
 * code. See renderMarkdown.ts / renderHtml.ts.
 */
export type WrappingMark = "bold" | "italic" | "strikethrough" | "code";

export const WRAPPING_MARK_ORDER: readonly WrappingMark[] = [
  "bold",
  "italic",
  "strikethrough",
  "code",
];

/**
 * The canonical order marks are sorted into, so equal mark sets are equal
 * arrays. The wrapping marks come first, then the transforming ones.
 *
 * "caps" is not a wrapping mark: neither markdown nor HTML has a syntax for
 * capitalization, so the only representation that survives being copied out of
 * the raw view is genuinely uppercased characters. Both renderers do exactly
 * that, which is what keeps the two views identical.
 */
export const MARK_ORDER: readonly Mark[] = [
  "bold",
  "italic",
  "strikethrough",
  "code",
  "caps",
];

/**
 * A contiguous run of text sharing the same set of marks.
 *
 * v2 seam (prosody): word timings would live here as an optional
 * `timing?: { startMs: number; endMs: number }` field. Nothing in the model or
 * the renderers inspects unknown fields, so adding it is additive.
 */
export interface TextRun {
  kind: "text";
  text: string;
  marks: Mark[];
}

/** An inline link: display text (which may itself carry marks) + target URL. */
export interface LinkRun {
  kind: "link";
  text: string;
  href: string;
  marks: Mark[];
}

/** An emoji, stored as its rendered glyph. */
export interface EmojiRun {
  kind: "emoji";
  glyph: string;
}

/**
 * A soft line break inside a block (spoken as "new line").
 *
 * DESIGN CHOICE: a soft break is its own inline node rather than a "\n"
 * hidden inside a TextRun. A dedicated node means text runs never contain
 * control characters, so mark merging, undo and rendering all stay unambiguous.
 */
export interface BreakRun {
  kind: "break";
}

export type Inline = TextRun | LinkRun | EmojiRun | BreakRun;

/** Markdown supports six heading levels and no more. */
export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * The three list flavours share one block kind. They differ only in how each
 * item is marked, which is what lets a single spoken "end list" close whichever
 * one is open.
 */
export type ListStyle = "bullet" | "ordered" | "task";

export interface ListItem {
  children: Inline[];
  /** Only meaningful when the list's style is "task". */
  checked?: boolean;
}

/** Block-level containers. */
export type Block =
  | { kind: "paragraph"; children: Inline[] }
  | { kind: "heading"; level: HeadingLevel; children: Inline[] }
  | { kind: "quote"; children: Inline[] }
  | { kind: "list"; style: ListStyle; items: ListItem[] }
  | { kind: "codeBlock"; language: string; code: string }
  | { kind: "divider" };

export interface DocumentModel {
  blocks: Block[];
}

/** An empty document. */
export function emptyDocument(): DocumentModel {
  return { blocks: [] };
}

// ---------------------------------------------------------------------------
// Mark helpers
// ---------------------------------------------------------------------------

/** Returns marks sorted into MARK_ORDER, so equal mark sets are equal arrays. */
export function normalizeMarks(marks: readonly Mark[]): Mark[] {
  const sorted: Mark[] = [];
  for (const mark of MARK_ORDER) {
    if (marks.includes(mark)) {
      sorted.push(mark);
    }
  }
  return sorted;
}

/** True when two mark sets contain exactly the same marks. */
export function sameMarks(a: readonly Mark[], b: readonly Mark[]): boolean {
  const left = normalizeMarks(a);
  const right = normalizeMarks(b);
  if (left.length !== right.length) {
    return false;
  }
  for (let i = 0; i < left.length; i++) {
    if (left[i] !== right[i]) {
      return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Builder
//
// The parser never mutates raw structures inline; it calls these helpers. That
// keeps the parse state machine readable and keeps all the fiddly rules about
// spacing and run merging in one place.
// ---------------------------------------------------------------------------

/**
 * Which kind of block the builder is currently writing into.
 *
 * The parameters (a heading's level, a list's style) live here rather than
 * being re-derived from the last block, so appending never has to guess.
 */
export type BuilderMode =
  | { kind: "paragraph" }
  | { kind: "heading"; level: HeadingLevel }
  | { kind: "quote" }
  | { kind: "list"; style: ListStyle };

export interface DocumentBuilder {
  blocks: Block[];
  mode: BuilderMode;
}

export function createBuilder(): DocumentBuilder {
  return { blocks: [], mode: { kind: "paragraph" } };
}

/** The block currently being written into, if it is still the right kind. */
function openBlock(builder: DocumentBuilder): Block | undefined {
  return builder.blocks[builder.blocks.length - 1];
}

/**
 * The array of inlines currently being written into, creating the containing
 * block on demand. Every append goes through here.
 */
function currentTarget(builder: DocumentBuilder): Inline[] {
  const last = openBlock(builder);
  const mode = builder.mode;

  switch (mode.kind) {
    case "paragraph": {
      if (last !== undefined && last.kind === "paragraph") {
        return last.children;
      }
      const block: Block = { kind: "paragraph", children: [] };
      builder.blocks.push(block);
      return block.children;
    }

    case "heading": {
      if (last !== undefined && last.kind === "heading" && last.level === mode.level) {
        return last.children;
      }
      const block: Block = { kind: "heading", level: mode.level, children: [] };
      builder.blocks.push(block);
      return block.children;
    }

    case "quote": {
      if (last !== undefined && last.kind === "quote") {
        return last.children;
      }
      const block: Block = { kind: "quote", children: [] };
      builder.blocks.push(block);
      return block.children;
    }

    case "list": {
      if (last !== undefined && last.kind === "list" && last.style === mode.style) {
        const lastItem = last.items[last.items.length - 1];
        if (lastItem !== undefined) {
          return lastItem.children;
        }
        const item: ListItem = { children: [] };
        last.items.push(item);
        return item.children;
      }
      const item: ListItem = { children: [] };
      const block: Block = { kind: "list", style: mode.style, items: [item] };
      builder.blocks.push(block);
      return item.children;
    }
  }
}

/**
 * True when a separating space is needed before appending more content.
 *
 * No space is needed at the start of a block, immediately after a soft break,
 * or when the preceding text already ends in whitespace.
 */
function needsSeparator(target: Inline[]): boolean {
  const last = target[target.length - 1];
  if (last === undefined) {
    return false;
  }
  if (last.kind === "break") {
    return false;
  }
  if (last.kind === "text") {
    return !/\s$/.test(last.text);
  }
  return true;
}

/**
 * Appends the space that separates two spoken chunks.
 *
 * The separator is always UNMARKED, even between two bold chunks. Markdown
 * emphasis delimiters must hug their text (`** bold**` is not bold), so a
 * space must never live inside a marked run.
 */
function appendSeparator(target: Inline[]): void {
  const last = target[target.length - 1];
  if (last !== undefined && last.kind === "text" && last.marks.length === 0) {
    last.text += " ";
    return;
  }
  target.push({ kind: "text", text: " ", marks: [] });
}

/** Appends a run of spoken text carrying the given marks. */
export function appendText(
  builder: DocumentBuilder,
  text: string,
  marks: readonly Mark[],
): void {
  if (text.length === 0) {
    return;
  }

  const target = currentTarget(builder);

  if (needsSeparator(target)) {
    const previous = target[target.length - 1];
    if (previous !== undefined && previous.kind === "text" && sameMarks(previous.marks, marks)) {
      // Same marks on both sides of the gap, so the space belongs inside the
      // run: "a" + "b" both bold becomes one **a b** rather than **a** **b**.
      previous.text += ` ${text}`;
      return;
    }
    appendSeparator(target);
  }

  // Merge into the previous run when the marks match, so the model really does
  // hold "contiguous runs sharing the same marks".
  const last = target[target.length - 1];
  if (last !== undefined && last.kind === "text" && sameMarks(last.marks, marks)) {
    last.text += text;
    return;
  }

  target.push({ kind: "text", text, marks: normalizeMarks(marks) });
}

/** Appends a link whose display text carries the given marks. */
export function appendLink(
  builder: DocumentBuilder,
  text: string,
  href: string,
  marks: readonly Mark[],
): void {
  const target = currentTarget(builder);
  if (needsSeparator(target)) {
    appendSeparator(target);
  }
  target.push({ kind: "link", text, href, marks: normalizeMarks(marks) });
}

/** Appends an emoji glyph. */
export function appendEmoji(builder: DocumentBuilder, glyph: string): void {
  const target = currentTarget(builder);
  if (needsSeparator(target)) {
    appendSeparator(target);
  }
  target.push({ kind: "emoji", glyph });
}

/** Appends a soft line break inside the current block (spoken as "new line"). */
export function appendBreak(builder: DocumentBuilder): void {
  const target = currentTarget(builder);
  target.push({ kind: "break" });
}

/**
 * Ends the current block and starts a fresh paragraph
 * (spoken as "new paragraph"). Also the way out of every other block.
 */
export function startNewParagraph(builder: DocumentBuilder): void {
  builder.mode = { kind: "paragraph" };
  builder.blocks.push({ kind: "paragraph", children: [] });
}

/** Begins a heading. Subsequent content goes into it until it is ended. */
export function startHeading(builder: DocumentBuilder, level: HeadingLevel): void {
  builder.mode = { kind: "heading", level };
  builder.blocks.push({ kind: "heading", level, children: [] });
}

/** Begins a blockquote. Subsequent content goes into it until it is ended. */
export function startQuote(builder: DocumentBuilder): void {
  builder.mode = { kind: "quote" };
  builder.blocks.push({ kind: "quote", children: [] });
}

/** Begins a list with one empty item ready to receive content. */
export function startList(builder: DocumentBuilder, style: ListStyle): void {
  builder.mode = { kind: "list", style };
  builder.blocks.push({ kind: "list", style, items: [{ children: [] }] });
}

/**
 * Starts the next list item ("next item").
 *
 * Spoken outside a list this starts a bullet list, so the user's following
 * words are still captured rather than lost.
 */
export function addListItem(builder: DocumentBuilder): void {
  const last = openBlock(builder);
  if (builder.mode.kind !== "list" || last === undefined || last.kind !== "list") {
    startList(builder, "bullet");
    return;
  }
  last.items.push({ children: [] });
}

/**
 * Ticks or unticks the item being written ("check that").
 *
 * Doing this outside a task list is a no-op rather than an error: there is
 * nothing to tick, and inventing a list would be worse than doing nothing.
 */
export function setCurrentItemChecked(builder: DocumentBuilder, checked: boolean): void {
  const last = openBlock(builder);
  if (last === undefined || last.kind !== "list" || last.style !== "task") {
    return;
  }
  const item = last.items[last.items.length - 1];
  if (item === undefined) {
    return;
  }
  item.checked = checked;
}

/**
 * Appends a fenced code block.
 *
 * Its content is captured verbatim rather than built up inline, because the
 * words inside a code block are code, not commands.
 */
export function appendCodeBlock(builder: DocumentBuilder, language: string, code: string): void {
  builder.blocks.push({ kind: "codeBlock", language, code });
  builder.mode = { kind: "paragraph" };
}

/** Appends a horizontal rule ("divider"). */
export function appendDivider(builder: DocumentBuilder): void {
  builder.blocks.push({ kind: "divider" });
  builder.mode = { kind: "paragraph" };
}

/**
 * Finishes the document: drops blocks that ended up with no content.
 *
 * Empty blocks are a normal by-product of the parser (starting a paragraph the
 * user never filled), and they must not render as stray blank output.
 */
export function finishDocument(builder: DocumentBuilder): DocumentModel {
  const blocks: Block[] = [];

  for (const block of builder.blocks) {
    switch (block.kind) {
      case "paragraph":
      case "heading":
      case "quote": {
        if (block.children.length > 0) {
          blocks.push(block);
        }
        break;
      }
      case "list": {
        const items = block.items.filter((item) => item.children.length > 0);
        if (items.length > 0) {
          blocks.push({ kind: "list", style: block.style, items });
        }
        break;
      }
      case "codeBlock": {
        if (block.code.length > 0) {
          blocks.push(block);
        }
        break;
      }
      case "divider": {
        // A divider has no content to be empty of; it always survives.
        blocks.push(block);
        break;
      }
    }
  }

  return { blocks };
}
