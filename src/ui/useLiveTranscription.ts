/**
 * useLiveTranscription.ts — React binding for the AssemblyAI source.
 *
 * The source itself is plain TypeScript with no React in it; this hook only
 * mirrors its status into component state and keeps one source alive for the
 * lifetime of the component.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { StopReason, StreamingSource, StreamingStatus } from "../input/assemblyai.js";
import { createAssemblyAISource } from "../input/assemblyai.js";

export interface LiveTranscription {
  status: StreamingStatus;
  error: string | null;
  /** How the last session ended, so the UI can explain an automatic stop. */
  stopReason: StopReason | null;
  /** Latest microphone loudness, 0..1, for the voice line. */
  amplitude: number;
  /** True while audio is being captured or the session is winding down. */
  isActive: boolean;
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

export function useLiveTranscription(
  onTranscript: (transcript: string) => void,
  getApiKey: () => string | null,
): LiveTranscription {
  const sourceRef = useRef<StreamingSource | null>(null);
  const [status, setStatus] = useState<StreamingStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [stopReason, setStopReason] = useState<StopReason | null>(null);
  const [amplitude, setAmplitude] = useState(0);

  // Always call the newest callback, so the hook never publishes into a stale
  // closure over the transcript state.
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  const getApiKeyRef = useRef(getApiKey);
  getApiKeyRef.current = getApiKey;

  if (sourceRef.current === null) {
    sourceRef.current = createAssemblyAISource({
      getApiKey: () => getApiKeyRef.current(),
    });
  }
  const source = sourceRef.current;

  useEffect(() => {
    const unsubscribeTranscript = source.subscribe((transcript) => {
      onTranscriptRef.current(transcript);
    });
    const unsubscribeStatus = source.subscribeStatus((nextStatus, nextError) => {
      setStatus(nextStatus);
      setError(nextError);
      setStopReason(source.getStopReason());
    });

    const unsubscribeAmplitude = source.subscribeAmplitude(setAmplitude);

    return () => {
      unsubscribeTranscript();
      unsubscribeStatus();
      unsubscribeAmplitude();
      // Never leave the microphone open behind a closed page.
      void source.stop();
    };
  }, [source]);

  const start = useCallback(() => source.start(), [source]);
  const stop = useCallback(() => source.stop(), [source]);

  return {
    status,
    error,
    stopReason,
    amplitude,
    isActive: status === "starting" || status === "listening" || status === "stopping",
    start,
    stop,
  };
}
