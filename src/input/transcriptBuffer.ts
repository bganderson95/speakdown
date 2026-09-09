/**
 * transcriptBuffer.ts — AssemblyAI Turn events -> one plain transcript string.
 *
 * PURE: no browser APIs, no network. This is the piece that makes live speech
 * look exactly like the textarea to everything downstream.
 *
 * Universal-Streaming sends turn-based transcripts. A turn arrives many times:
 * partial updates while the speaker is talking (end_of_turn false), then a
 * final one, then — with format_turns on — a punctuated rewrite of the same
 * turn. Every message carries the same `turn_order`, so the buffer keys on it
 * and the latest message for a turn replaces the previous one.
 *
 * PAUSES BECOME PARAGRAPHS. When the silence between two turns is long enough,
 * the buffer splices the spoken words "new paragraph" between them, and the
 * parser then handles it as the ordinary command it already understands. That
 * keeps every bit of this out of the parser, and it leaves the break visible
 * and editable in the transcript box rather than hidden in some side channel.
 *
 * The gap is measured on AssemblyAI's audio timeline — the end of the last word
 * of one turn to the start of the first word of the next — not on the wall
 * clock. Network jitter therefore cannot invent or swallow a paragraph break,
 * and the same turns always produce the same transcript.
 */

import { PHRASE_NEW_PARAGRAPH } from "../parser/commands.js";

/** One word from a Turn event. Timings are milliseconds. */
export interface TurnWord {
  text: string;
  start: number;
  end: number;
  confidence: number;
  word_is_final: boolean;
}

/** The Turn message, narrowed to the fields Speakdown uses. */
export interface TurnEvent {
  turn_order: number;
  transcript: string;
  end_of_turn: boolean;
  turn_is_formatted: boolean;
  words?: TurnWord[];
}

interface BufferedTurn {
  transcript: string;
  endOfTurn: boolean;
  formatted: boolean;
  /**
   * v2 prosody seam: word timings are kept here even though v1 does not use
   * them. A prosody pass would read these alongside the parsed document to add
   * marks to runs.
   */
  words: TurnWord[];
}

/** How long a silence has to be, by default, to become a paragraph break. */
export const DEFAULT_PAUSE_PARAGRAPH_MS = 2000;

export interface TranscriptBufferOptions {
  /**
   * Silence between turns, in milliseconds, that becomes a paragraph break.
   * Zero or negative disables the behaviour entirely.
   */
  pauseParagraphMs?: number;
}

export interface TranscriptBuffer {
  /** Folds one Turn event in. Returns true when the transcript changed. */
  accept(turn: TurnEvent): boolean;
  /** The transcript so far, as a plain string the parser can consume. */
  getTranscript(): string;
  /** Every word received so far, in turn order. For the v2 prosody pass. */
  getWords(): TurnWord[];
  /** Forgets everything. */
  reset(): void;
}

/** When the first word of a turn was spoken, or null if it carries no timings. */
function firstWordStart(turn: BufferedTurn): number | null {
  const word = turn.words[0];
  return word === undefined ? null : word.start;
}

/** When the last word of a turn finished, or null if it carries no timings. */
function lastWordEnd(turn: BufferedTurn): number | null {
  const word = turn.words[turn.words.length - 1];
  return word === undefined ? null : word.end;
}

export function createTranscriptBuffer(options: TranscriptBufferOptions = {}): TranscriptBuffer {
  const pauseParagraphMs = options.pauseParagraphMs ?? DEFAULT_PAUSE_PARAGRAPH_MS;
  const paragraphPhrase = PHRASE_NEW_PARAGRAPH.join(" ");

  /** turn_order -> the latest state of that turn. */
  let turns = new Map<number, BufferedTurn>();

  function orderedTurns(): BufferedTurn[] {
    const orders = [...turns.keys()].sort((a, b) => a - b);
    const ordered: BufferedTurn[] = [];
    for (const order of orders) {
      const turn = turns.get(order);
      if (turn !== undefined) {
        ordered.push(turn);
      }
    }
    return ordered;
  }

  /**
   * True when the silence before `turn` was long enough to be a paragraph
   * break. Turns with no word timings never trigger one — a missing timestamp
   * is not evidence of silence.
   */
  function pausedBefore(previous: BufferedTurn, turn: BufferedTurn): boolean {
    if (pauseParagraphMs <= 0) {
      return false;
    }
    const previousEnd = lastWordEnd(previous);
    const start = firstWordStart(turn);
    if (previousEnd === null || start === null) {
      return false;
    }
    return start - previousEnd >= pauseParagraphMs;
  }

  function buildTranscript(): string {
    const parts: string[] = [];
    let previous: BufferedTurn | null = null;

    for (const turn of orderedTurns()) {
      const text = turn.transcript.trim();
      if (text.length === 0) {
        continue;
      }
      if (previous !== null && pausedBefore(previous, turn)) {
        parts.push(paragraphPhrase);
      }
      parts.push(text);
      previous = turn;
    }

    return parts.join(" ");
  }

  return {
    accept(turn: TurnEvent): boolean {
      const existing = turns.get(turn.turn_order);

      // A formatted turn is the final word on that turn. Never let a stray
      // unformatted message arriving afterwards undo the punctuation.
      if (existing !== undefined && existing.formatted && !turn.turn_is_formatted) {
        return false;
      }

      const before = buildTranscript();
      const words = turn.words ?? [];
      turns.set(turn.turn_order, {
        transcript: turn.transcript,
        endOfTurn: turn.end_of_turn,
        formatted: turn.turn_is_formatted,
        // A formatted rewrite may arrive without timings; keep the ones we had,
        // or the pause before the next turn becomes unmeasurable.
        words: words.length > 0 ? words : (existing?.words ?? []),
      });
      return buildTranscript() !== before;
    },

    getTranscript(): string {
      return buildTranscript();
    },

    getWords(): TurnWord[] {
      const words: TurnWord[] = [];
      for (const turn of orderedTurns()) {
        words.push(...turn.words);
      }
      return words;
    },

    reset(): void {
      turns = new Map();
    },
  };
}
