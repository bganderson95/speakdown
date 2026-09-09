import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../model/renderMarkdown.js";
import type { ParserConfig } from "./commands.js";
import { CLIPBOARD_HREF_SENTINEL, DEFAULT_CONFIG } from "./commands.js";
import { parse } from "./parse.js";

/** Parses and renders to markdown — the most readable way to assert a result. */
function md(text: string, config: ParserConfig = DEFAULT_CONFIG): string {
  return renderMarkdown(parse(text, config).document);
}

describe("plain text", () => {
  it("passes ordinary words straight through", () => {
    expect(md("the quick brown fox")).toBe("the quick brown fox");
  });

  it("preserves the original casing and punctuation of spoken words", () => {
    expect(md("Hello there, World!")).toBe("Hello there, World!");
  });

  it("produces an empty document for empty input", () => {
    expect(parse("").document).toEqual({ blocks: [] });
    expect(md("   ")).toBe("");
  });
});

describe("bold", () => {
  it("opens bare and closes with 'end bold'", () => {
    expect(md("this is bold very important end bold to note")).toBe(
      "this is **very important** to note",
    );
  });

  it("closes with the short alias 'unbold'", () => {
    expect(md("this is bold very important unbold to note")).toBe(
      "this is **very important** to note",
    );
  });

  it("treats 'end bold' and 'unbold' as identical", () => {
    expect(parse("bold hi end bold there")).toEqual(parse("bold hi unbold there"));
  });

  it("runs to the end of the block when never closed", () => {
    expect(md("keep bold going")).toBe("keep **going**");
  });

  it("reports the still-open mark in the parser state", () => {
    expect(parse("keep bold going").state.activeMarks).toEqual(["bold"]);
  });

  it("reports no active marks once closed", () => {
    expect(parse("bold on end bold off").state.activeMarks).toEqual([]);
  });

  it("opening an already-open mark changes nothing", () => {
    // One close is always enough, whatever was said before it.
    expect(md("bold one bold two end bold three")).toBe("**one two** three");
  });
});

describe("italic and code", () => {
  it("opens and closes italic", () => {
    expect(md("speak italic softly end italic please")).toBe("speak *softly* please");
  });

  it("closes italic with 'unitalic'", () => {
    expect(md("speak italic softly unitalic please")).toBe("speak *softly* please");
  });

  it("opens and closes inline code", () => {
    expect(md("run code npm test end code now")).toBe("run `npm test` now");
  });

  it("does not accept 'uncode' as a closer, so it stays literal text", () => {
    // code has no short alias; "uncode" is just a word.
    expect(md("run code npm test uncode now")).toBe("run `npm test uncode now`");
  });
});

describe("all caps", () => {
  it("uppercases the text between open and close", () => {
    expect(md("please read caps the whole thing end caps carefully")).toBe(
      "please read THE WHOLE THING carefully",
    );
  });

  it("accepts 'all caps' as an open alias", () => {
    expect(parse("all caps hey end caps")).toEqual(parse("caps hey end caps"));
  });

  it("runs to the end of the block when never closed", () => {
    expect(md("shouting caps from here on")).toBe("shouting FROM HERE ON");
  });

  it("reports the still-open mark in the parser state", () => {
    expect(parse("caps loud").state.activeMarks).toEqual(["caps"]);
  });

  it("combines with bold", () => {
    expect(md("bold caps urgent end all")).toBe("**URGENT**");
  });

  it("combines with italic and code", () => {
    expect(md("caps italic soft end all")).toBe("*SOFT*");
    expect(md("caps code npm test end all")).toBe("`NPM TEST`");
  });

  it("is closed by 'end format'", () => {
    expect(md("caps loud end format quiet")).toBe("LOUD quiet");
  });

  it("uppercases a link's display text but never its href", () => {
    expect(md("caps link the docs to example dot com slash q3 end caps")).toBe(
      "[THE DOCS](https://example.com/q3)",
    );
  });

  it("uppercases a computed transform result", () => {
    expect(md("caps date march 3 2027 end date end caps")).toBe("2027-03-03");
  });

  it("leaves the escape word able to say 'caps' literally", () => {
    expect(md("say caps lock is stuck")).toBe("caps lock is stuck");
  });

  it("'end all caps' closes everything and then re-opens caps", () => {
    // Documented consequence of the universal closer's precedence: "end all"
    // matches first, so the trailing "caps" is read as a fresh open. The
    // toolbar chip is what shows the user caps is still on. Say "end caps".
    const result = parse("bold caps loud end all caps");
    expect(renderMarkdown(result.document)).toBe("**LOUD**");
    expect(result.state.activeMarks).toEqual(["caps"]);
  });
});

