/**
 * Masthead.tsx — the mark plus "peakdown" as one continuous word, and the
 * tagline that follows it.
 *
 * The S is the logo rather than a glyph, so the whole thing carries an
 * aria-label and the drawn parts are hidden from assistive technology.
 *
 * The tagline lives here rather than in App because the two are one movement:
 * it waits for the word to finish writing itself, since letters arriving would
 * otherwise shove it sideways a step at a time.
 */

import { LOGO_PATH, LOGO_VIEW_BOX } from "./logoPath.js";
import { BOLD_THROUGH, WORDMARK_LETTERS, useWordmarkAnimation } from "./useWordmarkAnimation.js";

export function Masthead() {
  const { revealed, listening, finished } = useWordmarkAnimation();

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
          {WORDMARK_LETTERS.split("").map((letter, index) =>
            index < revealed ? (
              <span
                key={`${letter}-${index}`}
                className={index < BOLD_THROUGH ? "wordmark-bold" : "wordmark-regular"}
              >
                {letter}
              </span>
            ) : null,
          )}

          {listening && (
            <span className="wordmark-dots">
              <i />
              <i />
              <i />
            </span>
          )}
        </span>
      </h1>

      <p className={finished ? "tagline tagline-in" : "tagline"}>speech to rich text</p>
    </header>
  );
}
