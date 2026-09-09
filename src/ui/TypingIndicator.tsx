/**
 * TypingIndicator.tsx — three dots at the end of the document while someone is
 * talking, the way a messaging app shows the other person typing.
 *
 * This is the answer to "is it hearing me?". The voice line beside the button
 * says the microphone is open; this says words are on their way into the page.
 *
 * Under reduced motion the dots stop moving but stay visible, so the state is
 * still legible without the animation carrying it.
 */

import { useEffect, useRef } from "react";


interface TypingIndicatorProps {
  /**
   * The document's current content. Only used as a change signal: the
   * indicator follows the text when the text grows, and ignores the twenty
   * loudness updates a second that arrive in between.
   */
  follow: string;
}

export function TypingIndicator({ follow }: TypingIndicatorProps) {
  const ref = useRef<HTMLParagraphElement | null>(null);

  // Words land at the end of the document, so on a long page the indicator —
  // and the text arriving next to it — would sit below the fold. `nearest`
  // scrolls by the minimum needed and does nothing when it is already visible,
  // so this follows the dictation without hijacking a page the user is reading.
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "nearest" });
  }, [follow]);

  return (
    <p ref={ref} className="typing" aria-live="polite" aria-label="Listening for speech">
      <span className="typing-dot" />
      <span className="typing-dot" />
      <span className="typing-dot" />
    </p>
  );
}
