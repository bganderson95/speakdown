import { describe, expect, it } from "vitest";
import type { DocumentModel } from "./documentModel.js";
import { escapeHtml, renderHtml, sanitizeHref } from "./renderHtml.js";

describe("escapeHtml", () => {
  it("escapes the characters that could break out of markup", () => {
    expect(escapeHtml(`<b>&"'`)).toBe("&lt;b&gt;&amp;&quot;&#39;");
  });
});

describe("sanitizeHref", () => {
  it("keeps ordinary http(s) urls", () => {
    expect(sanitizeHref("https://example.com/q3")).toBe("https://example.com/q3");
  });

  it("blocks script-bearing schemes, which can arrive via the clipboard", () => {
    expect(sanitizeHref("javascript:alert(1)")).toBe("#");
    expect(sanitizeHref("  JavaScript:alert(1)")).toBe("#");
    expect(sanitizeHref("data:text/html,<script>")).toBe("#");
  });
});

describe("renderHtml", () => {
  it("renders marks with the canonical nesting order", () => {
    const document: DocumentModel = {
      blocks: [
        { kind: "paragraph", children: [{ kind: "text", text: "x", marks: ["code", "italic", "bold"] }] },
      ],
    };
    expect(renderHtml(document)).toBe("<p><strong><em><code>x</code></em></strong></p>");
  });

  it("escapes spoken text", () => {
    const document: DocumentModel = {
      blocks: [{ kind: "paragraph", children: [{ kind: "text", text: "a < b", marks: [] }] }],
    };
    expect(renderHtml(document)).toBe("<p>a &lt; b</p>");
  });

  it("renders links with safe rel attributes", () => {
    const document: DocumentModel = {
      blocks: [
        {
          kind: "paragraph",
          children: [{ kind: "link", text: "docs", href: "https://example.com", marks: [] }],
        },
      ],
    };
    expect(renderHtml(document)).toBe(
      '<p><a href="https://example.com" target="_blank" rel="noopener noreferrer">docs</a></p>',
    );
  });

  it("uppercases caps text rather than styling it, so both views agree", () => {
    const document: DocumentModel = {
      blocks: [{ kind: "paragraph", children: [{ kind: "text", text: "quiet", marks: ["caps"] }] }],
    };
    expect(renderHtml(document)).toBe("<p>QUIET</p>");
  });

  it("combines caps with wrapping marks", () => {
    const document: DocumentModel = {
      blocks: [
        { kind: "paragraph", children: [{ kind: "text", text: "loud", marks: ["caps", "bold"] }] },
      ],
    };
    expect(renderHtml(document)).toBe("<p><strong>LOUD</strong></p>");
  });

  it("uppercases before escaping, so entities are never corrupted", () => {
    // Uppercasing after escaping would turn "&amp;" into "&AMP;".
    const document: DocumentModel = {
      blocks: [{ kind: "paragraph", children: [{ kind: "text", text: "a & b", marks: ["caps"] }] }],
    };
    expect(renderHtml(document)).toBe("<p>A &amp; B</p>");
  });

  it("uppercases a link's display text but not its href", () => {
    const document: DocumentModel = {
      blocks: [
        {
          kind: "paragraph",
          children: [{ kind: "link", text: "docs", href: "https://example.com/Q3", marks: ["caps"] }],
        },
      ],
    };
    expect(renderHtml(document)).toContain('href="https://example.com/Q3"');
    expect(renderHtml(document)).toContain(">DOCS<");
  });

  it("renders emoji, breaks, quotes and lists", () => {
    const document: DocumentModel = {
      blocks: [
        {
          kind: "paragraph",
          children: [
            { kind: "emoji", glyph: "🔥" },
            { kind: "break" },
            { kind: "text", text: "next", marks: [] },
          ],
        },
        { kind: "quote", children: [{ kind: "text", text: "quoted", marks: [] }] },
        {
          kind: "list",
          style: "bullet",
          items: [
            { children: [{ kind: "text", text: "milk", marks: [] }] },
            { children: [{ kind: "text", text: "eggs", marks: [] }] },
          ],
        },
      ],
    };
    expect(renderHtml(document)).toBe(
      "<p>🔥<br />next</p>" +
        "<blockquote><p>quoted</p></blockquote>" +
        "<ul><li>milk</li><li>eggs</li></ul>",
    );
  });

  it("renders an empty document as an empty string", () => {
    expect(renderHtml({ blocks: [] })).toBe("");
  });
});

describe("renderHtml new blocks", () => {
  it("renders heading levels", () => {
    const document: DocumentModel = {
      blocks: [{ kind: "heading", level: 3, children: [{ kind: "text", text: "T", marks: [] }] }],
    };
    expect(renderHtml(document)).toBe("<h3>T</h3>");
  });

  it("renders an ordered list as ol", () => {
    const document: DocumentModel = {
      blocks: [
        {
          kind: "list",
          style: "ordered",
          items: [{ children: [{ kind: "text", text: "a", marks: [] }] }],
        },
      ],
    };
    expect(renderHtml(document)).toBe("<ol><li>a</li></ol>");
  });

  it("renders task items with disabled checkboxes", () => {
    const document: DocumentModel = {
      blocks: [
        {
          kind: "list",
          style: "task",
          items: [
            { children: [{ kind: "text", text: "done", marks: [] }], checked: true },
            { children: [{ kind: "text", text: "todo", marks: [] }] },
          ],
        },
      ],
    };
    expect(renderHtml(document)).toBe(
      '<ul class="task-list">' +
        '<li class="task-item"><input type="checkbox" disabled checked /> done</li>' +
        '<li class="task-item"><input type="checkbox" disabled /> todo</li>' +
        "</ul>",
    );
  });

  it("renders a code block with a language class", () => {
    const document: DocumentModel = {
      blocks: [{ kind: "codeBlock", language: "python", code: "print(1)" }],
    };
    expect(renderHtml(document)).toBe('<pre><code class="language-python">print(1)</code></pre>');
  });

  it("escapes code block content and omits an empty language", () => {
    const document: DocumentModel = {
      blocks: [{ kind: "codeBlock", language: "", code: "<script>alert(1)</script>" }],
    };
    expect(renderHtml(document)).toBe(
      "<pre><code>&lt;script&gt;alert(1)&lt;/script&gt;</code></pre>",
    );
  });

  it("renders a divider", () => {
    expect(renderHtml({ blocks: [{ kind: "divider" }] })).toBe("<hr />");
  });

  it("renders strikethrough as del", () => {
    const document: DocumentModel = {
      blocks: [
        { kind: "paragraph", children: [{ kind: "text", text: "gone", marks: ["strikethrough"] }] },
      ],
    };
    expect(renderHtml(document)).toBe("<p><del>gone</del></p>");
  });
});
