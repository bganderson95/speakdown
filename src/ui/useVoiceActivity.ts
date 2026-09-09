/**
 * useVoiceActivity.ts — "is someone talking right now", as opposed to "is the
 * microphone on".
 *
 * Recording status alone is too coarse for a typing indicator: it stays true
 * through long silences, so an indicator driven by it would claim the app is
 * hearing something when it is not. This watches the actual loudness instead.
 *
 * The hold is what makes it usable. Speech is full of short gaps — between
 * words, and inside words like "sixty-six" — and an indicator that dropped out
 * on every one of them would strobe. So loudness switches it on immediately and
 * only silence lasting longer than the hold switches it off.
 */

import { useEffect, useRef, useState } from "react";

/**
 * RMS loudness above which we call it speech.
 *
 * The microphone runs with noise suppression on, so a quiet room sits near
 * zero; ordinary speech sits an order of magnitude above this.
 */
export const SPEECH_THRESHOLD = 0.015;

/** Silence must last this long before we say the talking stopped. */
export const SILENCE_HOLD_MS = 600;

export function isAboveSpeechThreshold(amplitude: number): boolean {
  return amplitude >= SPEECH_THRESHOLD;
}

export function useVoiceActivity(amplitude: number, listening: boolean): boolean {
  const [voiced, setVoiced] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!listening) {
      setVoiced(false);
      return;
    }
    if (!isAboveSpeechThreshold(amplitude)) {
      return;
    }

    setVoiced(true);
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setVoiced(false);
    }, SILENCE_HOLD_MS);
  }, [amplitude, listening]);

  // Never leave a timer running behind an unmounted component.
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return voiced;
}
