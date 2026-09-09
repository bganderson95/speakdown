/**
 * assemblyai.ts — the v2 transcript source: live speech.
 *
 * Implements the same TranscriptSource interface as textInput.ts, so the
 * parser, the renderers and the UI's data flow are unchanged. Speech in, plain
 * transcript string out.
 *
 * Protocol: AssemblyAI Universal-Streaming v3.
 *   socket   wss://streaming.assemblyai.com/v3/ws
 *   audio    binary frames, 16-bit little-endian PCM, mono
 *   messages JSON — Begin, Turn, Termination
 *   ending   send {"type":"Terminate"} and wait for the final Turn
 *
 * The API key never reaches the browser. The client asks its own backend for a
 * short-lived token (see vite-plugins/assemblyaiToken.ts for the dev server's
 * implementation) and passes that token as a query parameter.
 *
 * Every browser dependency is injected, so the session state machine is tested
 * with fakes in assemblyai.test.ts.
 */

import type { Microphone, MicrophoneOptions, PcmChunk } from "./microphone.js";
import { openMicrophone } from "./microphone.js";
import type { TranscriptSource } from "./textInput.js";
import type { TurnEvent, TurnWord } from "./transcriptBuffer.js";
import { DEFAULT_PAUSE_PARAGRAPH_MS, createTranscriptBuffer } from "./transcriptBuffer.js";

/**
 * The header the browser uses to present its own AssemblyAI key.
 *
 * Declared here rather than imported from server/, which would breach the
 * import boundary in CLAUDE.md §4. A test asserts this matches the server's
 * copy, so the two cannot drift.
 */
export const API_KEY_HEADER = "x-assemblyai-key";

export const STREAMING_URL = "wss://streaming.assemblyai.com/v3/ws";
export const DEFAULT_TOKEN_ENDPOINT = "/api/assemblyai-token";

/** How long to wait for the server's goodbye before closing anyway. */
const TERMINATE_TIMEOUT_MS = 1500;

/** Audio buffered while the socket is still opening, in chunks (~50 ms each). */
const MAX_PENDING_CHUNKS = 40;

/**
 * How long the transcript can go unchanged before the session stops itself.
 *
 * Nothing arrives from the server while nobody is speaking, so this is a wall
 * clock timer rather than something measured on the audio timeline: the absence
 * of messages IS the signal. It is reset by every turn that changes the
 * transcript, so it only fires on real silence.
 */
export const DEFAULT_SILENCE_STOP_MS = 5000;

/**
 * The same idea, but before the first words of a session.
 *
 * Gathering your thoughts after pressing record is not the same as trailing
 * off mid-dictation, and stopping after five seconds of it would feel broken.
 * There is still a limit, so a session started by accident cannot run forever.
 */
export const DEFAULT_START_SILENCE_STOP_MS = 15000;

export type StreamingStatus = "idle" | "starting" | "listening" | "stopping" | "error";

/** Why a session ended: because it was asked to, or because nobody spoke. */
export type StopReason = "user" | "silence";

/** What gets sent over the socket: JSON control messages, or PCM16 audio. */
export type StreamingPayload = string | PcmChunk;

/** The bits of a WebSocket this module uses. Kept small so fakes are trivial. */
export interface StreamingSocket {
  send: (data: StreamingPayload) => void;
  close: () => void;
  onopen: (() => void) | null;
  onmessage: ((data: string) => void) | null;
  onerror: ((message: string) => void) | null;
  onclose: (() => void) | null;
}

export interface StreamingDependencies {
  fetchToken: (endpoint: string, apiKey: string | null) => Promise<string>;
  openSocket: (url: string) => StreamingSocket;
  openMicrophone: (options: MicrophoneOptions) => Promise<Microphone>;
}

