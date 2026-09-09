/**
 * textInput.ts — the v1 transcript source: plain typed or pasted text.
 *
 * The parser takes a plain string, so a "source" is just something that holds
 * the current transcript and tells listeners when it changes. v2 adds
 * input/assemblyai.ts implementing this same interface over a WebSocket; the
 * parser and the UI do not change.
 */

export interface TranscriptSource {
  /** The transcript so far. */
  getTranscript(): string;
  /** Subscribe to changes. Returns an unsubscribe function. */
  subscribe(listener: (transcript: string) => void): () => void;
}

export interface TextInputSource extends TranscriptSource {
  /** Replace the transcript (the textarea's onChange in v1). */
  setTranscript(text: string): void;
}

export function createTextInput(initial = ""): TextInputSource {
  let transcript = initial;
  const listeners = new Set<(transcript: string) => void>();

  return {
    getTranscript() {
      return transcript;
    },

    setTranscript(text: string) {
      transcript = text;
      for (const listener of listeners) {
        listener(transcript);
      }
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
