/**
 * assemblyaiProtocol.ts — reading and writing AssemblyAI's streaming wire
 * format.
 *
 * Pure functions over strings: no socket, no microphone, no clock. Keeping them
 * apart from the session state machine is what lets the protocol be tested
 * exhaustively without faking a browser.
 */

import type { TurnEvent, TurnWord } from "./transcriptBuffer.js";

export const STREAMING_URL = "wss://streaming.assemblyai.com/v3/ws";

/** Builds the connection URL. Kept separate so a test can assert on it. */
export function buildSocketUrl(options: {
  token: string;
  sampleRate: number;
  formatTurns: boolean;
}): string {
  const url = new URL(STREAMING_URL);
  url.searchParams.set("token", options.token);
  url.searchParams.set("encoding", "pcm_s16le");
  url.searchParams.set("sample_rate", String(Math.round(options.sampleRate)));
  url.searchParams.set("format_turns", String(options.formatTurns));
  return url.toString();
}

/**
 * Narrows a raw server message to a Turn event, or null for anything else
 * (Begin, Termination, Heartbeat, SpeechStarted, unknown future types).
 *
 * Unknown messages are ignored rather than treated as errors, so a new server
 * message type cannot break a live session.
 */
export function readTurnEvent(raw: string): TurnEvent | null {
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const message = payload as Record<string, unknown>;
  if (message["type"] !== "Turn") {
    return null;
  }
  if (typeof message["transcript"] !== "string" || typeof message["turn_order"] !== "number") {
    return null;
  }

  return {
    turn_order: message["turn_order"],
    transcript: message["transcript"],
    end_of_turn: message["end_of_turn"] === true,
    turn_is_formatted: message["turn_is_formatted"] === true,
    words: Array.isArray(message["words"]) ? (message["words"] as TurnWord[]) : [],
  };
}

/** True when the message is the server confirming the session has ended. */
export function isTerminationMessage(raw: string): boolean {
  try {
    const payload: unknown = JSON.parse(raw);
    return (
      typeof payload === "object" &&
      payload !== null &&
      (payload as { type?: unknown }).type === "Termination"
    );
  } catch {
    return false;
  }
}

