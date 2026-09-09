import { describe, expect, it } from "vitest";
import { normalizeSpokenUrl } from "./normalizeSpokenUrl.js";

describe("normalizeSpokenUrl", () => {
  const cases: Array<[spoken: string, expected: string]> = [
    // The canonical example from the spec.
    ["example dot com slash q3", "https://example.com/q3"],

    // Bare domains get an https scheme.
    ["example dot com", "https://example.com"],
    ["www dot example dot com", "https://www.example.com"],

    // Spelled-out schemes.
    ["https colon slash slash example dot com", "https://example.com"],
    ["http colon slash slash example dot com", "http://example.com"],
    ["https example dot com", "https://example.com"],
    ["https colon slash slash www dot example dot com slash docs", "https://www.example.com/docs"],

    // Symbol words.
    ["my dash site dot com", "https://my-site.com"],
    ["my hyphen site dot com", "https://my-site.com"],
    ["docs dot example dot com slash q3 underscore plan", "https://docs.example.com/q3_plan"],
    ["example dot com forward slash pricing", "https://example.com/pricing"],
    ["example dot com colon 8080 slash health", "https://example.com:8080/health"],

    // Words with no space between them join up, because spoken URLs have none.
    ["my site dot com", "https://mysite.com"],

    // Casing from a recognizer is arbitrary, so it is normalized away.
    ["Example Dot Com", "https://example.com"],

    // Trailing punctuation added by a recognizer is dropped.
    ["example dot com.", "https://example.com"],

    // Already-normalized text passes straight through.
    ["https://example.com/q3", "https://example.com/q3"],
    ["example.com", "https://example.com"],
  ];

  for (const [spoken, expected] of cases) {
    it(`normalizes "${spoken}"`, () => {
      expect(normalizeSpokenUrl(spoken)).toBe(expected);
    });
  }

  it("returns an empty string for empty input", () => {
    expect(normalizeSpokenUrl("")).toBe("");
    expect(normalizeSpokenUrl("   ")).toBe("");
  });

  it("returns an empty string when only a scheme was spoken", () => {
    expect(normalizeSpokenUrl("https colon slash slash")).toBe("");
  });

  it("is deterministic", () => {
    const once = normalizeSpokenUrl("example dot com slash q3");
    const twice = normalizeSpokenUrl("example dot com slash q3");
    expect(once).toBe(twice);
  });
});
