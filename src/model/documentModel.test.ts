import { describe, expect, it } from "vitest";
import {
  addListItem,
  appendBreak,
  appendEmoji,
  appendLink,
  appendText,
  createBuilder,
  finishDocument,
  normalizeMarks,
  sameMarks,
  startList,
  startNewParagraph,
  startQuote,
} from "./documentModel.js";

describe("normalizeMarks", () => {
  it("sorts marks into the canonical order", () => {
    expect(normalizeMarks(["code", "bold", "italic"])).toEqual(["bold", "italic", "code"]);
  });

  it("sorts caps last, after the wrapping marks", () => {
    expect(normalizeMarks(["caps", "bold"])).toEqual(["bold", "caps"]);
  });

  it("drops nothing and adds nothing", () => {
    expect(normalizeMarks(["italic"])).toEqual(["italic"]);
    expect(normalizeMarks([])).toEqual([]);
  });
});

describe("sameMarks", () => {
  it("is order independent", () => {
    expect(sameMarks(["bold", "italic"], ["italic", "bold"])).toBe(true);
  });

  it("distinguishes different sets", () => {
    expect(sameMarks(["bold"], ["bold", "italic"])).toBe(false);
    expect(sameMarks([], ["code"])).toBe(false);
  });
});

describe("builder text appending", () => {
  it("merges consecutive runs that share marks", () => {
    const builder = createBuilder();
    appendText(builder, "hello", []);
    appendText(builder, "world", []);

    expect(finishDocument(builder)).toEqual({
      blocks: [{ kind: "paragraph", children: [{ kind: "text", text: "hello world", marks: [] }] }],
    });
  });

  it("starts a new run when the marks change", () => {
    const builder = createBuilder();
    appendText(builder, "plain", []);
    appendText(builder, "bold", ["bold"]);

    expect(finishDocument(builder)).toEqual({
      blocks: [
        {
          kind: "paragraph",
          children: [
            { kind: "text", text: "plain ", marks: [] },
            { kind: "text", text: "bold", marks: ["bold"] },
          ],
        },
      ],
    });
  });

  it("keeps the separating space outside the marked run", () => {
    // Markdown emphasis delimiters must hug their text, so a leading space
    // inside a bold run would silently stop it from being bold.
    const builder = createBuilder();
    appendText(builder, "a", ["bold"]);
    appendText(builder, "b", ["bold"]);
    appendText(builder, "c", ["bold"]);

    expect(finishDocument(builder)).toEqual({
      blocks: [
        {
          kind: "paragraph",
          children: [{ kind: "text", text: "a b c", marks: ["bold"] }],
        },
      ],
    });
  });

  it("does not add a separator at the start of a block", () => {
    const builder = createBuilder();
    appendText(builder, "first", []);

    expect(finishDocument(builder).blocks[0]).toEqual({
      kind: "paragraph",
      children: [{ kind: "text", text: "first", marks: [] }],
    });
  });

  it("does not add a separator after a soft break", () => {
    const builder = createBuilder();
    appendText(builder, "one", []);
    appendBreak(builder);
    appendText(builder, "two", []);

    expect(finishDocument(builder).blocks[0]).toEqual({
      kind: "paragraph",
      children: [
        { kind: "text", text: "one", marks: [] },
        { kind: "break" },
        { kind: "text", text: "two", marks: [] },
      ],
    });
  });

  it("separates emoji and links from surrounding text", () => {
    const builder = createBuilder();
    appendText(builder, "ship it", []);
    appendEmoji(builder, "🚀");
    appendLink(builder, "docs", "https://example.com", []);

    expect(finishDocument(builder).blocks[0]).toEqual({
      kind: "paragraph",
      children: [
        { kind: "text", text: "ship it ", marks: [] },
        { kind: "emoji", glyph: "🚀" },
        { kind: "text", text: " ", marks: [] },
        { kind: "link", text: "docs", href: "https://example.com", marks: [] },
      ],
    });
  });
});

describe("builder blocks", () => {
  it("starts a new paragraph", () => {
    const builder = createBuilder();
    appendText(builder, "one", []);
    startNewParagraph(builder);
    appendText(builder, "two", []);

    expect(finishDocument(builder)).toEqual({
      blocks: [
        { kind: "paragraph", children: [{ kind: "text", text: "one", marks: [] }] },
        { kind: "paragraph", children: [{ kind: "text", text: "two", marks: [] }] },
      ],
    });
  });

  it("collects text into a quote block", () => {
    const builder = createBuilder();
    startQuote(builder);
    appendText(builder, "quoted", []);

    expect(finishDocument(builder)).toEqual({
      blocks: [{ kind: "quote", children: [{ kind: "text", text: "quoted", marks: [] }] }],
    });
  });

  it("collects bullet items", () => {
    const builder = createBuilder();
    startList(builder, "bullet");
    appendText(builder, "milk", []);
    addListItem(builder);
    appendText(builder, "eggs", []);

    expect(finishDocument(builder)).toEqual({
      blocks: [
        {
          kind: "list",
          style: "bullet",
          items: [
            { children: [{ kind: "text", text: "milk", marks: [] }] },
            { children: [{ kind: "text", text: "eggs", marks: [] }] },
          ],
        },
      ],
    });
  });

  it("starts a list when the next item is spoken outside one", () => {
    const builder = createBuilder();
    addListItem(builder);
    appendText(builder, "orphan", []);

    expect(finishDocument(builder)).toEqual({
      blocks: [
        {
          kind: "list",
          style: "bullet",
          items: [{ children: [{ kind: "text", text: "orphan", marks: [] }] }],
        },
      ],
    });
  });
});

describe("finishDocument", () => {
  it("drops empty blocks", () => {
    const builder = createBuilder();
    startNewParagraph(builder);
    startQuote(builder);
    startNewParagraph(builder);
    appendText(builder, "only content", []);

    expect(finishDocument(builder)).toEqual({
      blocks: [{ kind: "paragraph", children: [{ kind: "text", text: "only content", marks: [] }] }],
    });
  });

  it("drops empty bullet items", () => {
    const builder = createBuilder();
    startList(builder, "bullet");
    addListItem(builder);
    appendText(builder, "only item", []);

    expect(finishDocument(builder)).toEqual({
      blocks: [
        {
          kind: "list",
          style: "bullet",
          items: [{ children: [{ kind: "text", text: "only item", marks: [] }] }],
        },
      ],
    });
  });

  it("returns an empty document when nothing was appended", () => {
    expect(finishDocument(createBuilder())).toEqual({ blocks: [] });
  });
});
