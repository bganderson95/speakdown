/**
 * dateResolve.ts — spoken date phrase -> ISO date string.
 *
 * PURE: imports nothing, and never reads the clock. The current date arrives as
 * the `now` argument, so resolveDate(phrase, now) is fully deterministic and
 * testable with a fixed date. The impurity of reading the real clock lives at
 * the call site, exactly as clipboard reads live outside the parser.
 *
 * WHY NO DATE LIBRARY: the arithmetic here is "add N days" and "find the next
 * weekday", which is a handful of lines against the built-in Date. A dependency
 * would be more code to read, not less.
 *
 * TIME ZONES: everything works in the local calendar fields of `now`
 * (getFullYear/getMonth/getDate) and formats straight from those. toISOString()
 * is deliberately avoided — it converts to UTC and would report the wrong day
 * for anyone west of Greenwich in the evening.
 */

export type DateResult =
  | { ok: true; iso: string }
  | { ok: false; reason: string };

const WEEKDAYS: Readonly<Record<string, number>> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
};

const MONTHS: Readonly<Record<string, number>> = {
  january: 0, jan: 0,
  february: 1, feb: 1,
  march: 2, mar: 2,
  april: 3, apr: 3,
  may: 4,
  june: 5, jun: 5,
  july: 6, jul: 6,
  august: 7, aug: 7,
  september: 8, sept: 8, sep: 8,
  october: 9, oct: 9,
  november: 10, nov: 10,
  december: 11, dec: 11,
};

/** Ordinal day words, written out so the table is scannable at a glance. */
const ORDINAL_DAYS: Readonly<Record<string, number>> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
  sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
  eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15,
  sixteenth: 16, seventeenth: 17, eighteenth: 18, nineteenth: 19, twentieth: 20,
  "twenty first": 21, "twenty second": 22, "twenty third": 23,
  "twenty fourth": 24, "twenty fifth": 25, "twenty sixth": 26,
  "twenty seventh": 27, "twenty eighth": 28, "twenty ninth": 29,
  thirtieth: 30, "thirty first": 31,
};

// ---------------------------------------------------------------------------
// Date helpers — all in local calendar fields
// ---------------------------------------------------------------------------

/** Midnight local time on the same calendar day as `date`. */
function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** `days` later. The Date constructor rolls month and year over for us. */
function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function toIsoDate(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * The next occurrence of `weekday` strictly after `from`.
 *
 * "next friday" spoken on a Friday means the Friday a week away, not today.
 */
function nextWeekday(from: Date, weekday: number): Date {
  let offset = (weekday - from.getDay() + 7) % 7;
  if (offset === 0) {
    offset = 7;
  }
  return addDays(from, offset);
}

/** The most recent occurrence of `weekday` strictly before `from`. */
function lastWeekday(from: Date, weekday: number): Date {
  let offset = (from.getDay() - weekday + 7) % 7;
  if (offset === 0) {
    offset = 7;
  }
  return addDays(from, -offset);
}

// ---------------------------------------------------------------------------
// Day and year readers
// ---------------------------------------------------------------------------

/** Reads "3", "3rd", "10th" — a plain or suffixed day number. */
function readDayNumeral(word: string): number | null {
  const match = /^(\d{1,2})(st|nd|rd|th)?$/.exec(word);
  if (match === null) {
    return null;
  }
  const day = Number(match[1]);
  return day >= 1 && day <= 31 ? day : null;
}

interface DayReading {
  day: number;
  wordCount: number;
}

/** Reads a day, as a numeral or as ordinal words ("tenth", "twenty first"). */
function readDay(words: readonly string[], start: number): DayReading | null {
  const first = words[start];
  if (first === undefined) {
    return null;
  }

  const numeral = readDayNumeral(first);
  if (numeral !== null) {
    return { day: numeral, wordCount: 1 };
  }

  // Two-word ordinals first, so "twenty first" never reads as "twenty".
  const second = words[start + 1];
  if (second !== undefined) {
    const compound = ORDINAL_DAYS[`${first} ${second}`];
    if (compound !== undefined) {
      return { day: compound, wordCount: 2 };
    }
  }

  const single = ORDINAL_DAYS[first];
  if (single !== undefined) {
    return { day: single, wordCount: 1 };
  }

  return null;
}

/** Reads a four-digit year. */
function readYear(word: string | undefined): number | null {
  if (word === undefined || !/^\d{4}$/.test(word)) {
    return null;
  }
  return Number(word);
}

/**
 * Builds a calendar date, rejecting days that do not exist in that month.
 *
 * The Date constructor silently rolls 30 February over to 2 March; comparing
 * the month back catches that instead of returning a date nobody said.
 */
function buildCalendarDate(year: number, month: number, day: number): Date | null {
  const date = new Date(year, month, day);
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) {
    return null;
  }
  return date;
}

// ---------------------------------------------------------------------------

/**
 * Resolves a spoken date phrase against the injected `now`.
 *
 * Recognized shapes:
 *   today | tomorrow | yesterday
 *   next <weekday> | last <weekday>
 *   <month> <day> [<year>]        e.g. "september tenth", "march 3 2027"
 *
 * A phrase with no year uses the year of `now` — plainly, with no guessing at
 * whether the speaker meant the next occurrence.
 *
 * Never throws: an unrecognized phrase comes back as { ok: false }.
 */
export function resolveDate(phrase: string, now: Date): DateResult {
  const words: string[] = [];
  for (const chunk of phrase.trim().toLowerCase().split(/[\s-]+/)) {
    const word = chunk.replace(/[^\p{L}\p{N}]+$/u, "");
    if (word.length > 0) {
      words.push(word);
    }
  }

  if (words.length === 0) {
    return { ok: false, reason: "there was no date to resolve" };
  }

  const today = startOfDay(now);
  const first = words[0];

  // 1. The three relative days.
  if (words.length === 1) {
    switch (first) {
      case "today":
        return { ok: true, iso: toIsoDate(today) };
      case "tomorrow":
        return { ok: true, iso: toIsoDate(addDays(today, 1)) };
      case "yesterday":
        return { ok: true, iso: toIsoDate(addDays(today, -1)) };
      default:
        break;
    }
  }

  // 2. next / last <weekday>.
  if (words.length === 2 && (first === "next" || first === "last")) {
    const second = words[1];
    const weekday = second === undefined ? undefined : WEEKDAYS[second];
    if (weekday !== undefined) {
      const resolved = first === "next" ? nextWeekday(today, weekday) : lastWeekday(today, weekday);
      return { ok: true, iso: toIsoDate(resolved) };
    }
    return { ok: false, reason: `"${words.join(" ")}" is not a weekday` };
  }

  // 3. <month> <day> [<year>].
  const month = first === undefined ? undefined : MONTHS[first];
  if (month !== undefined) {
    const dayReading = readDay(words, 1);
    if (dayReading === null) {
      return { ok: false, reason: "that month was not followed by a day" };
    }

    const yearWord = words[1 + dayReading.wordCount];
    const year = readYear(yearWord) ?? now.getFullYear();

    // Anything after the date is not part of it.
    const expectedLength = 1 + dayReading.wordCount + (readYear(yearWord) === null ? 0 : 1);
    if (words.length !== expectedLength) {
      return { ok: false, reason: "there were extra words after the date" };
    }

    const resolved = buildCalendarDate(year, month, dayReading.day);
    if (resolved === null) {
      return { ok: false, reason: "that day does not exist in that month" };
    }
    return { ok: true, iso: toIsoDate(resolved) };
  }

  return { ok: false, reason: `"${phrase.trim()}" is not a date I recognize` };
}