describe("nesting", () => {
  it("stacks bold and italic", () => {
    // The model holds flat runs, so the second run simply carries both marks.
    // "**this** ***and that***" is the same document as nested spans would be.
    expect(md("bold this italic and that end all")).toBe("**this** ***and that***");
  });

  it("closes everything with 'end all'", () => {
    expect(parse("bold a italic b end all c").state.activeMarks).toEqual([]);
  });

  it("'end format' closes only the innermost open mark", () => {
    // italic covers only "b"; bold still covers "c".
    expect(md("bold a italic b end format c")).toBe("**a** ***b*** **c**");
  });

  it("two 'end format's close both, innermost first", () => {
    expect(md("bold a italic b end format c end format d")).toBe("**a** ***b*** **c** d");
  });

  it("a specific closer closes its own mark wherever it sits in the stack", () => {
    // "end bold" closes bold even though italic was opened more recently.
    expect(parse("bold a italic b end bold c").state.activeMarks).toEqual(["italic"]);
  });

  it("closes a specific inner mark then the outer one", () => {
    expect(md("bold a italic b end italic c end bold d")).toBe("**a** ***b*** **c** d");
  });

  it("'end all' with nothing open is harmless", () => {
    expect(md("end all nothing was open")).toBe("nothing was open");
  });
});

describe("unmatched closers", () => {
  it("a close with no matching open is a no-op, not literal text", () => {
    // Documented choice: the user clearly meant to close something, so
    // inserting the words "end bold" into their prose would be worse.
    expect(md("end bold hello there")).toBe("hello there");
  });

  it("a short-alias close with nothing open is also a no-op", () => {
    expect(md("unquote hello")).toBe("hello");
  });

  it("'end format' with nothing open is a no-op", () => {
    expect(md("end format hello")).toBe("hello");
  });

  it("an unknown word after 'end' is not a closer, so both words stay", () => {
    expect(md("end fnord hello")).toBe("end fnord hello");
  });

  it("a bare 'end' at the end of input stays literal", () => {
    expect(md("this is the end")).toBe("this is the end");
  });
});

describe("new line and new paragraph", () => {
  it("a soft break stays inside the block", () => {
    expect(md("one new line two")).toBe("one  \ntwo");
  });

  it("a new paragraph starts a new block", () => {
    expect(md("one new paragraph two")).toBe("one\n\ntwo");
  });

  it("the two produce different documents", () => {
    expect(parse("one new line two").document.blocks).toHaveLength(1);
    expect(parse("one new paragraph two").document.blocks).toHaveLength(2);
  });

  it("matches the two-word phrase, not a bare 'new'", () => {
    expect(md("new stuff")).toBe("new stuff");
  });
});

describe("bullet lists", () => {
  it("collects items", () => {
    expect(md("bullet list milk next item eggs next item bread")).toBe(
      "- milk\n- eggs\n- bread",
    );
  });

  it("keeps marks inside an item", () => {
    expect(md("bullet list buy bold milk")).toBe("- buy **milk**");
  });

  it("ends with 'end list'", () => {
    expect(md("bullet list milk end list done")).toBe("- milk\n\ndone");
  });

  it("ends when a new paragraph is spoken", () => {
    expect(md("bullet list milk new paragraph done")).toBe("- milk\n\ndone");
  });

  it("reports being inside a list", () => {
    expect(parse("bullet list milk").state.openList).toBe("bullet");
    expect(parse("bullet list milk end list done").state.openList).toBeNull();
  });

  it("matches 'bullet list' before a bare 'bullet'", () => {
    expect(md("bullet points are nice")).toBe("bullet points are nice");
  });
});