export interface StreamingOptions {
  /** Backend endpoint that mints a temporary token. */
  tokenEndpoint?: string;
  /** Ask AssemblyAI for punctuated, cased final turns. Default true. */
  formatTurns?: boolean;
  /**
   * Silence between turns that becomes a paragraph break, in milliseconds.
   * Zero disables it. Defaults to DEFAULT_PAUSE_PARAGRAPH_MS.
   */
  pauseParagraphMs?: number;
  /**
   * Silence that stops the session, in milliseconds. Zero disables it.
   * Defaults to DEFAULT_SILENCE_STOP_MS.
   */
  silenceStopMs?: number;
  /**
   * The grace period before the first words arrive, in milliseconds.
   * Defaults to DEFAULT_START_SILENCE_STOP_MS.
   */
  startSilenceStopMs?: number;
  /**
   * The user's own AssemblyAI key, read fresh at the start of every session.
   * Null means "let the backend decide", which only succeeds in local
   * development, where the dev server falls back to .env.local.
   */
  getApiKey?: () => string | null;
  /** Overrides for tests. */
  dependencies?: Partial<StreamingDependencies>;
}

export interface StreamingSource extends TranscriptSource {
  /**
   * Subscribe to the microphone's loudness, 0..1, one value per audio chunk
   * (~50 ms). This is what drives the voice line in the UI; it is derived from
   * the audio already being streamed, so it costs one extra pass over each
   * chunk and no second microphone.
   */
  subscribeAmplitude: (listener: (amplitude: number) => void) => () => void;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  getStatus: () => StreamingStatus;
  getError: () => string | null;
  /** How the last session ended. Null until one has ended. */
  getStopReason: () => StopReason | null;
  subscribeStatus: (listener: (status: StreamingStatus, error: string | null) => void) => () => void;
  /** Word timings received so far. The seam for the v2 prosody pass. */
  getWords: () => TurnWord[];
}

// ---------------------------------------------------------------------------
// Browser implementations of the injected dependencies
// ---------------------------------------------------------------------------

/**
 * Asks our own backend for a temporary streaming token.
 *
 * The user's key is sent per-request and never stored server-side. It has to
 * make this one hop because AssemblyAI's token endpoint sends no CORS headers,
 * so the browser cannot call it directly.
 */
async function fetchTokenFromBackend(endpoint: string, apiKey: string | null): Promise<string> {
  const headers: Record<string, string> = {};
  if (apiKey !== null && apiKey.trim().length > 0) {
    headers[API_KEY_HEADER] = apiKey.trim();
  }

  let response: Response;
  try {
    response = await fetch(endpoint, { headers });
  } catch {
    throw new Error(`Could not reach the token endpoint at ${endpoint}.`);
  }

  if (!response.ok) {
    // The endpoint puts a readable reason in { error }; show that rather than
    // a status code the user can do nothing with.
    const raw = (await response.text()).slice(0, 400);
    let message = raw;
    try {
      const parsed: unknown = JSON.parse(raw);
      const reason = (parsed as { error?: unknown }).error;
      if (typeof reason === "string") {
        message = reason;
      }
    } catch {
      // Not JSON; the raw body is the best we have.
    }
    throw new Error(message);
  }

  // A static host with no function deployed answers this route with the app's
  // own index.html, so a 200 is not proof of an endpoint. Say what is actually
  // wrong rather than letting a JSON parse error surface.
  const raw = await response.text();
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new Error(
      `No token endpoint is deployed at ${endpoint}. Deploy the function in api/ alongside the site.`,
    );
  }

  if (
    typeof payload !== "object" ||
    payload === null ||
    typeof (payload as { token?: unknown }).token !== "string"
  ) {
    throw new Error("Token endpoint did not return a token.");
  }
  return (payload as { token: string }).token;
}

/** Wraps a real WebSocket in the small StreamingSocket interface. */
function openBrowserSocket(url: string): StreamingSocket {
  const socket = new WebSocket(url);
  socket.binaryType = "arraybuffer";

  const wrapper: StreamingSocket = {
    send(data) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(data);
      }
    },
    close() {
      socket.close();
    },
    onopen: null,
    onmessage: null,
    onerror: null,
    onclose: null,
  };

  socket.onopen = () => wrapper.onopen?.();
  socket.onmessage = (event: MessageEvent<string>) => wrapper.onmessage?.(event.data);
  socket.onerror = () => wrapper.onerror?.("The streaming connection failed.");
  socket.onclose = () => wrapper.onclose?.();

  return wrapper;
}

const BROWSER_DEPENDENCIES: StreamingDependencies = {
  fetchToken: fetchTokenFromBackend,
  openSocket: openBrowserSocket,
  openMicrophone,
};

