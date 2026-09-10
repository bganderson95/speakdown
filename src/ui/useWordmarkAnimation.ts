/**
 * useWordmarkAnimation.ts — the masthead writes itself the way the app works.
 *
 * The mark appears, the listening dots follow it, then the letters arrive one
 * at a time as if spoken. "Speak" lands in bold, there is a beat, and the rest
 * comes out regular — the same thing the app does when a bold scope closes.
 * The dots then move to the tagline and write that too before leaving.
 *
 * Runs once, on load. Under reduced motion it starts finished.
 */

import { useEffect, useState } from "react";

/** Everything after the mark, which supplies the S. */
export const WORDMARK_LETTERS = "peakdown";

/** Letters up to here are bold; "peak" closes the scope, "down" does not. */
export const BOLD_THROUGH = 4;

export const TAGLINE = "speech to rich text";

const DOTS_APPEAR_MS = 320;
const FIRST_LETTER_MS = 860;
const PER_LETTER_MS = 85;
/** The beat after "Speak", where the bold ends. */
const PAUSE_MS = 460;
/** Long enough to read the finished word before the dots move on. */
const BEFORE_TAGLINE_MS = 300;
const PER_TAGLINE_CHAR_MS = 28;
const DOTS_LINGER_MS = 420;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Where the writing cursor is, or null once it has gone. */
export type Cursor = "wordmark" | "tagline" | null;

export interface WordmarkAnimation {
  /** How many letters of WORDMARK_LETTERS are on screen. */
  revealed: number;
  /** How many characters of TAGLINE are on screen. */
  taglineRevealed: number;
  cursor: Cursor;
}

const FINISHED: WordmarkAnimation = {
  revealed: WORDMARK_LETTERS.length,
  taglineRevealed: TAGLINE.length,
  cursor: null,
};

export function useWordmarkAnimation(): WordmarkAnimation {
  const [state, setState] = useState<WordmarkAnimation>(() =>
    prefersReducedMotion() ? FINISHED : { revealed: 0, taglineRevealed: 0, cursor: null },
  );

  useEffect(() => {
    if (prefersReducedMotion()) {
      return;
    }

    const timers: Array<ReturnType<typeof setTimeout>> = [];
    const at = (delay: number, change: Partial<WordmarkAnimation>) => {
      timers.push(setTimeout(() => setState((current) => ({ ...current, ...change })), delay));
    };

    at(DOTS_APPEAR_MS, { cursor: "wordmark" });

    let elapsed = FIRST_LETTER_MS;
    for (let count = 1; count <= WORDMARK_LETTERS.length; count++) {
      at(elapsed, { revealed: count });
      elapsed += count === BOLD_THROUGH ? PAUSE_MS : PER_LETTER_MS;
    }

    // The cursor leaves the word and picks up the tagline.
    elapsed += BEFORE_TAGLINE_MS;
    at(elapsed, { cursor: "tagline" });

    for (let count = 1; count <= TAGLINE.length; count++) {
      elapsed += PER_TAGLINE_CHAR_MS;
      at(elapsed, { taglineRevealed: count });
    }

    at(elapsed + DOTS_LINGER_MS, { cursor: null });

    return () => {
      for (const timer of timers) {
        clearTimeout(timer);
      }
    };
  }, []);

  return state;
}