describe("headings", () => {
  it("opens a level from the spoken number", () => {
    expect(md("heading two Subsection end heading body")).toBe("## Subsection\n\nbody");
  });

  it("accepts every level", () => {
    for (const [spoken, hashes] of [
      ["one", "#"],
      ["two", "##"],
      ["three", "###"],
      ["four", "####"],
      ["five", "#####"],
      ["six", "######"],
    ] as const) {
      expect(md(`heading ${spoken} Title end heading`)).toBe(`${hashes} Title`);
    }
  });

  it("accepts a numeral for the level, which is what recognizers often write", () => {
    expect(md("heading 3 Third end heading")).toBe("### Third");
    expect(parse("heading 3 Hi end heading")).toEqual(parse("heading three Hi end heading"));
  });

  it("treats a bare 'heading' as the top level", () => {
    expect(md("heading Overview end heading")).toBe("# Overview");
  });

  it("keeps a word that is not a level as ordinary text", () => {
    // "heading" with no level is H1, so "Overview" is content, not a level.
    expect(md("heading Overview end heading")).toBe("# Overview");
  });

  it("closes any level with one 'end heading'", () => {
    expect(md("heading four Deep end heading after")).toBe("#### Deep\n\nafter");
  });

  it("carries marks inside a heading", () => {
    expect(md("heading one The bold plan end all")).toBe("# The **plan**");
  });

  it("reports the open level", () => {
    expect(parse("heading three Title").state.headingLevel).toBe(3);
    expect(parse("heading three Title end heading").state.headingLevel).toBeNull();
  });

  it("leaves an ordinary 'heading' word alone when escaped", () => {
    expect(md("say heading levels matter")).toBe("heading levels matter");
  });
});

describe("numbered lists", () => {
  it("numbers the items", () => {
    expect(md("numbered list first next item second next item third end list")).toBe(
      "1. first\n2. second\n3. third",
    );
  });

  it("accepts 'ordered list' as an alias", () => {
    expect(parse("ordered list a next item b end list")).toEqual(
      parse("numbered list a next item b end list"),
    );
  });

  it("is closed by the same 'end list' as a bullet list", () => {
    expect(md("numbered list only end list after")).toBe("1. only\n\nafter");
  });

  it("reports which list is open", () => {
    expect(parse("numbered list a").state.openList).toBe("ordered");
  });

  it("keeps marks inside an item", () => {
    expect(md("numbered list buy bold milk end all")).toBe("1. buy **milk**");
  });
});

describe("task lists", () => {
  it("renders unticked boxes by default", () => {
    expect(md("task list buy milk next item call mum end list")).toBe(
      "- [ ] buy milk\n- [ ] call mum",
    );
  });

  it("ticks the item just spoken", () => {
    expect(md("task list buy milk check that next item call mum end list")).toBe(
      "- [x] buy milk\n- [ ] call mum",
    );
  });

  it("unticks again", () => {
    expect(md("checklist ship it check that uncheck that end list")).toBe("- [ ] ship it");
  });

  it("accepts the spoken aliases", () => {
    expect(parse("todo list a end list")).toEqual(parse("task list a end list"));
    expect(parse("checklist a end list")).toEqual(parse("task list a end list"));
  });

  it("reports which list is open", () => {
    expect(parse("task list a").state.openList).toBe("task");
  });

  it("ignores 'check that' outside a task list", () => {
    // Nothing to tick; inventing a list would be worse than doing nothing.
    expect(md("bullet list milk check that end list")).toBe("- milk");
    expect(md("just talking check that")).toBe("just talking");
  });
});

