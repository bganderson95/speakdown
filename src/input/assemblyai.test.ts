import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderMarkdown } from "../model/renderMarkdown.js";
import { parse } from "../parser/parse.js";
import type { Microphone, MicrophoneOptions, PcmChunk } from "./microphone.js";
import type { StreamingSocket, StreamingStatus } from "./assemblyai.js";
import {
  DEFAULT_START_SILENCE_STOP_MS,
  buildSocketUrl,
  createAssemblyAISource,
  isTerminationMessage,
  readTurnEvent,
} from "./assemblyai.js";

// ---------------------------------------------------------------------------
// Fakes for the three injected browser dependencies
// ---------------------------------------------------------------------------

function createFakeSocket() {
  const sent: Array<string | PcmChunk> = [];
  const socket: StreamingSocket = {
    send: (data) => sent.push(data),
    close: vi.fn(),
    onopen: null,
    onmessage: null,
    onerror: null,
    onclose: null,
  };
  return { socket, sent };
}

function createFakeMicrophone(sampleRate = 16000) {
  let captured: MicrophoneOptions | null = null;
  const stop = vi.fn(async () => {});

  return {
    stop,
    getOptions: () => captured,
    /** Pretends the microphone produced one chunk of audio. */
    emitChunk: (samples = 8) => captured?.onChunk(new Int16Array(samples) as PcmChunk),
    open: async (options: MicrophoneOptions): Promise<Microphone> => {
      captured = options;
      return { sampleRate, stop };
    },
  };
}

/** A source wired to fakes, plus handles to drive them from a test. */
function createHarness(
  overrides: {
    sampleRate?: number;
    token?: () => Promise<string>;
    silenceStopMs?: number;
    startSilenceStopMs?: number;
    pauseParagraphMs?: number;
  } = {},
) {
  const { socket, sent } = createFakeSocket();
  const microphone = createFakeMicrophone(overrides.sampleRate ?? 16000);
  const urls: string[] = [];

  const source = createAssemblyAISource({
    ...(overrides.silenceStopMs === undefined ? {} : { silenceStopMs: overrides.silenceStopMs }),
    ...(overrides.startSilenceStopMs === undefined
      ? {}
      : { startSilenceStopMs: overrides.startSilenceStopMs }),
    ...(overrides.pauseParagraphMs === undefined
      ? {}
      : { pauseParagraphMs: overrides.pauseParagraphMs }),
    dependencies: {
      fetchToken: overrides.token ?? (async () => "temp-token"),
      openMicrophone: microphone.open,
      openSocket: (url) => {
        urls.push(url);
        return socket;
      },
    },
  });

  const statuses: StreamingStatus[] = [];
  source.subscribeStatus((status) => statuses.push(status));

  const transcripts: string[] = [];
  source.subscribe((transcript) => transcripts.push(transcript));

  /** Delivers a Turn message the way the server would. */
  function receiveTurn(turn: {
    turn_order: number;
    transcript: string;
    end_of_turn?: boolean;
    turn_is_formatted?: boolean;
  }) {
    socket.onmessage?.(
      JSON.stringify({
        type: "Turn",
        end_of_turn: false,
        turn_is_formatted: false,
        words: [],
        ...turn,
      }),
    );
  }

  return { source, socket, sent, microphone, urls, statuses, transcripts, receiveTurn };
}

// ---------------------------------------------------------------------------

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

