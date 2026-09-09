import { describe, expect, it } from "vitest";
import { MALFORMED_KEY_MESSAGE, looksLikeApiKey, mintToken } from "./mintToken.js";

describe("looksLikeApiKey", () => {
  it("accepts a 32-character hex key", () => {
    expect(looksLikeApiKey("0123456789abcdef0123456789abcdef")).toBe(true);
  });

  it("accepts uppercase and surrounding whitespace", () => {
    expect(looksLikeApiKey("  0123456789ABCDEF0123456789ABCDEF ")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(looksLikeApiKey("")).toBe(false);
    expect(looksLikeApiKey("not-a-key")).toBe(false);
    expect(looksLikeApiKey("0123456789abcdef")).toBe(false);
    expect(looksLikeApiKey("0123456789abcdef0123456789abcdefx")).toBe(false);
    expect(looksLikeApiKey("zzz3456789abcdef0123456789abcdef")).toBe(false);
  });
});

describe("mintToken", () => {
  it("refuses a malformed key without calling out to the network", async () => {
    // No fetch is stubbed here: reaching the network would throw, so passing
    // proves the check happens first.
    const result = await mintToken("not-a-key");

    expect(result.status).toBe(400);
    expect(result.body).toEqual({ error: MALFORMED_KEY_MESSAGE });
  });

  it("refuses an empty key", async () => {
    expect((await mintToken("")).status).toBe(400);
  });
});
