import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../model/renderMarkdown.js";
import { parse } from "../parser/parse.js";
import type { TurnEvent, TurnWord } from "./transcriptBuffer.js";
import { createTranscriptBuffer } from "./transcriptBuffer.js";

function turn(partial: Partial<TurnEvent> & Pick<TurnEvent, "turn_order" | "transcript">): TurnEvent {
  return {
    end_of_turn: false,
    turn_is_formatted: false,
    ...partial,
  };
}

describe("createTranscriptBuffer", () => {
  it("starts empty", () => {
    expect(createTranscriptBuffer().getTranscript()).toBe("");
  });

  it("replaces a turn as its partials grow", () => {
    const buffer = createTranscriptBuffer();
    buffer.accept(turn({ turn_order: 0, transcript: "make it" }));
    buffer.accept(turn({ turn_order: 0, transcript: "make it bold" }));
    buffer.accept(turn({ turn_order: 0, transcript: "make it bold hello" }));

    expect(buffer.getTranscript()).toBe("make it bold hello");
  });

  it("joins consecutive turns with a space", () => {
    const buffer = createTranscriptBuffer();
    buffer.accept(turn({ turn_order: 0, transcript: "first turn", end_of_turn: true }));
    buffer.accept(turn({ turn_order: 1, transcript: "second turn" }));

    expect(buffer.getTranscript()).toBe("first turn second turn");
  });

  it("orders turns by turn_order, not arrival order", () => {
    const buffer = createTranscriptBuffer();
    buffer.accept(turn({ turn_order: 1, transcript: "second" }));
    buffer.accept(turn({ turn_order: 0, transcript: "first" }));

    expect(buffer.getTranscript()).toBe("first second");
  });

  it("takes the formatted rewrite of a finished turn", () => {
    const buffer = createTranscriptBuffer();
    buffer.accept(turn({ turn_order: 0, transcript: "hello there", end_of_turn: true }));
    buffer.accept(
      turn({ turn_order: 0, transcript: "Hello there.", end_of_turn: true, turn_is_formatted: true }),
    );

    expect(buffer.getTranscript()).toBe("Hello there.");
  });

  it("does not let a late unformatted message undo the formatted one", () => {
    const buffer = createTranscriptBuffer();
    buffer.accept(
      turn({ turn_order: 0, transcript: "Hello there.", end_of_turn: true, turn_is_formatted: true }),
    );
    const changed = buffer.accept(turn({ turn_order: 0, transcript: "hello there" }));

    expect(changed).toBe(false);
    expect(buffer.getTranscript()).toBe("Hello there.");
  });

  it("reports whether the transcript actually changed", () => {
    const buffer = createTranscriptBuffer();
    expect(buffer.accept(turn({ turn_order: 0, transcript: "hello" }))).toBe(true);
    expect(buffer.accept(turn({ turn_order: 0, transcript: "hello" }))).toBe(false);
    expect(buffer.accept(turn({ turn_order: 0, transcript: "hello there" }))).toBe(true);
  });

  it("skips empty turns rather than emitting stray spaces", () => {
    const buffer = createTranscriptBuffer();
    buffer.accept(turn({ turn_order: 0, transcript: "hello", end_of_turn: true }));
    buffer.accept(turn({ turn_order: 1, transcript: "" }));

    expect(buffer.getTranscript()).toBe("hello");
  });

  it("keeps word timings in turn order for the prosody pass", () => {
    const buffer = createTranscriptBuffer();
    buffer.accept(
      turn({
        turn_order: 1,
        transcript: "two",
        words: [{ text: "two", start: 900, end: 1200, confidence: 0.9, word_is_final: true }],
      }),
    );
    buffer.accept(
      turn({
        turn_order: 0,
        transcript: "one",
        words: [{ text: "one", start: 100, end: 400, confidence: 0.99, word_is_final: true }],
      }),
    );

    expect(buffer.getWords().map((word) => word.text)).toEqual(["one", "two"]);
    expect(buffer.getWords()[0]?.start).toBe(100);
  });

  it("forgets everything on reset", () => {
    const buffer = createTranscriptBuffer();
    buffer.accept(turn({ turn_order: 0, transcript: "hello" }));
    buffer.reset();

    expect(buffer.getTranscript()).toBe("");
    expect(buffer.getWords()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Pauses become paragraphs
// ---------------------------------------------------------------------------

/** A turn whose words span [startMs, endMs] on the audio timeline. */
function timedTurn(order: number, transcript: string, startMs: number, endMs: number): TurnEvent {
  const words: TurnWord[] = [
    { text: transcript, start: startMs, end: endMs, confidence: 0.9, word_is_final: true },
  ];
  return {
    turn_order: order,
    transcript,
    end_of_turn: true,
    turn_is_formatted: false,
    words,
  };
}

describe("pauses become paragraphs", () => {
  it("splices in 'new paragraph' after a long enough silence", () => {
    const buffer = createTranscriptBuffer({ pauseParagraphMs: 2000 });
    buffer.accept(timedTurn(0, "first thought", 0, 1000));
    // 2.5s of silence before the next turn starts.
    buffer.accept(timedTurn(1, "second thought", 3500, 4500));

    expect(buffer.getTranscript()).toBe("first thought new paragraph second thought");
  });

  it("leaves a short gap alone", () => {
    const buffer = createTranscriptBuffer({ pauseParagraphMs: 2000 });
    buffer.accept(timedTurn(0, "first thought", 0, 1000));
    buffer.accept(timedTurn(1, "second thought", 1500, 2500));

    expect(buffer.getTranscript()).toBe("first thought second thought");
  });

  it("treats a gap exactly at the threshold as a pause", () => {
    const buffer = createTranscriptBuffer({ pauseParagraphMs: 2000 });
    buffer.accept(timedTurn(0, "one", 0, 1000));
    buffer.accept(timedTurn(1, "two", 3000, 3500));

    expect(buffer.getTranscript()).toBe("one new paragraph two");
  });

  it("measures the gap on the audio timeline, not on arrival order", () => {
    // Turns delivered out of order still produce the same transcript.
    const buffer = createTranscriptBuffer({ pauseParagraphMs: 2000 });
    buffer.accept(timedTurn(1, "second", 3500, 4500));
    buffer.accept(timedTurn(0, "first", 0, 1000));

    expect(buffer.getTranscript()).toBe("first new paragraph second");
  });

  it("can be switched off", () => {
    const buffer = createTranscriptBuffer({ pauseParagraphMs: 0 });
    buffer.accept(timedTurn(0, "first", 0, 1000));
    buffer.accept(timedTurn(1, "second", 9000, 9500));

    expect(buffer.getTranscript()).toBe("first second");
  });

  it("never guesses when a turn carries no word timings", () => {
    const buffer = createTranscriptBuffer({ pauseParagraphMs: 2000 });
    buffer.accept(turn({ turn_order: 0, transcript: "first", end_of_turn: true }));
    buffer.accept(turn({ turn_order: 1, transcript: "second" }));

    expect(buffer.getTranscript()).toBe("first second");
  });

  it("keeps timings when a formatted rewrite arrives without them", () => {
    const buffer = createTranscriptBuffer({ pauseParagraphMs: 2000 });
    buffer.accept(timedTurn(0, "first thought", 0, 1000));
    // The formatted rewrite of turn 0 carries no words array.
    buffer.accept(
      turn({
        turn_order: 0,
        transcript: "First thought.",
        end_of_turn: true,
        turn_is_formatted: true,
      }),
    );
    buffer.accept(timedTurn(1, "second thought", 3500, 4500));

    expect(buffer.getTranscript()).toBe("First thought. new paragraph second thought");
  });

  it("produces two paragraphs once the parser reads it", () => {
    // The whole point: the parser needs no changes, it just sees the command.
    const buffer = createTranscriptBuffer({ pauseParagraphMs: 2000 });
    buffer.accept(timedTurn(0, "first thought", 0, 1000));
    buffer.accept(timedTurn(1, "second thought", 3500, 4500));

    const document = parse(buffer.getTranscript()).document;
    expect(document.blocks).toHaveLength(2);
    expect(renderMarkdown(document)).toBe("first thought\n\nsecond thought");
  });
});