describe("code blocks", () => {
  it("captures the code and the language", () => {
    expect(md("code block python print hello end code block")).toBe(
      "```python\nprint hello\n```",
    );
  });

  it("turns 'new line' into a real line break", () => {
    expect(md("code block python print hello new line print world end code block")).toBe(
      "```python\nprint hello\nprint world\n```",
    );
  });

  it("works without a language", () => {
    expect(md("code block hello world end code block")).toBe("```\nhello world\n```");
  });

  it("only treats a real language name as the language tag", () => {
    // "print" is not a language, so it is the first word of the code.
    expect(md("code block print hello end code block")).toBe("```\nprint hello\n```");
  });

  it("resolves spoken language aliases", () => {
    expect(md("code block js let x = 1 end code block")).toBe("```javascript\nlet x = 1\n```");
  });

  it("does NOT run commands inside the code", () => {
    // The whole point: code is not commands.
    expect(md("code block javascript const bold = 1 end code block")).toBe(
      "```javascript\nconst bold = 1\n```",
    );
  });

  it("is distinct from inline code", () => {
    expect(md("run code npm test end code now")).toBe("run `npm test` now");
    expect(md("code block npm test end code block")).toBe("```\nnpm test\n```");
  });

  it("is closed by 'end all' too", () => {
    expect(md("code block python print 1 end all")).toBe("```python\nprint 1\n```");
  });

  it("emits nothing for an empty block", () => {
    expect(md("code block end code block")).toBe("");
  });

  it("a closer with nothing open is a no-op", () => {
    expect(md("end code block hello")).toBe("hello");
  });
});

describe("divider", () => {
  it("inserts a horizontal rule", () => {
    expect(md("above divider below")).toBe("above\n\n---\n\nbelow");
  });

  it("accepts 'horizontal rule'", () => {
    expect(parse("above horizontal rule below")).toEqual(parse("above divider below"));
  });

  it("ends whatever block was open", () => {
    expect(md("bullet list milk divider after")).toBe("- milk\n\n---\n\nafter");
  });

  it("survives on its own, with no content to be empty of", () => {
    expect(md("divider")).toBe("---");
  });

  it("can be escaped", () => {
    expect(md("say divider between them")).toBe("divider between them");
  });
});

describe("strikethrough", () => {
  it("opens and closes", () => {
    expect(md("this is strike wrong end strike right")).toBe("this is ~~wrong~~ right");
  });

  it("accepts 'strikethrough' and 'unstrike'", () => {
    expect(md("strikethrough gone unstrike here")).toBe("~~gone~~ here");
    expect(parse("strike a end strike")).toEqual(parse("strikethrough a end strikethrough"));
  });

  it("stacks with other marks", () => {
    expect(md("bold strike both end all")).toBe("**~~both~~**");
  });

  it("reports as an active mark", () => {
    expect(parse("strike gone").state.activeMarks).toEqual(["strikethrough"]);
  });
});

describe("quote", () => {
  it("opens a blockquote and closes with 'unquote'", () => {
    expect(md("quote to be or not to be unquote said hamlet")).toBe(
      "> to be or not to be\n\nsaid hamlet",
    );
  });

  it("closes with 'end quote' too", () => {
    expect(parse("quote hi unquote there")).toEqual(parse("quote hi end quote there"));
  });

  it("runs to the end when never closed", () => {
    expect(md("quote to be or not to be")).toBe("> to be or not to be");
  });

  it("reports being inside a quote", () => {
    expect(parse("quote inside").state.inQuote).toBe(true);
    expect(parse("quote inside unquote outside").state.inQuote).toBe(false);
  });

  it("is closed by 'end format' as the innermost scope", () => {
    expect(md("quote inside end format outside")).toBe("> inside\n\noutside");
  });
});

