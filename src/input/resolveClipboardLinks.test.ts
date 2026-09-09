import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../model/renderMarkdown.js";
import { parse } from "../parser/parse.js";
import { hasClipboardLinks, resolveClipboardLinks } from "./resolveClipboardLinks.js";

const TRANSCRIPT = "read link the docs to clipboard";

describe("hasClipboardLinks", () => {
  it("finds an unresolved clipboard link", () => {
    expect(hasClipboardLinks(parse(TRANSCRIPT).document)).toBe(true);
  });

  it("finds clipboard links inside list items", () => {
    const document = parse("bullet list link the docs to clipboard").document;
    expect(hasClipboardLinks(document)).toBe(true);
  });

  it("returns false when there are none", () => {
    expect(hasClipboardLinks(parse("just words").document)).toBe(false);
  });
});

describe("resolveClipboardLinks", () => {
  it("substitutes the clipboard url", () => {
    const { document } = resolveClipboardLinks(parse(TRANSCRIPT).document, "https://example.com/q3");
    expect(renderMarkdown(document)).toBe("read [the docs](https://example.com/q3)");
  });

  it("trims surrounding whitespace from the clipboard text", () => {
    const { document } = resolveClipboardLinks(parse(TRANSCRIPT).document, "  https://example.com  ");
    expect(renderMarkdown(document)).toBe("read [the docs](https://example.com)");
  });

  it("reports what it used", () => {
    const { notices } = resolveClipboardLinks(parse(TRANSCRIPT).document, "https://example.com");
    expect(notices).toEqual([
      { kind: "resolved", message: "Clipboard link set to https://example.com" },
    ]);
  });

  it("falls back to plain display text when the clipboard is unreadable", () => {
    const { document } = resolveClipboardLinks(parse(TRANSCRIPT).document, null);
    expect(renderMarkdown(document)).toBe("read the docs");
  });

  it("falls back to plain display text when the clipboard is empty", () => {
    const { document } = resolveClipboardLinks(parse(TRANSCRIPT).document, "   ");
    expect(renderMarkdown(document)).toBe("read the docs");
  });

  it("keeps the display text's marks on the fallback", () => {
    const document = parse("bold link the docs to clipboard").document;
    expect(renderMarkdown(resolveClipboardLinks(document, null).document)).toBe("**the docs**");
  });

  it("surfaces a non-blocking notice on failure", () => {
    const { notices } = resolveClipboardLinks(parse(TRANSCRIPT).document, null);
    expect(notices).toEqual([
      {
        kind: "unavailable",
        message: "Could not read the clipboard, so the link text was kept as plain text.",
      },
    ]);
  });

  it("resolves clipboard links inside list items", () => {
    const document = parse("bullet list link the docs to clipboard").document;
    const resolved = resolveClipboardLinks(document, "https://example.com");
    expect(renderMarkdown(resolved.document)).toBe("- [the docs](https://example.com)");
  });

  it("leaves ordinary links alone", () => {
    const document = parse("link the docs to example dot com").document;
    const resolved = resolveClipboardLinks(document, "https://clipboard.example");
    expect(renderMarkdown(resolved.document)).toBe("[the docs](https://example.com)");
  });

  it("returns the same document reference when there is nothing to resolve", () => {
    const document = parse("just words").document;
    expect(resolveClipboardLinks(document, "https://example.com").document).toBe(document);
  });
});
