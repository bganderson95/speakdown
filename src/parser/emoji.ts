/**
 * emoji.ts — spoken emoji name -> glyph.
 *
 * PURITY: imports nothing. No React, no DOM, no network.
 *
 * A small hardcoded map, not a library. v1 covers the emoji people actually
 * dictate; a miss falls through to literal text so no words are ever lost.
 */

/** Spoken name (lowercase, space separated) -> glyph. */
export const EMOJI_MAP: Readonly<Record<string, string>> = {
  fire: "🔥",
  rocket: "🚀",
  "thumbs up": "👍",
  "thumbs down": "👎",
  heart: "❤️",
  check: "✅",
  "check mark": "✅",
  cross: "❌",
  x: "❌",
  star: "⭐",
  sparkles: "✨",
  eyes: "👀",
  wave: "👋",
  clap: "👏",
  "party popper": "🎉",
  tada: "🎉",
  warning: "⚠️",
  bulb: "💡",
  "light bulb": "💡",
  bug: "🐛",
  wrench: "🔧",
  hammer: "🔨",
  lock: "🔒",
  key: "🔑",
  brain: "🧠",
  coffee: "☕",
  pizza: "🍕",
  smile: "😄",
  laughing: "😂",
  wink: "😉",
  thinking: "🤔",
  cry: "😢",
  hundred: "💯",
  "hundred points": "💯",
  clock: "🕐",
  calendar: "📅",
  chart: "📈",
  "chart increasing": "📈",
  memo: "📝",
  pin: "📌",
  mag: "🔍",
  "magnifying glass": "🔍",
  robot: "🤖",
  ghost: "👻",
  snake: "🐍",
  cat: "🐱",
  dog: "🐶",
};

/** The longest emoji name in the map, in words. Bounds the lookahead. */
export const MAX_EMOJI_NAME_WORDS = 2;

/** Looks up a spoken name. Returns null on a miss. */
export function lookUpEmoji(name: string): string | null {
  const glyph = EMOJI_MAP[name.trim().toLowerCase()];
  if (glyph === undefined) {
    return null;
  }
  return glyph;
}

/**
 * True when `words` could still grow into a known emoji name.
 *
 * This is what stops a live transcript from flashing an error the instant
 * someone says "emoji": the name has not been spoken yet, so there is nothing
 * to complain about. No words means anything could follow, and "thumbs" is
 * still on its way to "thumbs up".
 */
export function isEmojiNamePrefix(words: readonly string[]): boolean {
  if (words.length === 0) {
    return true;
  }

  const prefix = words.join(" ").toLowerCase();
  for (const name of Object.keys(EMOJI_MAP)) {
    if (name.startsWith(`${prefix} `)) {
      return true;
    }
  }
  return false;
}
