import { describe, expect, it } from "vitest";
import { resolveDate } from "./dateResolve.js";

/** A fixed clock: Tuesday, 8 September 2026. Local midday avoids edge effects. */
const NOW = new Date(2026, 8, 8, 12, 0, 0);

function iso(phrase: string, now: Date = NOW): string {
  const result = resolveDate(phrase, now);
  if (!result.ok) {
    throw new Error(`expected "${phrase}" to resolve, got: ${result.reason}`);
  }
  return result.iso;
}

describe("resolveDate relative days", () => {
  it("resolves today", () => {
    expect(iso("today")).toBe("2026-09-08");
  });

  it("resolves tomorrow", () => {
    expect(iso("tomorrow")).toBe("2026-09-09");
  });

  it("resolves yesterday", () => {
    expect(iso("yesterday")).toBe("2026-09-07");
  });

  it("rolls over a month boundary", () => {
    expect(iso("tomorrow", new Date(2026, 8, 30, 12))).toBe("2026-10-01");
  });

  it("rolls over a year boundary", () => {
    expect(iso("tomorrow", new Date(2026, 11, 31, 12))).toBe("2027-01-01");
  });

  it("handles a leap day", () => {
    expect(iso("tomorrow", new Date(2028, 1, 28, 12))).toBe("2028-02-29");
  });
});

describe("resolveDate weekdays", () => {
  it("resolves next weekday later in the same week", () => {
    // NOW is a Tuesday.
    expect(iso("next friday")).toBe("2026-09-11");
  });

  it("resolves next weekday that has already passed this week", () => {
    expect(iso("next monday")).toBe("2026-09-14");
  });

  it("resolves next <today's weekday> as a week away, never today", () => {
    expect(iso("next tuesday")).toBe("2026-09-15");
  });

  it("resolves last weekday", () => {
    expect(iso("last friday")).toBe("2026-09-04");
  });

  it("resolves last <today's weekday> as a week back, never today", () => {
    expect(iso("last tuesday")).toBe("2026-09-01");
  });

  it("rejects a non-weekday after next", () => {
    expect(resolveDate("next banana", NOW).ok).toBe(false);
  });
});

describe("resolveDate explicit dates", () => {
  it("resolves month and ordinal day", () => {
    expect(iso("september tenth")).toBe("2026-09-10");
  });

  it("resolves month and numeric day", () => {
    expect(iso("march 3")).toBe("2026-03-03");
  });

  it("resolves month, day and year", () => {
    expect(iso("march 3 2027")).toBe("2027-03-03");
  });

  it("accepts a suffixed numeral", () => {
    expect(iso("march 3rd")).toBe("2026-03-03");
  });

  it("accepts a two-word ordinal", () => {
    expect(iso("july twenty first")).toBe("2026-07-21");
  });

  it("accepts a hyphenated ordinal", () => {
    expect(iso("july twenty-first")).toBe("2026-07-21");
  });

  it("accepts an abbreviated month", () => {
    expect(iso("dec 25")).toBe("2026-12-25");
  });

  it("uses the year of `now` when none is spoken", () => {
    expect(iso("january 1", new Date(2030, 5, 5, 12))).toBe("2030-01-01");
  });

  it("rejects a day that does not exist in that month", () => {
    const result = resolveDate("february 30", NOW);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain("does not exist");
  });

  it("rejects a month with no day", () => {
    expect(resolveDate("september", NOW).ok).toBe(false);
  });

  it("rejects extra words after a date", () => {
    expect(resolveDate("september tenth please", NOW).ok).toBe(false);
  });
});

describe("resolveDate failures", () => {
  it("rejects an empty phrase", () => {
    expect(resolveDate("", NOW).ok).toBe(false);
    expect(resolveDate("   ", NOW).ok).toBe(false);
  });

  it("rejects an unrecognized phrase", () => {
    expect(resolveDate("some time next century", NOW).ok).toBe(false);
  });

  it("never throws, whatever it is handed", () => {
    for (const phrase of ["", "next", "last", "!!!", "9999999999", "next next friday"]) {
      expect(() => resolveDate(phrase, NOW)).not.toThrow();
    }
  });
});

describe("resolveDate determinism", () => {
  it("gives the same answer for the same clock, every time", () => {
    expect(resolveDate("next friday", NOW)).toEqual(resolveDate("next friday", NOW));
  });

  it("depends only on the injected clock, not the real one", () => {
    expect(iso("today", new Date(1999, 0, 1, 12))).toBe("1999-01-01");
  });

  it("is case insensitive", () => {
    expect(iso("Next Friday")).toBe("2026-09-11");
  });
});
