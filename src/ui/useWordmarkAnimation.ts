/**
 * useWordmarkAnimation.ts — the wordmark writes itself the way the app works.
 *
 * The mark appears, the listening dots follow it, then the letters arrive one
 * at a time as if spoken. "Speak" lands in bold, there is a beat, and the rest
 * comes out regular — the same thing the app does when a bold scope closes.
 *
 * Runs once, on load. Under reduced motion it starts finished.
 */

import { useEffect, useState } from "react";

/** Everything after the mark, which supplies the S. */
export const WORDMARK_LETTERS = "peakdown";

/** Letters up to here are bold; "peak" closes the scope, "down" does not. */
export const BOLD_THROUGH = 4;

const DOTS_APPEAR_MS = 320;
const FIRST_LETTER_MS = 860;
const PER_LETTER_MS = 85;
/** The beat after "Speak", where the bold ends. */
const PAUSE_MS = 460;
const DOTS_LINGER_MS = 420;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export interface WordmarkAnimation {
  /** How many letters of WORDMARK_LETTERS are on screen. */
  revealed: number;
  /** True while the dots trail the text. */
  listening: boolean;
  /** True once the word is written and the dots have gone. */
  finished: boolean;
}

export function useWordmarkAnimation(): WordmarkAnimation {
  const [revealed, setRevealed] = useState(() =>
    prefersReducedMotion() ? WORDMARK_LETTERS.length : 0,
  );
  const [listening, setListening] = useState(false);
  const [finished, setFinished] = useState(() => prefersReducedMotion());

  useEffect(() => {
    if (prefersReducedMotion()) {
      return;
    }

    const timers: Array<ReturnType<typeof setTimeout>> = [];
    const at = (delay: number, run: () => void) => {
      timers.push(setTimeout(run, delay));
    };

    at(DOTS_APPEAR_MS, () => setListening(true));

    let elapsed = FIRST_LETTER_MS;
    for (let count = 1; count <= WORDMARK_LETTERS.length; count++) {
      at(elapsed, () => setRevealed(count));
      elapsed += count === BOLD_THROUGH ? PAUSE_MS : PER_LETTER_MS;
    }

    at(elapsed + DOTS_LINGER_MS, () => {
      setListening(false);
      setFinished(true);
    });

    return () => {
      for (const timer of timers) {
        clearTimeout(timer);
      }
    };
  }, []);

  return { revealed, listening, finished };
}
