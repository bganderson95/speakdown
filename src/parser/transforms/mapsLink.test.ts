import { describe, expect, it } from "vitest";
import { buildMapsLink } from "./mapsLink.js";

describe("buildMapsLink", () => {
  it("builds a Maps search URL from an address", () => {
    expect(buildMapsLink("1600 Pennsylvania Avenue")).toEqual({
      text: "1600 Pennsylvania Avenue",
      href: "https://www.google.com/maps/search/?api=1&query=1600%20Pennsylvania%20Avenue",
    });
  });

  it("preserves the address casing for the display text", () => {
    expect(buildMapsLink("Big Ben")?.text).toBe("Big Ben");
  });

  it("encodes spaces", () => {
    expect(buildMapsLink("two words")?.href).toContain("two%20words");
  });

  it("encodes characters that would otherwise break the query", () => {
    const href = buildMapsLink("A & B #3")?.href ?? "";
    expect(href).toContain("A%20%26%20B%20%233");
    // The encoded form must not introduce a second query parameter.
    expect(href.split("&")).toHaveLength(2);
  });

  it("encodes non-ASCII characters", () => {
    expect(buildMapsLink("Champs-Élysées")?.href).toContain("Champs-%C3%89lys%C3%A9es");
  });

  it("collapses runs of whitespace", () => {
    expect(buildMapsLink("  1600   Pennsylvania  ")?.text).toBe("1600 Pennsylvania");
  });

  it("returns null for an empty address", () => {
    // Documented: nothing spoken means no link at all, not an empty one.
    expect(buildMapsLink("")).toBeNull();
    expect(buildMapsLink("   ")).toBeNull();
  });

  it("is deterministic", () => {
    expect(buildMapsLink("1 Infinite Loop")).toEqual(buildMapsLink("1 Infinite Loop"));
  });
});
