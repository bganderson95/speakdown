/**
 * normalizeSpokenUrl.ts — spoken URL words -> a URL string.
 *
 * PURITY: imports nothing. No React, no DOM, no network.
 *
 * "example dot com slash q3" -> "https://example.com/q3"
 *
 * The rules are deliberately a small, explicit table. Anything not in the table
 * is kept as a literal chunk of the URL.
 *
 * CASING: the result is lowercased. Casing coming out of a speech recognizer is
 * arbitrary ("Example Dot Com"), so preserving it would make the same spoken
 * URL produce different links on different runs.
 */

/** Punctuation stripped from the edges of each spoken word. */
const EDGE_PUNCTUATION = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

/**
 * Symbol words. Returns the symbol, or null when the word is a literal part of
 * the URL.
 */
function symbolFor(word: string): string | null {
  switch (word) {
    case "dot":
    case "period":
      return ".";
    case "slash":
      return "/";
    case "dash":
    case "hyphen":
    case "minus":
      return "-";
    case "underscore":
      return "_";
    case "colon":
      return ":";
    default:
      return null;
  }
}

/** True when the string already starts with an http(s) scheme. */
function hasScheme(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

/**
 * Converts spoken words into a URL.
 *
 * Words are concatenated with no separator, because spoken URLs have no
 * spaces: "my site dot com" is "mysite.com".
 */
export function normalizeSpokenUrl(spoken: string): string {
  const words: string[] = [];
  for (const chunk of spoken.trim().toLowerCase().split(/\s+/)) {
    const word = chunk.replace(EDGE_PUNCTUATION, "");
    if (word.length > 0) {
      words.push(word);
    }
  }

  if (words.length === 0) {
    return "";
  }

  let url = "";
  let index = 0;

  // A leading "http"/"https" is the scheme. Speakers may or may not spell out
  // the "colon slash slash", so consume it if it is there and supply it if not.
  const first = words[0];
  if (first === "http" || first === "https") {
    url = `${first}://`;
    index = 1;
    if (words[index] === "colon") {
      index++;
    }
    while (words[index] === "slash") {
      index++;
    }
  }

  for (; index < words.length; index++) {
    const word = words[index];
    if (word === undefined) {
      continue;
    }

    // "forward slash" is one symbol spoken as two words; the "slash" that
    // follows supplies the "/".
    if (word === "forward" && words[index + 1] === "slash") {
      continue;
    }

    const symbol = symbolFor(word);
    if (symbol === null) {
      url += word;
    } else {
      url += symbol;
    }
  }

  // Nothing but a scheme is not a URL.
  if (url.length === 0 || url === "http://" || url === "https://") {
    return "";
  }

  if (!hasScheme(url)) {
    url = `https://${url}`;
  }

  return url;
}
