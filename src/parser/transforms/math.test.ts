import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { evaluateSpokenMath, formatMathValue } from "./math.js";
import { tokenizeMath } from "./mathTokens.js";

/** Evaluates a spoken phrase, for readable one-line test cases. */
function calc(phrase: string) {
  return evaluateSpokenMath(phrase.split(" "));
}

function value(phrase: string): string {
  const result = calc(phrase);
  if (!result.ok) {
    throw new Error(`expected "${phrase}" to evaluate, got: ${result.reason}`);
  }
  return result.value;
}

describe("tokenizeMath", () => {
  it("reads numerals and operators", () => {
    expect(tokenizeMath(["45", "plus", "12"])).toEqual([
      { kind: "number", value: 45 },
      { kind: "operator", symbol: "+" },
      { kind: "number", value: 12 },
    ]);
  });

  it("reads spelled-out numbers", () => {
    expect(tokenizeMath(["forty", "five"])).toEqual([{ kind: "number", value: 45 }]);
  });

  it("reads hyphenated compound numbers", () => {
    expect(tokenizeMath(["forty-five"])).toEqual([{ kind: "number", value: 45 }]);
  });

  it("reads hundreds and thousands", () => {
    expect(tokenizeMath(["one", "hundred", "twenty", "three"])).toEqual([
      { kind: "number", value: 123 },
    ]);
    expect(tokenizeMath(["two", "thousand"])).toEqual([{ kind: "number", value: 2000 }]);
  });

  it("accepts 'and' inside a spelled-out number", () => {
    expect(tokenizeMath(["one", "hundred", "and", "five"])).toEqual([
      { kind: "number", value: 105 },
    ]);
  });

  it("strips thousands separators from numerals", () => {
    expect(tokenizeMath(["1,200"])).toEqual([{ kind: "number", value: 1200 }]);
  });

  it("rejects a word it does not know", () => {
    expect(tokenizeMath(["45", "plus", "banana"])).toBeNull();
  });
});

describe("evaluateSpokenMath arithmetic", () => {
  it("computes the example from the spec", () => {
    expect(value("45 plus 12 plus 82")).toBe("139");
  });

  it("handles each operator", () => {
    expect(value("10 plus 4")).toBe("14");
    expect(value("10 minus 4")).toBe("6");
    expect(value("10 times 4")).toBe("40");
    expect(value("10 divided by 4")).toBe("2.5");
  });

  it("accepts the operator aliases", () => {
    expect(value("10 multiplied by 4")).toBe("40");
    expect(value("10 over 4")).toBe("2.5");
    expect(value("10 add 4")).toBe("14");
    expect(value("10 subtract 4")).toBe("6");
  });

  it("computes with spelled-out numbers", () => {
    expect(value("forty five plus twelve")).toBe("57");
  });

  it("handles decimals", () => {
    expect(value("1.5 plus 2.25")).toBe("3.75");
  });

  it("respects operator precedence", () => {
    expect(value("2 plus 3 times 4")).toBe("14");
    expect(value("10 minus 6 divided by 2")).toBe("7");
  });

  it("respects grouping with spoken parentheses", () => {
    expect(value("open paren 2 plus 3 close paren times 4")).toBe("20");
  });

  it("handles a leading minus", () => {
    expect(value("minus 5 plus 12")).toBe("7");
  });
});

describe("formatMathValue", () => {
  it("renders integers without a decimal point", () => {
    expect(formatMathValue(139)).toBe("139");
    expect(formatMathValue(-4)).toBe("-4");
  });

  it("rounds to at most four decimal places", () => {
    expect(formatMathValue(1 / 3)).toBe("0.3333");
  });

  it("trims trailing zeros", () => {
    expect(formatMathValue(2.5)).toBe("2.5");
  });

  it("cleans up floating point noise", () => {
    expect(formatMathValue(0.1 + 0.2)).toBe("0.3");
  });
});

describe("evaluateSpokenMath failures", () => {
  it("fails on division by zero rather than emitting Infinity", () => {
    const result = calc("10 divided by 0");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain("zero");
  });

  it("fails on empty input", () => {
    expect(evaluateSpokenMath([]).ok).toBe(false);
  });

  it("fails on words it does not understand", () => {
    expect(calc("45 plus banana").ok).toBe(false);
  });

  it("fails on a dangling operator", () => {
    expect(calc("45 plus").ok).toBe(false);
  });

  it("fails on two numbers with no operator", () => {
    // "2 3" is not an expression; guessing would invent a result.
    expect(calc("2 3").ok).toBe(false);
  });

  it("fails on an unclosed group", () => {
    expect(calc("open paren 2 plus 3").ok).toBe(false);
  });

  it("never throws, whatever it is handed", () => {
    for (const phrase of ["", ")", "close paren", "plus", "times times", "1.2.3"]) {
      expect(() => evaluateSpokenMath(phrase.split(" "))).not.toThrow();
    }
  });
});

describe("safety", () => {
  it("uses neither eval nor Function to compute", () => {
    for (const file of ["./math.ts", "./mathTokens.ts"]) {
      const source = readFileSync(new URL(file, import.meta.url), "utf8");
      // Strip comments so the prose above may mention them.
      const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");
      expect(code).not.toMatch(/\beval\s*\(/);
      expect(code).not.toMatch(/\bnew\s+Function\b/);
      expect(code).not.toMatch(/\bFunction\s*\(/);
    }
  });
});