describe("emoji", () => {
  it("inserts a single-word emoji", () => {
    expect(md("ship it emoji rocket")).toBe("ship it 🚀");
  });

  it("inserts a multi-word emoji", () => {
    expect(md("nice work emoji thumbs up")).toBe("nice work 👍");
  });

  it("keeps the words when the name is unknown", () => {
    expect(md("emoji fluffy dog")).toBe("emoji fluffy dog");
  });

  it("stays quiet when the name has not been spoken yet", () => {
    // A live transcript arrives a word at a time, so "emoji" on its own is an
    // unfinished command, not a wrong one.
    expect(parse("nice work emoji").notices).toEqual([]);
  });

  it("stays quiet while the name could still be completed", () => {
    // "thumbs" is on its way to "thumbs up".
    expect(parse("nice work emoji thumbs").notices).toEqual([]);
  });

  it("flags once a word arrives that no name starts with", () => {
    expect(parse("nice work emoji wombat").notices).toHaveLength(1);
  });

  it("flags once a full name's worth of words has failed to match", () => {
    expect(parse("emoji thumbs sideways").notices).toHaveLength(1);
  });

  it("never flags part-way through a transcript being dictated", () => {
    // The exact bug this guards: growing partials must not flash an error.
    const partials = ["nice", "nice work", "nice work emoji", "nice work emoji thumbs"];
    for (const partial of partials) {
      expect(parse(partial).notices, partial).toEqual([]);
    }
    expect(parse("nice work emoji thumbs up").notices).toEqual([]);
    expect(renderMarkdown(parse("nice work emoji thumbs up").document)).toBe("nice work 👍");
  });

  it("flags an unknown emoji name without blocking", () => {
    expect(parse("emoji wombat").notices).toEqual([
      {
        kind: "unknownEmoji",
        message: 'No emoji matched what followed "emoji"; the words were kept as text.',
      },
    ]);
  });

  it("prefers the longest matching name", () => {
    expect(md("emoji thumbs up now")).toBe("👍 now");
  });
});

describe("say (escape)", () => {
  it("emits a command word literally", () => {
    expect(md("say bold")).toBe("bold");
  });

  it("emits a closer word literally", () => {
    expect(md("say end")).toBe("end");
  });

  it("escapes exactly one word", () => {
    // "bold" is escaped to text; the following "italic" still opens italic.
    expect(md("say bold italic soft end italic")).toBe("bold *soft*");
  });

  it("stops the escaped word from opening a mark", () => {
    expect(md("we use say bold to shout")).toBe("we use bold to shout");
  });

  it("protects a whole closer phrase one word at a time", () => {
    expect(md("say end say bold")).toBe("end bold");
  });

  it("emits itself when it is the last word", () => {
    expect(md("nothing left to say")).toBe("nothing left to say");
  });
});

describe("links", () => {
  it("inserts a link from a spoken url", () => {
    expect(md("read link the docs to example dot com slash q3")).toBe(
      "read [the docs](https://example.com/q3)",
    );
  });

  it("stops the url at the next command", () => {
    expect(md("link the docs to example dot com bold then this")).toBe(
      "[the docs](https://example.com) **then this**",
    );
  });

  it("emits a clipboard sentinel the UI layer resolves", () => {
    expect(parse("link the docs to clipboard").document.blocks[0]).toEqual({
      kind: "paragraph",
      children: [{ kind: "link", text: "the docs", href: CLIPBOARD_HREF_SENTINEL, marks: [] }],
    });
  });

  it("carries open marks onto the display text", () => {
    expect(md("bold link the docs to example dot com")).toBe(
      "[**the docs**](https://example.com)",
    );
  });

  it("keeps the words when there is no target keyword", () => {
    expect(md("link the docs")).toBe("link the docs");
  });

  it("keeps the words when there is no display text", () => {
    expect(md("link to example dot com")).toBe("link to example dot com");
  });

  it("keeps the words when there is no target", () => {
    expect(md("link the docs to")).toBe("link the docs to");
  });
});

describe("scratch that", () => {
  it("removes the last run of spoken text", () => {
    expect(md("keep this bold and this scratch that")).toBe("keep this");
  });

  it("removes the last structural action", () => {
    expect(md("keep this bold scratch that still plain")).toBe("keep this still plain");
  });

  it("removes the last emoji", () => {
    expect(md("ship it emoji rocket scratch that")).toBe("ship it");
  });

  it("removes the last link", () => {
    expect(md("read link the docs to example dot com scratch that")).toBe("read");
  });

  it("removes one action per utterance", () => {
    expect(md("one new paragraph two scratch that scratch that")).toBe("one");
  });

  it("removes a close, leaving the mark open again", () => {
    expect(md("bold hi end bold scratch that there")).toBe("**hi there**");
  });

  it("does nothing when there is nothing to undo", () => {
    expect(md("scratch that hello")).toBe("hello");
  });

  it("removes an entire uninterrupted run, not just the last word", () => {
    expect(md("alpha beta gamma scratch that")).toBe("");
  });
});