describe("streaming session", () => {
  it("opens the microphone before the socket, so the URL has the real rate", async () => {
    const harness = createHarness({ sampleRate: 44100 });
    await harness.source.start();

    expect(new URL(harness.urls[0] ?? "").searchParams.get("sample_rate")).toBe("44100");
  });

  it("reaches 'listening' once the socket opens", async () => {
    const harness = createHarness();
    await harness.source.start();
    expect(harness.source.getStatus()).toBe("starting");

    harness.socket.onopen?.();

    expect(harness.source.getStatus()).toBe("listening");
    expect(harness.statuses).toEqual(["starting", "listening"]);
  });

  it("buffers audio recorded before the socket opens, then flushes it", async () => {
    const harness = createHarness();
    await harness.source.start();

    harness.microphone.emitChunk();
    harness.microphone.emitChunk();
    expect(harness.sent).toHaveLength(0);

    harness.socket.onopen?.();

    expect(harness.sent).toHaveLength(2);
  });

  it("sends audio straight through once open", async () => {
    const harness = createHarness();
    await harness.source.start();
    harness.socket.onopen?.();

    harness.microphone.emitChunk();

    expect(harness.sent).toHaveLength(1);
  });

  it("publishes the transcript as turns arrive", async () => {
    const harness = createHarness();
    await harness.source.start();
    harness.socket.onopen?.();

    harness.receiveTurn({ turn_order: 0, transcript: "hello" });
    harness.receiveTurn({ turn_order: 0, transcript: "hello there" });
    harness.receiveTurn({ turn_order: 1, transcript: "friend" });

    expect(harness.transcripts).toEqual(["hello", "hello there", "hello there friend"]);
    expect(harness.source.getTranscript()).toBe("hello there friend");
  });

  it("does not republish when a turn changes nothing", async () => {
    const harness = createHarness();
    await harness.source.start();
    harness.socket.onopen?.();

    harness.receiveTurn({ turn_order: 0, transcript: "hello" });
    harness.receiveTurn({ turn_order: 0, transcript: "hello" });

    expect(harness.transcripts).toEqual(["hello"]);
  });

  it("feeds the very same parser the textarea uses", async () => {
    const harness = createHarness();
    await harness.source.start();
    harness.socket.onopen?.();

    harness.receiveTurn({
      turn_order: 0,
      transcript: "Ship it bold today.",
      end_of_turn: true,
      turn_is_formatted: true,
    });

    expect(renderMarkdown(parse(harness.source.getTranscript()).document)).toBe(
      "Ship it **today.**",
    );
  });

  it("stops the microphone and asks the server to terminate", async () => {
    const harness = createHarness();
    await harness.source.start();
    harness.socket.onopen?.();

    await harness.source.stop();

    expect(harness.microphone.stop).toHaveBeenCalled();
    expect(harness.sent).toContain(JSON.stringify({ type: "Terminate" }));
    expect(harness.source.getStatus()).toBe("stopping");
  });

  it("goes idle when the server confirms termination", async () => {
    const harness = createHarness();
    await harness.source.start();
    harness.socket.onopen?.();
    await harness.source.stop();

    harness.socket.onmessage?.(JSON.stringify({ type: "Termination" }));
    await vi.waitFor(() => expect(harness.source.getStatus()).toBe("idle"));
  });

  it("keeps the final turn that arrives after Terminate is sent", async () => {
    const harness = createHarness();
    await harness.source.start();
    harness.socket.onopen?.();
    harness.receiveTurn({ turn_order: 0, transcript: "hello" });

    await harness.source.stop();
    harness.receiveTurn({
      turn_order: 0,
      transcript: "Hello there.",
      end_of_turn: true,
      turn_is_formatted: true,
    });

    expect(harness.source.getTranscript()).toBe("Hello there.");
  });

  it("reports a refused microphone without throwing", async () => {
    const harness = createHarness();
    const source = createAssemblyAISource({
      dependencies: {
        fetchToken: async () => "temp-token",
        openMicrophone: async () => {
          throw new Error("Microphone access was refused.");
        },
        openSocket: () => harness.socket,
      },
    });

    await source.start();

    expect(source.getStatus()).toBe("error");
    expect(source.getError()).toBe("Microphone access was refused.");
  });

  it("reports a failed token request and releases the microphone", async () => {
    const microphone = createFakeMicrophone();
    const source = createAssemblyAISource({
      dependencies: {
        fetchToken: async () => {
          throw new Error("Token endpoint returned 503. ASSEMBLYAI_API_KEY is not set.");
        },
        openMicrophone: microphone.open,
        openSocket: () => createFakeSocket().socket,
      },
    });

    await source.start();

    expect(source.getStatus()).toBe("error");
    expect(source.getError()).toContain("ASSEMBLYAI_API_KEY");
    expect(microphone.stop).toHaveBeenCalled();
  });

  it("reports a socket error", async () => {
    const harness = createHarness();
    await harness.source.start();
    harness.socket.onopen?.();

    harness.socket.onerror?.("The streaming connection failed.");
    await vi.waitFor(() => expect(harness.source.getStatus()).toBe("error"));
    expect(harness.source.getError()).toBe("The streaming connection failed.");
  });

  it("reports an unexpected close during a session", async () => {
    const harness = createHarness();
    await harness.source.start();
    harness.socket.onopen?.();

    harness.socket.onclose?.();
    await vi.waitFor(() => expect(harness.source.getStatus()).toBe("error"));
    expect(harness.source.getError()).toContain("closed unexpectedly");
  });

  it("clears the transcript when a new session starts", async () => {
    const harness = createHarness();
    await harness.source.start();
    harness.socket.onopen?.();
    harness.receiveTurn({ turn_order: 0, transcript: "first session" });

    await harness.source.stop();
    await harness.source.start();

    expect(harness.source.getTranscript()).toBe("");
  });

  it("ignores a second start while already running", async () => {
    const harness = createHarness();
    await harness.source.start();
    harness.socket.onopen?.();
    await harness.source.start();

    expect(harness.urls).toHaveLength(1);
  });

  it("collects word timings for the future prosody pass", async () => {
    const harness = createHarness();
    await harness.source.start();
    harness.socket.onopen?.();

    harness.socket.onmessage?.(
      JSON.stringify({
        type: "Turn",
        turn_order: 0,
        transcript: "hello",
        end_of_turn: true,
        turn_is_formatted: false,
        words: [{ text: "hello", start: 120, end: 480, confidence: 0.98, word_is_final: true }],
      }),
    );

    expect(harness.source.getWords()).toEqual([
      { text: "hello", start: 120, end: 480, confidence: 0.98, word_is_final: true },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Stopping itself after silence
// ---------------------------------------------------------------------------

describe("automatic stop after silence", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Brings a session up to "listening" with the silence watch running. */
  async function listeningHarness(silenceStopMs = 5000) {
    const harness = createHarness({ silenceStopMs });
    await harness.source.start();
    harness.socket.onopen?.();
    return harness;
  }

  it("stops once the transcript has gone quiet for long enough", async () => {
    const harness = await listeningHarness();
    harness.receiveTurn({ turn_order: 0, transcript: "some words" });
    expect(harness.source.getStatus()).toBe("listening");

    await vi.advanceTimersByTimeAsync(5000);

    expect(harness.source.getStatus()).toBe("stopping");
    expect(harness.microphone.stop).toHaveBeenCalled();
    expect(harness.sent).toContain(JSON.stringify({ type: "Terminate" }));
  });

  it("does not stop while the speaker is still going", async () => {
    const harness = await listeningHarness();

    await vi.advanceTimersByTimeAsync(4000);
    harness.receiveTurn({ turn_order: 0, transcript: "still talking" });
    await vi.advanceTimersByTimeAsync(4000);

    expect(harness.source.getStatus()).toBe("listening");
  });

  it("restarts the countdown on every turn that adds words", async () => {
    const harness = await listeningHarness();

    for (let i = 0; i < 4; i++) {
      await vi.advanceTimersByTimeAsync(3000);
      harness.receiveTurn({ turn_order: i, transcript: `turn ${i}` });
    }
    expect(harness.source.getStatus()).toBe("listening");

    await vi.advanceTimersByTimeAsync(5000);
    expect(harness.source.getStatus()).toBe("stopping");
  });

  it("is not restarted by a turn that changes nothing", async () => {
    const harness = await listeningHarness();
    harness.receiveTurn({ turn_order: 0, transcript: "hello" });

    await vi.advanceTimersByTimeAsync(3000);
    harness.receiveTurn({ turn_order: 0, transcript: "hello" });
    await vi.advanceTimersByTimeAsync(2000);

    expect(harness.source.getStatus()).toBe("stopping");
  });

  it("reports that silence was what stopped it", async () => {
    const harness = await listeningHarness();
    harness.receiveTurn({ turn_order: 0, transcript: "some words" });
    await vi.advanceTimersByTimeAsync(5000);

    expect(harness.source.getStopReason()).toBe("silence");
  });

  it("reports a user stop as a user stop", async () => {
    const harness = await listeningHarness();
    await harness.source.stop();

    expect(harness.source.getStopReason()).toBe("user");
  });

  it("keeps everything spoken before the silence", async () => {
    const harness = await listeningHarness();
    harness.receiveTurn({ turn_order: 0, transcript: "keep this", end_of_turn: true });

    await vi.advanceTimersByTimeAsync(5000);

    expect(harness.source.getTranscript()).toBe("keep this");
  });

  it("gives a longer grace period before the first words", async () => {
    // Gathering your thoughts after pressing record is not trailing off.
    const harness = await listeningHarness();

    await vi.advanceTimersByTimeAsync(DEFAULT_START_SILENCE_STOP_MS - 1000);
    expect(harness.source.getStatus()).toBe("listening");

    await vi.advanceTimersByTimeAsync(1000);
    expect(harness.source.getStatus()).toBe("stopping");
  });

  it("switches to the shorter window once the first words arrive", async () => {
    const harness = await listeningHarness();

    await vi.advanceTimersByTimeAsync(3000);
    harness.receiveTurn({ turn_order: 0, transcript: "first words" });

    await vi.advanceTimersByTimeAsync(5000);
    expect(harness.source.getStatus()).toBe("stopping");
  });

  it("can be switched off", async () => {
    const harness = await listeningHarness(0);

    await vi.advanceTimersByTimeAsync(60000);

    expect(harness.source.getStatus()).toBe("listening");
  });

  it("does not fire after the session has already ended", async () => {
    const harness = await listeningHarness();
    harness.receiveTurn({ turn_order: 0, transcript: "some words" });
    await harness.source.stop();
    harness.socket.onmessage?.(JSON.stringify({ type: "Termination" }));
    await vi.advanceTimersByTimeAsync(30000);

    expect(harness.source.getStatus()).toBe("idle");
    expect(harness.source.getStopReason()).toBe("user");
  });

  it("clears the reason when a new session starts", async () => {
    const harness = await listeningHarness();
    harness.receiveTurn({ turn_order: 0, transcript: "some words" });
    await vi.advanceTimersByTimeAsync(5000);
    expect(harness.source.getStopReason()).toBe("silence");

    await harness.source.start();
    expect(harness.source.getStopReason()).toBeNull();
  });
});

describe("amplitude", () => {
  it("reports loudness for each chunk of audio", async () => {
    const harness = createHarness();
    await harness.source.start();
    harness.socket.onopen?.();

    const levels: number[] = [];
    harness.source.subscribeAmplitude((amplitude) => levels.push(amplitude));

    // Silence, then a chunk at roughly half scale.
    harness.microphone.emitChunk(8);
    const loud = new Int16Array(8).fill(16384) as PcmChunk;
    harness.microphone.getOptions()?.onChunk(loud);

    expect(levels).toHaveLength(2);
    expect(levels[0]).toBe(0);
    expect(levels[1]).toBeCloseTo(0.5, 2);
  });

  it("stops reporting after unsubscribe", async () => {
    const harness = createHarness();
    await harness.source.start();
    harness.socket.onopen?.();

    const levels: number[] = [];
    const unsubscribe = harness.source.subscribeAmplitude((a) => levels.push(a));
    harness.microphone.emitChunk();
    unsubscribe();
    harness.microphone.emitChunk();

    expect(levels).toHaveLength(1);
  });
});
