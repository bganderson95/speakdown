import { describe, expect, it } from "vitest";
import { EMOJI_MAP, MAX_EMOJI_NAME_WORDS, isEmojiNamePrefix, lookUpEmoji } from "./emoji.js";

describe("lookUpEmoji", () => {
  it("resolves single-word names", () => {
    expect(lookUpEmoji("fire")).toBe("🔥");
    expect(lookUpEmoji("rocket")).toBe("🚀");
  });

  it("resolves multi-word names", () => {
    expect(lookUpEmoji("thumbs up")).toBe("👍");
  });

  it("is case insensitive and trims", () => {
    expect(lookUpEmoji("  Thumbs Up ")).toBe("👍");
  });

  it("returns null on a miss", () => {
    expect(lookUpEmoji("fluffy dog")).toBeNull();
  });
});

describe("EMOJI_MAP", () => {
  it("has no name longer than MAX_EMOJI_NAME_WORDS, which bounds the parser lookahead", () => {
    for (const name of Object.keys(EMOJI_MAP)) {
      expect(name.split(" ").length).toBeLessThanOrEqual(MAX_EMOJI_NAME_WORDS);
    }
  });

  it("uses lowercase names, because lookup lowercases the spoken words", () => {
    for (const name of Object.keys(EMOJI_MAP)) {
      expect(name).toBe(name.toLowerCase());
    }
  });
});

describe("isEmojiNamePrefix", () => {
  it("treats no words as still arriving, since anything could follow", () => {
    expect(isEmojiNamePrefix([])).toBe(true);
  });

  it("recognizes the start of a longer name", () => {
    expect(isEmojiNamePrefix(["thumbs"])).toBe(true);
  });

  it("rejects a word no name starts with", () => {
    expect(isEmojiNamePrefix(["wombat"])).toBe(false);
  });

  it("rejects a complete name, which is a match rather than a prefix", () => {
    expect(isEmojiNamePrefix(["fire"])).toBe(false);
  });

  it("is case insensitive", () => {
    expect(isEmojiNamePrefix(["Thumbs"])).toBe(true);
  });
});
