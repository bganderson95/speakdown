import { describe, expect, it } from "vitest";
import type { DocumentModel } from "./documentModel.js";
import { renderMarkdown } from "./renderMarkdown.js";

describe("renderMarkdown inline marks", () => {
  it("renders plain text unchanged", () => {
    const document: DocumentModel = {
      blocks: [{ kind: "paragraph", children: [{ kind: "text", text: "hello world", marks: [] }] }],
    };
    expect(renderMarkdown(document)).toBe("hello world");
  });

  it("renders each single mark", () => {
    const document: DocumentModel = {
      blocks: [
        {
          kind: "paragraph",
          children: [
            { kind: "text", text: "b", marks: ["bold"] },
            { kind: "text", text: " ", marks: [] },
            { kind: "text", text: "i", marks: ["italic"] },
            { kind: "text", text: " ", marks: [] },
            { kind: "text", text: "c", marks: ["code"] },
          ],
        },
      ],
    };
    expect(renderMarkdown(document)).toBe("**b** *i* `c`");
  });

  it("nests stacked marks in the canonical order regardless of input order", () => {
    const document: DocumentModel = {
      blocks: [
        {
          kind: "paragraph",
          children: [{ kind: "text", text: "x", marks: ["italic", "bold"] }],
        },
      ],
    };
    expect(renderMarkdown(document)).toBe("***x***");
  });

  it("nests all three marks bold > italic > code", () => {
    const document: DocumentModel = {
      blocks: [
        {
          kind: "paragraph",
          children: [{ kind: "text", text: "x", marks: ["code", "italic", "bold"] }],
        },
      ],
    };
    expect(renderMarkdown(document)).toBe("***`x`***");
  });
});

describe("renderMarkdown caps", () => {
  it("uppercases the characters, since markdown has no caps syntax", () => {
    const document: DocumentModel = {
      blocks: [{ kind: "paragraph", children: [{ kind: "text", text: "quiet", marks: ["caps"] }] }],
    };
    expect(renderMarkdown(document)).toBe("QUIET");
  });

  it("combines with wrapping marks", () => {
    const document: DocumentModel = {
      blocks: [
        { kind: "paragraph", children: [{ kind: "text", text: "loud", marks: ["caps", "bold"] }] },
      ],
    };
    expect(renderMarkdown(document)).toBe("**LOUD**");
  });

  it("uppercases a link's display text but not its href", () => {
    const document: DocumentModel = {
      blocks: [
        {
          kind: "paragraph",
          children: [
            { kind: "link", text: "the docs", href: "https://example.com/Q3", marks: ["caps"] },
          ],
        },
      ],
    };
    expect(renderMarkdown(document)).toBe("[THE DOCS](https://example.com/Q3)");
  });
});

describe("renderMarkdown inline nodes", () => {
  it("renders links", () => {
    const document: DocumentModel = {
      blocks: [
        {
          kind: "paragraph",
          children: [{ kind: "link", text: "the docs", href: "https://example.com/q3", marks: [] }],
        },
      ],
    };
    expect(renderMarkdown(document)).toBe("[the docs](https://example.com/q3)");
  });

  it("renders links whose display text carries marks", () => {
    const document: DocumentModel = {
      blocks: [
        {
          kind: "paragraph",
          children: [{ kind: "link", text: "docs", href: "https://example.com", marks: ["bold"] }],
        },
      ],
    };
    expect(renderMarkdown(document)).toBe("[**docs**](https://example.com)");
  });

  it("renders emoji as their glyph", () => {
    const document: DocumentModel = {
      blocks: [{ kind: "paragraph", children: [{ kind: "emoji", glyph: "🔥" }] }],
    };
    expect(renderMarkdown(document)).toBe("🔥");
  });

  it("renders a soft break as two trailing spaces and a newline", () => {
    const document: DocumentModel = {
      blocks: [
        {
          kind: "paragraph",
          children: [
            { kind: "text", text: "one", marks: [] },
            { kind: "break" },
            { kind: "text", text: "two", marks: [] },
          ],
        },
      ],
    };
    expect(renderMarkdown(document)).toBe("one  \ntwo");
  });
});

describe("renderMarkdown blocks", () => {
  it("separates paragraphs with a blank line", () => {
    const document: DocumentModel = {
      blocks: [
        { kind: "paragraph", children: [{ kind: "text", text: "one", marks: [] }] },
        { kind: "paragraph", children: [{ kind: "text", text: "two", marks: [] }] },
      ],
    };
    expect(renderMarkdown(document)).toBe("one\n\ntwo");
  });

  it("renders a quote", () => {
    const document: DocumentModel = {
      blocks: [{ kind: "quote", children: [{ kind: "text", text: "to be", marks: [] }] }],
    };
    expect(renderMarkdown(document)).toBe("> to be");
  });

  it("prefixes every line of a multi-line quote", () => {
    const document: DocumentModel = {
      blocks: [
        {
          kind: "quote",
          children: [
            { kind: "text", text: "one", marks: [] },
            { kind: "break" },
            { kind: "text", text: "two", marks: [] },
          ],
        },
      ],
    };
    expect(renderMarkdown(document)).toBe("> one  \n> two");
  });

  it("renders a bullet list", () => {
    const document: DocumentModel = {
      blocks: [
        {
          kind: "list",
          style: "bullet",
          items: [
            { children: [{ kind: "text", text: "milk", marks: [] }] },
            { children: [{ kind: "text", text: "eggs", marks: ["bold"] }] },
          ],
        },
      ],
    };
    expect(renderMarkdown(document)).toBe("- milk\n- **eggs**");
  });

  it("indents a soft break inside a bullet item", () => {
    const document: DocumentModel = {
      blocks: [
        {
          kind: "list",
          style: "bullet",
          items: [
            {
              children: [
                { kind: "text", text: "one", marks: [] },
                { kind: "break" },
                { kind: "text", text: "still one", marks: [] },
              ],
            },
          ],
        },
      ],
    };
    expect(renderMarkdown(document)).toBe("- one  \n  still one");
  });

  it("renders an empty document as an empty string", () => {
    expect(renderMarkdown({ blocks: [] })).toBe("");
  });
});

