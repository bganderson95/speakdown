/**
 * mapsLink.ts — spoken address -> a Google Maps search link.
 *
 * PURE: imports nothing. No network, no geocoding, no lookup of any kind.
 *
 * This only builds a valid Maps *search* URL from the words the user said. It
 * does not resolve, validate or verify the address — Google does that when the
 * link is opened. That keeps the transform deterministic: the same spoken
 * address always produces the same URL.
 */

/** The Maps search endpoint. `query` carries the address verbatim. */
const MAPS_SEARCH_URL = "https://www.google.com/maps/search/?api=1&query=";

export interface MapsLink {
  /** The address as spoken, used as the link's display text. */
  text: string;
  href: string;
}

/**
 * Builds the link, or null when there is no address to link.
 *
 * An empty address (the open phrase said immediately before the close phrase)
 * produces nothing at all rather than an empty link — there are no words to
 * lose and an empty link would be useless.
 */
export function buildMapsLink(address: string): MapsLink | null {
  const text = address.trim().replace(/\s+/g, " ");
  if (text.length === 0) {
    return null;
  }

  // encodeURIComponent escapes spaces, punctuation, "&", "#" and non-ASCII, so
  // the query cannot break out of the URL or inject extra parameters.
  return { text, href: `${MAPS_SEARCH_URL}${encodeURIComponent(text)}` };
}
