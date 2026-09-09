import { describe, expect, it } from "vitest";
import { SILENCE_HOLD_MS, SPEECH_THRESHOLD, isAboveSpeechThreshold } from "./useVoiceActivity.js";

describe("isAboveSpeechThreshold", () => {
  it("treats a quiet room as silence", () => {
    // Noise suppression is on, so an empty room sits near zero.
    expect(isAboveSpeechThreshold(0)).toBe(false);
    expect(isAboveSpeechThreshold(0.004)).toBe(false);
  });

  it("treats ordinary speech as speech", () => {
    expect(isAboveSpeechThreshold(0.08)).toBe(true);
    expect(isAboveSpeechThreshold(0.3)).toBe(true);
  });

  it("is inclusive at the threshold", () => {
    expect(isAboveSpeechThreshold(SPEECH_THRESHOLD)).toBe(true);
  });
});

describe("hold", () => {
  it("outlasts the gaps between words but not a real pause", () => {
    // A gap between words is well under this; the silence that stops a
    // session is well over it.
    expect(SILENCE_HOLD_MS).toBeGreaterThan(300);
    expect(SILENCE_HOLD_MS).toBeLessThan(2000);
  });
});