// ---------------------------------------------------------------------------
// Message handling
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// The source
// ---------------------------------------------------------------------------

export function createAssemblyAISource(options: StreamingOptions = {}): StreamingSource {
  const tokenEndpoint = options.tokenEndpoint ?? DEFAULT_TOKEN_ENDPOINT;
  const getApiKey = options.getApiKey ?? (() => null);
  const formatTurns = options.formatTurns ?? true;
  const pauseParagraphMs = options.pauseParagraphMs ?? DEFAULT_PAUSE_PARAGRAPH_MS;
  const silenceStopMs = options.silenceStopMs ?? DEFAULT_SILENCE_STOP_MS;
  const startSilenceStopMs = options.startSilenceStopMs ?? DEFAULT_START_SILENCE_STOP_MS;
  const dependencies: StreamingDependencies = { ...BROWSER_DEPENDENCIES, ...options.dependencies };

  const buffer = createTranscriptBuffer({ pauseParagraphMs });
  const transcriptListeners = new Set<(transcript: string) => void>();
  const amplitudeListeners = new Set<(amplitude: number) => void>();
  const statusListeners = new Set<(status: StreamingStatus, error: string | null) => void>();

  let status: StreamingStatus = "idle";
  let error: string | null = null;
  let socket: StreamingSocket | null = null;
  let microphone: Microphone | null = null;
  let socketOpen = false;
  let pendingChunks: PcmChunk[] = [];
  let terminateTimer: ReturnType<typeof setTimeout> | null = null;
  let silenceTimer: ReturnType<typeof setTimeout> | null = null;
  let stopReason: StopReason | null = null;

  function setStatus(next: StreamingStatus, message: string | null = null): void {
    status = next;
    error = message;
    for (const listener of statusListeners) {
      listener(status, error);
    }
  }

  function emitTranscript(): void {
    const transcript = buffer.getTranscript();
    for (const listener of transcriptListeners) {
      listener(transcript);
    }
  }

  function clearSilenceWatch(): void {
    if (silenceTimer !== null) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
  }

  /**
   * (Re)starts the countdown to an automatic stop. Called when the session
   * starts listening and again on every turn that changes the transcript, so it
   * only ever fires after genuine silence.
   *
   * `beforeFirstWords` uses the longer grace period: waiting to begin is not
   * the same as trailing off.
   */
  function restartSilenceWatch(beforeFirstWords = false): void {
    clearSilenceWatch();
    if (silenceStopMs <= 0) {
      return;
    }
    const delay = beforeFirstWords ? startSilenceStopMs : silenceStopMs;
    if (delay <= 0) {
      return;
    }
    silenceTimer = setTimeout(() => {
      silenceTimer = null;
      stopReason = "silence";
      void stop();
    }, delay);
  }

  /** Tears down audio and socket. Safe to call more than once. */
  async function teardown(): Promise<void> {
    clearSilenceWatch();

    if (terminateTimer !== null) {
      clearTimeout(terminateTimer);
      terminateTimer = null;
    }

    const currentMicrophone = microphone;
    microphone = null;
    if (currentMicrophone !== null) {
      await currentMicrophone.stop();
    }

    const currentSocket = socket;
    socket = null;
    socketOpen = false;
    pendingChunks = [];
    if (currentSocket !== null) {
      currentSocket.onmessage = null;
      currentSocket.onerror = null;
      currentSocket.onclose = null;
      currentSocket.onopen = null;
      currentSocket.close();
    }
  }

  async function fail(message: string): Promise<void> {
    await teardown();
    setStatus("error", message);
  }

  /**
   * Root-mean-square loudness of a chunk, normalized to 0..1.
   *
   * RMS rather than peak because a peak meter twitches on every consonant;
   * RMS is what reads as "how loud is this person right now".
   */
  function reportAmplitude(chunk: PcmChunk): void {
    if (amplitudeListeners.size === 0 || chunk.length === 0) {
      return;
    }

    let sumOfSquares = 0;
    for (let i = 0; i < chunk.length; i++) {
      const sample = (chunk[i] ?? 0) / 32768;
      sumOfSquares += sample * sample;
    }

    const amplitude = Math.min(1, Math.sqrt(sumOfSquares / chunk.length));
    for (const listener of amplitudeListeners) {
      listener(amplitude);
    }
  }

  function sendChunk(chunk: PcmChunk): void {
    reportAmplitude(chunk);

    if (socket === null) {
      return;
    }
    if (!socketOpen) {
      // Audio recorded before the socket finished opening still belongs to the
      // transcript, but the queue is bounded so a stalled connection cannot
      // grow it without limit.
      pendingChunks.push(chunk);
      if (pendingChunks.length > MAX_PENDING_CHUNKS) {
        pendingChunks.shift();
      }
      return;
    }
    socket.send(chunk);
  }

  function handleMessage(raw: string): void {
    if (isTerminationMessage(raw)) {
      void teardown().then(() => setStatus("idle"));
      return;
    }

    const turn = readTurnEvent(raw);
    if (turn === null) {
      return;
    }
    if (buffer.accept(turn)) {
      // New words: the speaker is still going, so the silence clock resets.
      restartSilenceWatch();
      emitTranscript();
    }
  }

  async function start(): Promise<void> {
    if (status === "starting" || status === "listening") {
      return;
    }

    buffer.reset();
    stopReason = null;
    setStatus("starting");

    // The microphone comes first: it must be requested inside the click that
    // triggered this, and its real sample rate goes into the socket URL.
    try {
      microphone = await dependencies.openMicrophone({
        onChunk: (chunk) => sendChunk(chunk),
        preferredSampleRate: 16000,
      });
    } catch (openError) {
      await fail(openError instanceof Error ? openError.message : String(openError));
      return;
    }

    let token: string;
    try {
      token = await dependencies.fetchToken(tokenEndpoint, getApiKey());
    } catch (tokenError) {
      await fail(tokenError instanceof Error ? tokenError.message : String(tokenError));
      return;
    }

    const url = buildSocketUrl({ token, sampleRate: microphone.sampleRate, formatTurns });
    const connection = dependencies.openSocket(url);
    socket = connection;

    connection.onopen = () => {
      socketOpen = true;
      for (const chunk of pendingChunks) {
        connection.send(chunk);
      }
      pendingChunks = [];
      setStatus("listening");
      restartSilenceWatch(true);
    };

    connection.onmessage = (data) => handleMessage(data);

    connection.onerror = (message) => {
      void fail(message);
    };

    connection.onclose = () => {
      // A close during a session is unexpected; a close while stopping is the
      // normal end of the conversation.
      if (status === "listening" || status === "starting") {
        void fail("The streaming connection closed unexpectedly.");
        return;
      }
      void teardown().then(() => {
        if (status === "stopping") {
          setStatus("idle");
        }
      });
    };
  }

  async function stop(): Promise<void> {
    if (status === "idle" || status === "stopping") {
      return;
    }

    // restartSilenceWatch() sets "silence" just before calling this; anything
    // else reaching here is the user pressing stop.
    if (stopReason === null) {
      stopReason = "user";
    }
    clearSilenceWatch();
    setStatus("stopping");

    // Stop the audio first so no more of it is sent, then ask the server to
    // finish. It replies with a last Turn before the Termination message.
    const currentMicrophone = microphone;
    microphone = null;
    if (currentMicrophone !== null) {
      await currentMicrophone.stop();
    }

    if (socket !== null && socketOpen) {
      socket.send(JSON.stringify({ type: "Terminate" }));
      terminateTimer = setTimeout(() => {
        void teardown().then(() => setStatus("idle"));
      }, TERMINATE_TIMEOUT_MS);
      return;
    }

    await teardown();
    setStatus("idle");
  }

  return {
    getTranscript: () => buffer.getTranscript(),

    subscribe(listener) {
      transcriptListeners.add(listener);
      return () => {
        transcriptListeners.delete(listener);
      };
    },

    subscribeAmplitude(listener) {
      amplitudeListeners.add(listener);
      return () => {
        amplitudeListeners.delete(listener);
      };
    },

    subscribeStatus(listener) {
      statusListeners.add(listener);
      return () => {
        statusListeners.delete(listener);
      };
    },

    getStatus: () => status,
    getError: () => error,
    getStopReason: () => stopReason,
    getWords: () => buffer.getWords(),
    start,
    stop,
  };
}