describe("renderMarkdown snapshots", () => {
  it("renders a representative mixed document", () => {
    const document: DocumentModel = {
      blocks: [
        {
          kind: "paragraph",
          children: [
            { kind: "text", text: "Shipping ", marks: [] },
            { kind: "text", text: "today", marks: ["bold"] },
            { kind: "text", text: " ", marks: [] },
            { kind: "emoji", glyph: "🚀" },
          ],
        },
        {
          kind: "quote",
          children: [{ kind: "text", text: "no notes", marks: ["italic"] }],
        },
        {
          kind: "list",
          style: "bullet",
          items: [
            { children: [{ kind: "text", text: "write the parser", marks: [] }] },
            {
              children: [
                { kind: "text", text: "read ", marks: [] },
                { kind: "link", text: "the spec", href: "https://example.com/spec", marks: [] },
              ],
            },
          ],
        },
      ],
    };
    expect(renderMarkdown(document)).toMatchInlineSnapshot(`
      "Shipping **today** 🚀

      > *no notes*

      - write the parser
      - read [the spec](https://example.com/spec)"
    `);
  });
});

describe("renderMarkdown new blocks", () => {
  it("renders each heading level", () => {
    for (const level of [1, 2, 3, 4, 5, 6] as const) {
      const document: DocumentModel = {
        blocks: [{ kind: "heading", level, children: [{ kind: "text", text: "T", marks: [] }] }],
      };
      expect(renderMarkdown(document)).toBe(`${"#".repeat(level)} T`);
    }
  });

  it("flattens a soft break inside a heading, which must stay one line", () => {
    const document: DocumentModel = {
      blocks: [
        {
          kind: "heading",
          level: 2,
          children: [
            { kind: "text", text: "one", marks: [] },
            { kind: "break" },
            { kind: "text", text: "two", marks: [] },
          ],
        },
      ],
    };
    expect(renderMarkdown(document)).toBe("## one two");
  });

  it("numbers an ordered list", () => {
    const document: DocumentModel = {
      blocks: [
        {
          kind: "list",
          style: "ordered",
          items: [
            { children: [{ kind: "text", text: "a", marks: [] }] },
            { children: [{ kind: "text", text: "b", marks: [] }] },
            { children: [{ kind: "text", text: "c", marks: [] }] },
          ],
        },
      ],
    };
    expect(renderMarkdown(document)).toBe("1. a\n2. b\n3. c");
  });

  it("renders task checkboxes", () => {
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
    expect(renderMarkdown(document)).toBe("- [x] done\n- [ ] todo");
  });

  it("indents a soft break under an ordered marker", () => {
    const document: DocumentModel = {
      blocks: [
        {
          kind: "list",
          style: "ordered",
          items: [
            {
              children: [
                { kind: "text", text: "one", marks: [] },
                { kind: "break" },
                { kind: "text", text: "still one", marks: [] },
              ],
            },
          ],
        },
      ],
    };
    expect(renderMarkdown(document)).toBe("1. one  \n   still one");
  });

  it("fences a code block with its language", () => {
    const document: DocumentModel = {
      blocks: [{ kind: "codeBlock", language: "python", code: "print(1)" }],
    };
    expect(renderMarkdown(document)).toBe("```python\nprint(1)\n```");
  });

  it("lengthens the fence when the code contains backticks", () => {
    // A three-backtick fence would end the block early.
    const document: DocumentModel = {
      blocks: [{ kind: "codeBlock", language: "", code: "a ``` b" }],
    };
    expect(renderMarkdown(document)).toBe("````\na ``` b\n````");
  });

  it("renders a divider", () => {
    expect(renderMarkdown({ blocks: [{ kind: "divider" }] })).toBe("---");
  });

  it("renders strikethrough", () => {
    const document: DocumentModel = {
      blocks: [
        { kind: "paragraph", children: [{ kind: "text", text: "gone", marks: ["strikethrough"] }] },
      ],
    };
    expect(renderMarkdown(document)).toBe("~~gone~~");
  });

  it("nests strikethrough inside bold and italic, outside code", () => {
    const document: DocumentModel = {
      blocks: [
        {
          kind: "paragraph",
          children: [
            { kind: "text", text: "x", marks: ["code", "strikethrough", "italic", "bold"] },
          ],
        },
      ],
    };
    expect(renderMarkdown(document)).toBe("***~~`x`~~***");
  });
});
