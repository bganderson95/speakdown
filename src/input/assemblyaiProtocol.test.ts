import { describe, expect, it } from "vitest";
import { buildSocketUrl, isTerminationMessage, readTurnEvent } from "./assemblyaiProtocol.js";

describe("buildSocketUrl", () => {
  it("carries the token, encoding, sample rate and formatting flag", () => {
    const url = new URL(buildSocketUrl({ token: "abc", sampleRate: 16000, formatTurns: true }));

    expect(url.origin + url.pathname).toBe("wss://streaming.assemblyai.com/v3/ws");
    expect(url.searchParams.get("token")).toBe("abc");
    expect(url.searchParams.get("encoding")).toBe("pcm_s16le");
    expect(url.searchParams.get("sample_rate")).toBe("16000");
    expect(url.searchParams.get("format_turns")).toBe("true");
  });

  it("reports the microphone's real sample rate, so no resampling is needed", () => {
    const url = new URL(buildSocketUrl({ token: "abc", sampleRate: 48000, formatTurns: true }));
    expect(url.searchParams.get("sample_rate")).toBe("48000");
  });
});

describe("readTurnEvent", () => {
  it("reads a Turn message", () => {
    const raw = JSON.stringify({
      type: "Turn",
      turn_order: 2,
      transcript: "hello there",
      end_of_turn: true,
      turn_is_formatted: true,
      words: [{ text: "hello", start: 0, end: 300, confidence: 0.9, word_is_final: true }],
    });

    expect(readTurnEvent(raw)).toEqual({
      turn_order: 2,
      transcript: "hello there",
      end_of_turn: true,
      turn_is_formatted: true,
      words: [{ text: "hello", start: 0, end: 300, confidence: 0.9, word_is_final: true }],
    });
  });

  it("ignores other message types, including ones we do not know yet", () => {
    expect(readTurnEvent(JSON.stringify({ type: "Begin", id: "x" }))).toBeNull();
    expect(readTurnEvent(JSON.stringify({ type: "Heartbeat" }))).toBeNull();
    expect(readTurnEvent(JSON.stringify({ type: "SomethingNew", transcript: "x" }))).toBeNull();
  });

  it("ignores malformed payloads instead of throwing", () => {
    expect(readTurnEvent("not json")).toBeNull();
    expect(readTurnEvent(JSON.stringify({ type: "Turn" }))).toBeNull();
  });
});

describe("isTerminationMessage", () => {
  it("recognizes the server's goodbye", () => {
    expect(isTerminationMessage(JSON.stringify({ type: "Termination" }))).toBe(true);
    expect(isTerminationMessage(JSON.stringify({ type: "Turn" }))).toBe(false);
    expect(isTerminationMessage("not json")).toBe(false);
  });
});
