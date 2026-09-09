/**
 * useResolution.ts — the micro-moment when a spoken command becomes formatting.
 *
 * Speakdown's magic is the instant "bold" turns text bold, or a math expression
 * collapses to its answer. This marks the element that just resolved so CSS can
 * animate that one element, rather than flashing the whole page every time a
 * character is typed.
 *
 * HOW IT DECIDES SOMETHING RESOLVED: it compares the *shape* of the HTML — the
 * sequence of tag names — with the previous render. Typing ordinary words does
 * not change the shape; a command resolving always does.
 *
 * WHICH ELEMENT IT MARKS: the last formatted element in the document. Speech
 * runs forwards, so the thing that just resolved is almost always the most
 * recent one. This is a heuristic, and it is only decoration — if it ever picks
 * the wrong element, a 160 ms fade is all that happens.
 */

import { useEffect, useRef } from "react";

/** Elements worth animating: the ones a command produces. */
const RESOLVABLE = "strong, em, del, code, a, h1, h2, h3, h4, h5, h6, li, blockquote, hr, pre";

const RESOLVED_CLASS = "just-resolved";

/** The sequence of tag names, which changes only when formatting changes. */
function shapeOf(html: string): string {
  return (html.match(/<[a-z][a-z0-9]*/g) ?? []).join("");
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Watches a container whose innerHTML is set from `html`, and flags the newly
 * resolved element. Returns the ref to attach to that container.
 */
export function useResolution(html: string) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const previousShapeRef = useRef<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const shape = shapeOf(html);
    const previousShape = previousShapeRef.current;
    previousShapeRef.current = shape;

    // Nothing to celebrate on first paint, or when only the words changed.
    if (container === null || previousShape === null || previousShape === shape) {
      return;
    }
    if (prefersReducedMotion()) {
      return;
    }

    const resolved = [...container.querySelectorAll(RESOLVABLE)].pop();
    if (resolved === undefined) {
      return;
    }

    // Restart the animation even if this element was flagged a moment ago.
    resolved.classList.remove(RESOLVED_CLASS);
    void (resolved as HTMLElement).offsetWidth;
    resolved.classList.add(RESOLVED_CLASS);
  }, [html]);

  return containerRef;
}
