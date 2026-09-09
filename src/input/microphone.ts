/**
 * microphone.ts — microphone -> 16-bit little-endian PCM chunks.
 *
 * Browser-only. This is the impure edge of the app; nothing in model/ or
 * parser/ knows it exists.
 *
 * AssemblyAI accepts any sample rate from 8000 to 96000 Hz, so instead of
 * resampling we ask the browser for a 16 kHz AudioContext and then report
 * whatever rate it actually gave us. Chrome and Firefox honour the request;
 * Safari sometimes returns its hardware rate, and telling AssemblyAI the true
 * rate is both correct and far less code than a resampler.
 */

/** Samples per posted chunk, at 16 kHz. Roughly 50 ms of audio. */
const CHUNK_MS = 50;

/**
 * The AudioWorklet that converts float samples to PCM16 and batches them.
 *
 * It is loaded from a Blob URL so the worklet ships inside this module rather
 * than as a separate asset the build has to know about.
 */
const PCM_WORKLET_SOURCE = `
class SpeakdownPcmProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.chunkSamples = options.processorOptions.chunkSamples;
    this.buffer = new Int16Array(this.chunkSamples);
    this.filled = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) {
      return true;
    }
    const channel = input[0];
    if (!channel) {
      return true;
    }

    for (let i = 0; i < channel.length; i++) {
      let sample = channel[i];
      if (sample > 1) {
        sample = 1;
      } else if (sample < -1) {
        sample = -1;
      }
      this.buffer[this.filled] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      this.filled++;

      if (this.filled === this.chunkSamples) {
        const chunk = this.buffer.slice(0);
        this.port.postMessage(chunk, [chunk.buffer]);
        this.filled = 0;
      }
    }

    return true;
  }
}

registerProcessor("speakdown-pcm", SpeakdownPcmProcessor);
`;

/**
 * One chunk of mono 16-bit little-endian PCM audio.
 *
 * Pinned to a plain ArrayBuffer (not SharedArrayBuffer) because these bytes go
 * straight to WebSocket.send.
 */
export type PcmChunk = Int16Array<ArrayBuffer>;

export interface Microphone {
  /** The rate the audio is actually captured at. Send this to AssemblyAI. */
  sampleRate: number;
  /** Releases the microphone and tears down the audio graph. */
  stop: () => Promise<void>;
}

export interface MicrophoneOptions {
  /** Called with each PCM16 chunk, roughly every 50 ms. */
  onChunk: (pcm: PcmChunk) => void;
  /** Preferred capture rate. The browser may ignore it; check `sampleRate`. */
  preferredSampleRate?: number;
}

/** Why the microphone could not be opened, in words a user can act on. */
export class MicrophoneError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MicrophoneError";
  }
}

/** True when the browser can capture audio at all (needs HTTPS or localhost). */
function isMicrophoneAvailable(): boolean {
  return (
    typeof navigator !== "undefined" &&
    navigator.mediaDevices !== undefined &&
    typeof navigator.mediaDevices.getUserMedia === "function" &&
    typeof AudioWorkletNode === "function"
  );
}

/** Opens an AudioContext, preferring the requested rate but accepting any. */
function createAudioContext(preferredSampleRate: number): AudioContext {
  try {
    return new AudioContext({ sampleRate: preferredSampleRate });
  } catch {
    // Safari can refuse a rate its hardware does not support.
    return new AudioContext();
  }
}

export async function openMicrophone(options: MicrophoneOptions): Promise<Microphone> {
  if (!isMicrophoneAvailable()) {
    throw new MicrophoneError(
      "Microphone capture needs a secure context. Open the app over https or on localhost.",
    );
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
  } catch (error) {
    throw new MicrophoneError(
      `Microphone access was refused. ${error instanceof Error ? error.message : ""}`.trim(),
    );
  }

  const context = createAudioContext(options.preferredSampleRate ?? 16000);
  const workletUrl = URL.createObjectURL(
    new Blob([PCM_WORKLET_SOURCE], { type: "application/javascript" }),
  );

  try {
    await context.audioWorklet.addModule(workletUrl);
  } finally {
    URL.revokeObjectURL(workletUrl);
  }

  const chunkSamples = Math.round((context.sampleRate * CHUNK_MS) / 1000);
  const source = context.createMediaStreamSource(stream);
  const processor = new AudioWorkletNode(context, "speakdown-pcm", {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    processorOptions: { chunkSamples },
  });

  processor.port.onmessage = (event: MessageEvent<PcmChunk>) => {
    options.onChunk(event.data);
  };

  // The worklet writes no output, but the graph still has to reach the
  // destination for it to be pulled. A muted gain node guarantees silence.
  const mute = context.createGain();
  mute.gain.value = 0;

  source.connect(processor);
  processor.connect(mute);
  mute.connect(context.destination);

  // Autoplay policies can start a context suspended even after a click.
  if (context.state === "suspended") {
    await context.resume();
  }

  return {
    sampleRate: context.sampleRate,
    async stop() {
      processor.port.onmessage = null;
      source.disconnect();
      processor.disconnect();
      mute.disconnect();
      for (const track of stream.getTracks()) {
        track.stop();
      }
      await context.close();
    },
  };
}
