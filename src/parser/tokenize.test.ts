import { describe, expect, it } from "vitest";
import { tokenize } from "./tokenize.js";

describe("tokenize", () => {
  it("splits on whitespace", () => {
    expect(tokenize("hello there world").map((token) => token.raw)).toEqual([
      "hello",
      "there",
      "world",
    ]);
  });

  it("collapses runs of whitespace and newlines", () => {
    expect(tokenize("  hello \n\t there  ").map((token) => token.raw)).toEqual(["hello", "there"]);
  });

  it("returns no tokens for empty or whitespace-only input", () => {
    expect(tokenize("")).toEqual([]);
    expect(tokenize("   \n ")).toEqual([]);
  });

  it("preserves original casing while lowercasing for matching", () => {
    const [token] = tokenize("Bold");
    expect(token?.raw).toBe("Bold");
    expect(token?.lower).toBe("bold");
    expect(token?.word).toBe("bold");
  });

  it("strips edge punctuation for matching but not for emitting", () => {
    const [token] = tokenize("bold,");
    expect(token?.raw).toBe("bold,");
    expect(token?.word).toBe("bold");
  });

  it("leaves inner punctuation alone", () => {
    const [token] = tokenize("example.com");
    expect(token?.word).toBe("example.com");
  });
});