describe("unknown words", () => {
  it("keeps a word that is not a command", () => {
    expect(md("wibble")).toBe("wibble");
  });

  it("still recognizes commands after an unknown one", () => {
    expect(md("wibble bold yes")).toBe("wibble **yes**");
  });
});

describe("case insensitivity", () => {
  it("matches commands regardless of casing", () => {
    expect(md("Bold shout End Bold")).toBe("**shout**");
  });

  it("matches commands through recognizer punctuation", () => {
    expect(md("bold, shout end bold.")).toBe("**shout**");
  });
});

describe("configuration", () => {
  it("uses a custom escape word", () => {
    const config: ParserConfig = { escapeWord: "literally" };
    expect(md("literally bold", config)).toBe("bold");
  });

  it("treats the default escape word as plain text under a custom one", () => {
    const config: ParserConfig = { escapeWord: "literally" };
    expect(md("say hello", config)).toBe("say hello");
  });

  it("rejects a multi-word escape word", () => {
    expect(() => parse("hi", { escapeWord: "hey there" })).toThrow(/single word/);
  });

  it("rejects an empty escape word", () => {
    expect(() => parse("hi", { escapeWord: "  " })).toThrow(/must not be empty/);
  });
});

describe("transformations", () => {
  /** A fixed clock: Tuesday, 8 September 2026. */
  const NOW = new Date(2026, 8, 8, 12, 0, 0);

  /** Parses with the injected clock, so date tests never depend on today. */
  function mdAt(text: string): string {
    return renderMarkdown(parse(text, DEFAULT_CONFIG, NOW).document);
  }

  describe("math", () => {
    it("replaces the spoken expression with the computed value", () => {
      expect(mdAt("math 45 plus 12 plus 82 end math")).toBe("139");
    });

    it("reads inside a sentence", () => {
      expect(mdAt("the total is math 45 plus 12 end math dollars")).toBe("the total is 57 dollars");
    });

    it("computes with spelled-out numbers", () => {
      expect(mdAt("math forty five plus twelve end math")).toBe("57");
    });

    it("stays quiet while the expression is still unfinished", () => {
      // "math 45 plus" is mid-sentence, not broken. Same bug class as emoji.
      for (const partial of ["math", "math 45", "math 45 plus"]) {
        expect(parse(partial, DEFAULT_CONFIG, NOW).notices, partial).toEqual([]);
      }
    });

    it("flags only once the block has been closed", () => {
      expect(parse("math 45 plus banana", DEFAULT_CONFIG, NOW).notices).toEqual([]);
      expect(parse("math 45 plus banana end math", DEFAULT_CONFIG, NOW).notices).toHaveLength(1);
    });

    it("counts 'end all' as closing the block", () => {
      expect(parse("math 45 plus end all", DEFAULT_CONFIG, NOW).notices).toHaveLength(1);
    });

    it("keeps the words and flags a failure it cannot compute", () => {
      const result = parse("math 45 plus banana end math", DEFAULT_CONFIG, NOW);
      expect(renderMarkdown(result.document)).toBe("45 plus banana");
      expect(result.notices[0]?.kind).toBe("transformFailed");
    });

    it("keeps the words on division by zero rather than emitting Infinity", () => {
      expect(mdAt("math 10 divided by 0 end math")).toBe("10 divided by 0");
    });

    it("emits nothing for an empty expression", () => {
      expect(mdAt("math end math")).toBe("");
      expect(parse("math end math", DEFAULT_CONFIG, NOW).notices).toEqual([]);
    });
  });

  describe("date", () => {
    it("resolves a relative date against the injected clock", () => {
      expect(mdAt("date tomorrow end date")).toBe("2026-09-09");
    });

    it("resolves a weekday", () => {
      expect(mdAt("date next friday end date")).toBe("2026-09-11");
    });

    it("resolves an explicit date", () => {
      expect(mdAt("date march 3 2027 end date")).toBe("2027-03-03");
    });

    it("reads inside a sentence", () => {
      expect(mdAt("ship it on date next friday end date please")).toBe(
        "ship it on 2026-09-11 please",
      );
    });

    it("stays quiet while the date phrase is still unfinished", () => {
      for (const partial of ["date", "date next"]) {
        expect(parse(partial, DEFAULT_CONFIG, NOW).notices, partial).toEqual([]);
      }
    });

    it("keeps the words and flags a date it cannot resolve", () => {
      const result = parse("date some time soon end date", DEFAULT_CONFIG, NOW);
      expect(renderMarkdown(result.document)).toBe("some time soon");
      expect(result.notices[0]?.kind).toBe("transformFailed");
    });

    it("gives the same answer for the same clock, every time", () => {
      expect(parse("date today end date", DEFAULT_CONFIG, NOW)).toEqual(
        parse("date today end date", DEFAULT_CONFIG, NOW),
      );
    });
  });

  describe("map", () => {
    it("builds a maps link from the spoken address", () => {
      expect(mdAt("map 1600 Pennsylvania Avenue end map")).toBe(
        "[1600 Pennsylvania Avenue](https://www.google.com/maps/search/?api=1&query=1600%20Pennsylvania%20Avenue)",
      );
    });

    it("accepts 'address' as an open alias", () => {
      expect(parse("address 1 Infinite Loop end address", DEFAULT_CONFIG, NOW)).toEqual(
        parse("map 1 Infinite Loop end map", DEFAULT_CONFIG, NOW),
      );
    });

    it("accepts either closer for either opener", () => {
      expect(mdAt("map 1 Infinite Loop end address")).toContain("1%20Infinite%20Loop");
    });

    it("preserves the address casing in the display text", () => {
      expect(parse("map Big Ben end map", DEFAULT_CONFIG, NOW).document.blocks[0]).toEqual({
        kind: "paragraph",
        children: [
          {
            kind: "link",
            text: "Big Ben",
            href: "https://www.google.com/maps/search/?api=1&query=Big%20Ben",
            marks: [],
          },
        ],
      });
    });

    it("emits nothing for an empty address", () => {
      expect(mdAt("map end map")).toBe("");
    });
  });

  describe("composing with the rest of the grammar", () => {
    it("carries open marks onto a computed result", () => {
      expect(mdAt("bold math 2 plus 2 end math end bold")).toBe("**4**");
    });

    it("is closed by 'end all', which also closes the surrounding mark", () => {
      expect(mdAt("bold math 2 plus 2 end all")).toBe("**4**");
      expect(parse("bold math 2 plus 2 end all", DEFAULT_CONFIG, NOW).state.activeMarks).toEqual([]);
    });

    it("is closed by 'end format'", () => {
      expect(mdAt("math 2 plus 2 end format")).toBe("4");
    });

    it("resolves at the end of input when never closed", () => {
      expect(mdAt("math 2 plus 2")).toBe("4");
    });

    it("works inside a bullet item", () => {
      expect(mdAt("bullet list total math 2 plus 2 end math")).toBe("- total 4");
    });

    it("the escape word stops a transform from opening", () => {
      expect(mdAt("say math is a subject")).toBe("math is a subject");
      expect(mdAt("say date night")).toBe("date night");
      expect(mdAt("say map of the world")).toBe("map of the world");
    });

    it("a transform closer with nothing open is a no-op", () => {
      expect(mdAt("end math hello")).toBe("hello");
    });

    it("'scratch that' removes just the computed result", () => {
      expect(mdAt("the total is math 2 plus 2 end math scratch that")).toBe("the total is");
    });
  });
});

describe("determinism", () => {
  it("produces an identical document for identical input", () => {
    const transcript =
      "quote big news unquote bullet list ship next item test end list " +
      "read link the docs to example dot com emoji rocket bold soon end bold";
    expect(parse(transcript)).toEqual(parse(transcript));
  });
});

describe("nothing is lost", () => {
  it("keeps every word of a transcript full of near-misses", () => {
    expect(md("the ending was formatted like a listing of bullets")).toBe(
      "the ending was formatted like a listing of bullets",
    );
  });
});
