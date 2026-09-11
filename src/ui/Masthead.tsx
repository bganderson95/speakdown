/**
 * Masthead.tsx — the mark plus "peakdown" as one continuous word, and the
 * tagline that follows it.
 *
 * The S is the logo rather than a glyph, so the whole thing carries an
 * aria-label and the drawn parts are hidden from assistive technology. The
 * tagline lives here rather than in App because the two are one movement: the
 * writing cursor finishes the word, then moves down and writes the tagline.
 */

import type { ReactNode } from "react";
import { LOGO_PATH, LOGO_VIEW_BOX } from "./logoPath.js";
import {
  BOLD_THROUGH,
  TAGLINE,
  WORDMARK_LETTERS,
  useWordmarkAnimation,
} from "./useWordmarkAnimation.js";

/** The three dots that trail whatever is being written. */
function WritingCursor() {
  return (
    <span className="wordmark-dots" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

interface MastheadProps {
  /** The key control and settings, which sit opposite the wordmark. */
  children?: ReactNode;
}

export function Masthead({ children }: MastheadProps) {
  const { revealed, taglineRevealed, cursor } = useWordmarkAnimation();

  return (
    <header className="masthead">
      <h1 className="wordmark" aria-label="Speakdown">
        <svg
          className="wordmark-mark"
          viewBox={LOGO_VIEW_BOX}
          fill="currentColor"
          aria-hidden="true"
          focusable="false"
        >
          <path d={LOGO_PATH} />
        </svg>

        <span className="wordmark-letters" aria-hidden="true">
          {WORDMARK_LETTERS.slice(0, revealed)
            .split("")
            .map((letter, index) => (
              <span
                key={`${letter}-${index}`}
                className={index < BOLD_THROUGH ? "wordmark-bold" : "wordmark-regular"}
              >
                {letter}
              </span>
            ))}
          {cursor === "wordmark" && <WritingCursor />}
        </span>
      </h1>

      <p className="tagline" aria-label={TAGLINE}>
        <span aria-hidden="true">{TAGLINE.slice(0, taglineRevealed)}</span>
        {cursor === "tagline" && <WritingCursor />}
      </p>

      <div className="masthead-aside">{children}</div>
    </header>
  );
}
