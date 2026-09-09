/**
 * renderHtml.ts — DocumentModel -> HTML string ("rendered" view).
 *
 * PURITY: imports only from documentModel.ts. No React, no DOM.
 *
 * This renders straight from the model rather than converting the markdown
 * string with a library, so the rendered and raw views are guaranteed to
 * describe the same document.
 *
 * The UI injects this string with dangerouslySetInnerHTML, so every piece of
 * text is escaped here and every href is sanitized here.
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

/** Escapes text for use in HTML element content and attribute values. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Blocks hrefs that could execute script when clicked.
 *
 * Spoken URLs are normalized to http(s) already, but a link href can also come
 * from the system clipboard, which is arbitrary user-supplied text.
 */
export function sanitizeHref(href: string): string {
  const scheme = href.trim().toLowerCase();
  if (scheme.startsWith("javascript:") || scheme.startsWith("data:") || scheme.startsWith("vbscript:")) {
    return "#";
  }
  return href;
}

/** The HTML tag for each wrapping mark. */
function tagFor(mark: WrappingMark): string {
  switch (mark) {
    case "bold":
      return "strong";
    case "italic":
      return "em";
    case "strikethrough":
      return "del";
    case "code":
      return "code";
  }
}

/**
 * Escapes a run's text and applies its marks.
 *
 * ORDER MATTERS: "caps" uppercases the raw text BEFORE escaping. Uppercasing
 * afterwards would turn "&amp;" into "&AMP;" and corrupt the entity.
 *
 * "caps" uppercases the characters rather than adding a CSS text-transform, so
 * the rendered view and the raw markdown carry the same text — styling it with
 * CSS would make the two views disagree the moment anyone copied from one.
 *
 * The wrapping marks then nest in the canonical order from WRAPPING_MARK_ORDER:
 * bold outermost, then italic, then code.
 */
function applyMarks(text: string, marks: readonly Mark[]): string {
  const transformed = marks.includes("caps") ? text.toUpperCase() : text;
  let result = escapeHtml(transformed);

  // Walk inside-out so the outermost mark is applied last.
  for (let i = WRAPPING_MARK_ORDER.length - 1; i >= 0; i--) {
    const mark = WRAPPING_MARK_ORDER[i];
    if (mark !== undefined && marks.includes(mark)) {
      const tag = tagFor(mark);
      result = `<${tag}>${result}</${tag}>`;
    }
  }
  return result;
}

function renderInline(inline: Inline): string {
  switch (inline.kind) {
    case "text":
      return applyMarks(inline.text, inline.marks);
    case "link": {
      const href = escapeHtml(sanitizeHref(inline.href));
      const label = applyMarks(inline.text, inline.marks);
      return `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    }
    case "emoji":
      return escapeHtml(inline.glyph);
    case "break":
      return "<br />";
  }
}

function renderInlines(inlines: readonly Inline[]): string {
  let result = "";
  for (const inline of inlines) {
    result += renderInline(inline);
  }
  return result;
}

/** One list item, with a checkbox when the list is a task list. */
function renderItem(style: ListStyle, item: ListItem): string {
  const content = renderInlines(item.children);
  if (style !== "task") {
    return `<li>${content}</li>`;
  }

  // Disabled so the rendered view stays a view: ticking happens by speaking.
  const checked = item.checked === true ? " checked" : "";
  return `<li class="task-item"><input type="checkbox" disabled${checked} /> ${content}</li>`;
}

function renderBlock(block: Block): string {
  switch (block.kind) {
    case "paragraph":
      return `<p>${renderInlines(block.children)}</p>`;

    case "heading":
      return `<h${block.level}>${renderInlines(block.children)}</h${block.level}>`;

    case "quote":
      return `<blockquote><p>${renderInlines(block.children)}</p></blockquote>`;

    case "list": {
      let items = "";
      for (const item of block.items) {
        items += renderItem(block.style, item);
      }
      if (block.style === "ordered") {
        return `<ol>${items}</ol>`;
      }
      const className = block.style === "task" ? ' class="task-list"' : "";
      return `<ul${className}>${items}</ul>`;
    }

    case "codeBlock": {
      // The language only ever reaches a class name, and it is escaped; the
      // code itself is escaped like any other text.
      const language = block.language.length > 0 ? ` class="language-${escapeHtml(block.language)}"` : "";
      return `<pre><code${language}>${escapeHtml(block.code)}</code></pre>`;
    }

    case "divider":
      return "<hr />";
  }
}

/** Renders the whole document to an HTML string. */
export function renderHtml(document: DocumentModel): string {
  let html = "";
  for (const block of document.blocks) {
    html += renderBlock(block);
  }
  return html;
}
