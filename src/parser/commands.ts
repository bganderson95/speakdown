/**
 * commands.ts — the command vocabulary and parser configuration.
 *
 * PURITY: imports only from model/. No React, no DOM.
 *
 * This is the single source of truth for the vocabulary. The parser matches the
 * phrases defined here, and the UI's help panel is generated from
 * describeCommands(), so the help can never drift from what the parser accepts.
 *
 * GRAMMAR: commands are spoken bare — there is no trigger word. Every inline
 * mark and block is opened by one phrase and closed by another; nothing is a
 * stateful toggle, so a phrase always means the same thing no matter what came
 * before it.
 */

import type { HeadingLevel, ListStyle, Mark } from "../model/documentModel.js";

export interface ParserConfig {
  /**
   * The word that makes the next single word literal. Default "say".
   *
   * With no trigger word, this is the only way to speak a command word as text,
   * so it has to stay reliable.
   */
  escapeWord: string;
}

export const DEFAULT_CONFIG: ParserConfig = {
  escapeWord: "say",
};

/*
 * NOTE: pause-to-paragraph is NOT configured here. A silence has no
 * representation in a plain string, so the input layer measures it and splices
 * the words "new paragraph" into the transcript; see
 * input/transcriptBuffer.ts. The parser stays text-only and unaware of time.
 */

/**
 * Validates a configured word. The escape word must be a single token, because
 * the parser matches it one token at a time.
 *
 * Throws at config time rather than failing quietly at parse time.
 */
export function validateConfigWord(label: string, value: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${label} must not be empty.`);
  }
  if (/\s/.test(value.trim())) {
    throw new Error(`${label} must be a single word, but got "${value}".`);
  }
}

/** Validates a whole config. Call this before handing a config to the parser. */
export function validateConfig(config: ParserConfig): void {
  validateConfigWord("Escape word", config.escapeWord);
}

// ---------------------------------------------------------------------------
// Scopes: everything that is opened by one phrase and closed by another
// ---------------------------------------------------------------------------

/**
 * What an open/close pair actually applies.
 *
 * Everything except a mark is a BLOCK scope, and only one block can be open at
 * a time — the document model does not nest them.
 */
export type ScopeTarget =
  | { kind: "mark"; mark: Mark }
  | { kind: "quote" }
  | { kind: "list"; style: ListStyle }
  | { kind: "heading"; level: HeadingLevel };

export interface ScopeCommand {
  target: ScopeTarget;
  /** Name shown in the help panel. */
  label: string;
  /** Every phrase that opens the scope; the first is the canonical one. */
  opens: string[][];
  /**
   * Every phrase that closes it. All closers for a command are equivalent.
   *
   * The canonical closer is `end <x>`; the short aliases (`unbold`, `unitalic`,
   * `unquote`) are extras. Adding or removing a short alias is a one-line edit
   * to this table and nothing else — the parser reads the table.
   */
  closers: string[][];
}

export const SCOPE_COMMANDS: readonly ScopeCommand[] = [
  {
    target: { kind: "mark", mark: "bold" },
    label: "bold",
    opens: [["bold"]],
    closers: [["end", "bold"], ["unbold"]],
  },
  {
    target: { kind: "mark", mark: "italic" },
    label: "italic",
    opens: [["italic"]],
    closers: [["end", "italic"], ["unitalic"]],
  },
  {
    target: { kind: "mark", mark: "strikethrough" },
    label: "strikethrough",
    opens: [["strike"], ["strikethrough"]],
    closers: [["end", "strike"], ["end", "strikethrough"], ["unstrike"]],
  },
  {
    // No short alias: "uncode" is not a word anyone says, so `end code` only.
    target: { kind: "mark", mark: "code" },
    label: "inline code",
    opens: [["code"]],
    closers: [["end", "code"]],
  },
  {
    // NOTE: the closer is "end caps", not "end all caps" — "end all" is the
    // universal closer and is matched first, so "end all caps" would close
    // everything and then leave "caps" as a stray word.
    target: { kind: "mark", mark: "caps" },
    label: "all caps",
    opens: [["caps"], ["all", "caps"]],
    closers: [["end", "caps"]],
  },
  {
    // quote/unquote is the blessed natural pair — it reads as normal English.
    target: { kind: "quote" },
    label: "quote",
    opens: [["quote"]],
    closers: [["end", "quote"], ["unquote"]],
  },
  {
    target: { kind: "list", style: "bullet" },
    label: "bullet list",
    opens: [["bullet", "list"]],
    closers: [["end", "list"]],
  },
  {
    target: { kind: "list", style: "ordered" },
    label: "numbered list",
    opens: [["numbered", "list"], ["ordered", "list"]],
    closers: [["end", "list"]],
  },
  {
    target: { kind: "list", style: "task" },
    label: "task list",
    opens: [["task", "list"], ["todo", "list"], ["checklist"]],
    closers: [["end", "list"]],
  },
];

// ---------------------------------------------------------------------------
// Transformations: open, speak content, close, and the COMPUTED result is what
// lands in the document — the spoken words themselves do not appear.
//
// Each one is backed by a pure function in transforms/. See parse.ts for how
// the content between the phrases is collected and handed over.
// ---------------------------------------------------------------------------

export type TransformKind = "map" | "math" | "date";

export interface TransformCommand {
  kind: TransformKind;
  /** Name shown in the help panel. */
  label: string;
  /** Every phrase that opens it; the first is the canonical one. */
  opens: string[][];
  /** Every phrase that closes it. */
  closers: string[][];
  /** A one-line example for the help panel. */
  example: string;
}

export const TRANSFORM_COMMANDS: readonly TransformCommand[] = [
  {
    kind: "map",
    label: "a maps link",
    opens: [["map"], ["address"]],
    closers: [["end", "map"], ["end", "address"]],
    example: "map 1600 Pennsylvania Avenue end map",
  },
  {
    kind: "math",
    label: "a calculation",
    opens: [["math"]],
    closers: [["end", "math"]],
    example: "math 45 plus 12 plus 82 end math  ->  139",
  },
  {
    kind: "date",
    label: "a date",
    opens: [["date"]],
    closers: [["end", "date"]],
    example: "date next friday end date  ->  2026-09-11",
  },
];

// ---------------------------------------------------------------------------
// Fenced code blocks
//
// Like a transformation, the words inside are captured verbatim rather than
// parsed — code is not commands. Unlike one, the result is a block.
// ---------------------------------------------------------------------------

export const CODE_BLOCK_OPENS: readonly string[][] = [["code", "block"]];

export const CODE_BLOCK_CLOSERS: readonly string[][] = [["end", "code", "block"]];

/**
 * Languages recognized after "code block".
 *
 * A fixed list, because the alternative is guessing: in "code block print
 * hello", is "print" a language or the first word of the code? Only a word on
 * this list is treated as a language tag; anything else starts the code.
 */
export const CODE_BLOCK_LANGUAGES: readonly string[] = [
  "bash",
  "c",
  "cpp",
  "csharp",
  "css",
  "diff",
  "go",
  "haskell",
  "html",
  "java",
  "javascript",
  "json",
  "jsx",
  "kotlin",
  "lua",
  "markdown",
  "php",
  "python",
  "ruby",
  "rust",
  "scala",
  "shell",
  "sql",
  "swift",
  "toml",
  "tsx",
  "typescript",
  "xml",
  "yaml",
];

/** Spoken aliases that are not the canonical language name. */
const LANGUAGE_ALIASES: Readonly<Record<string, string>> = {
  js: "javascript",
  ts: "typescript",
  py: "python",
  rb: "ruby",
  sh: "bash",
  "c++": "cpp",
  "c#": "csharp",
  golang: "go",
  yml: "yaml",
};

/** Resolves a spoken word to a language tag, or null if it is not one. */
export function resolveCodeLanguage(word: string): string | null {
  const lower = word.toLowerCase();
  const alias = LANGUAGE_ALIASES[lower];
  if (alias !== undefined) {
    return alias;
  }
  return CODE_BLOCK_LANGUAGES.includes(lower) ? lower : null;
}

// ---------------------------------------------------------------------------
// Headings
//
// One command, not six: the level is read from the word after "heading", the
// same way the emoji name is read after "emoji". Six near-identical entries
// would bloat the vocabulary the help panel shows for no extra expressiveness.
// ---------------------------------------------------------------------------

export const PHRASE_HEADING = ["heading"];

export const HEADING_CLOSERS: readonly string[][] = [["end", "heading"]];

/**
 * Spoken heading levels. The numerals are there because recognizers write
 * digits as often as words — "heading 2" and "heading two" are the same thing
 * said once.
 */
const HEADING_LEVEL_WORDS: Readonly<Record<string, HeadingLevel>> = {
  one: 1,
  "1": 1,
  two: 2,
  "2": 2,
  three: 3,
  "3": 3,
  four: 4,
  "4": 4,
  five: 5,
  "5": 5,
  six: 6,
  "6": 6,
};

/** The level named by a word, or null when the word is not a level. */
export function resolveHeadingLevel(word: string | undefined): HeadingLevel | null {
  if (word === undefined) {
    return null;
  }
  return HEADING_LEVEL_WORDS[word] ?? null;
}

/**
 * The longest phrase the parser ever has to peek at, in words.
 *
 * Every open, closer and standalone phrase — scope commands, transforms and
 * the standalone phrases below — is at most this many words, and the matchers
 * walk lengths from this down to 1 so a longer phrase always wins. Three is
 * what "end code block" needs.
 */
export const MAX_PHRASE_WORDS = 3;

// ---------------------------------------------------------------------------
// Standalone phrases (no open/close pairing)
// ---------------------------------------------------------------------------

/** Closes the innermost still-open scope. Handled specially in parse.ts. */
export const PHRASE_END_INNERMOST = ["end", "format"];

/** Closes every still-open scope. Handled specially in parse.ts. */
export const PHRASE_END_ALL = ["end", "all"];

export const PHRASE_NEXT_ITEM = ["next", "item"];
export const PHRASE_CHECK_THAT = ["check", "that"];
export const PHRASE_UNCHECK_THAT = ["uncheck", "that"];
export const PHRASE_DIVIDER = ["divider"];
export const PHRASE_HORIZONTAL_RULE = ["horizontal", "rule"];
export const PHRASE_NEW_LINE = ["new", "line"];
export const PHRASE_NEW_PARAGRAPH = ["new", "paragraph"];
export const PHRASE_SCRATCH_THAT = ["scratch", "that"];
export const PHRASE_LINK = ["link"];
export const PHRASE_EMOJI = ["emoji"];

/** The keyword separating a link's display words from its target. */
export const LINK_TARGET_KEYWORD = "to";

/** The link target that means "read the URL from the system clipboard". */
export const LINK_CLIPBOARD_KEYWORD = "clipboard";

/**
 * The sentinel href the parser emits for a clipboard link.
 *
 * The parser core is pure, so it cannot touch navigator.clipboard. It emits
 * this sentinel and the input/UI layer resolves it; see
 * input/resolveClipboardLinks.ts.
 */
export const CLIPBOARD_HREF_SENTINEL = "speakdown:clipboard";

// ---------------------------------------------------------------------------
// Help vocabulary
// ---------------------------------------------------------------------------

export type CommandGroup =
  | "Inline marks"
  | "Blocks"
  | "Structure"
  | "Transformations"
  | "Insert"
  | "Editing";

export interface CommandDoc {
  /** What the user says, e.g. "bold" or "end bold / unbold". */
  phrase: string;
  description: string;
  group: CommandGroup;
}

function phraseText(phrase: readonly string[]): string {
  return phrase.join(" ");
}

/** "caps / all caps" — every accepted phrase of a list, in table order. */
function phraseList(phrases: readonly (readonly string[])[]): string {
  const rendered: string[] = [];
  for (const phrase of phrases) {
    rendered.push(phraseText(phrase));
  }
  return rendered.join(" / ");
}

/** "end bold / unbold" — every accepted closer, in table order. */
function closerText(command: { closers: readonly (readonly string[])[] }): string {
  return phraseList(command.closers);
}

/**
 * The whole vocabulary as the user would say it.
 *
 * Generated from SCOPE_COMMANDS and the live config, so the help panel cannot
 * describe a command the parser does not accept.
 */
export function describeCommands(config: ParserConfig): CommandDoc[] {
  const docs: CommandDoc[] = [];

  for (const command of SCOPE_COMMANDS) {
    const group: CommandGroup = command.target.kind === "mark" ? "Inline marks" : "Blocks";
    docs.push({
      phrase: phraseList(command.opens),
      description: `Open ${command.label}. Close with: ${closerText(command)}.`,
      group,
    });
  }

  docs.push({
    phrase: `${phraseText(PHRASE_HEADING)} <1-6>`,
    description: `Open a heading; "heading" alone is the top level. Close with: ${phraseList(HEADING_CLOSERS)}.`,
    group: "Blocks",
  });
  docs.push({
    phrase: phraseText(PHRASE_NEXT_ITEM),
    description: "Start the next list item.",
    group: "Blocks",
  });
  docs.push({
    phrase: `${phraseText(PHRASE_CHECK_THAT)} / ${phraseText(PHRASE_UNCHECK_THAT)}`,
    description: "Tick or untick the task-list item you just spoke.",
    group: "Blocks",
  });
  docs.push({
    phrase: `${phraseList(CODE_BLOCK_OPENS)} [language] … ${phraseList(CODE_BLOCK_CLOSERS)}`,
    description: 'Fenced code block, e.g. "code block python … end code block".',
    group: "Blocks",
  });

  for (const command of TRANSFORM_COMMANDS) {
    docs.push({
      phrase: `${phraseList(command.opens)} … ${closerText(command)}`,
      description: `Speak it, and ${command.label} replaces your words. e.g. ${command.example}`,
      group: "Transformations",
    });
  }

  docs.push({
    phrase: phraseText(PHRASE_END_INNERMOST),
    description: "Close the most recently opened mark or block.",
    group: "Structure",
  });
  docs.push({
    phrase: phraseText(PHRASE_END_ALL),
    description: "Close everything that is still open.",
    group: "Structure",
  });
  docs.push({
    phrase: phraseText(PHRASE_NEW_LINE),
    description: "Soft line break inside the current block.",
    group: "Structure",
  });
  docs.push({
    phrase: phraseText(PHRASE_NEW_PARAGRAPH),
    description: "End the current block and start a paragraph.",
    group: "Structure",
  });
  docs.push({
    phrase: `${phraseText(PHRASE_DIVIDER)} / ${phraseText(PHRASE_HORIZONTAL_RULE)}`,
    description: "Insert a horizontal rule.",
    group: "Structure",
  });

  docs.push({
    phrase: "link <display words> to <spoken url>",
    description: 'Insert a link, e.g. "link the docs to example dot com slash q3".',
    group: "Insert",
  });
  docs.push({
    phrase: "link <display words> to clipboard",
    description: "Insert a link using the URL on your clipboard.",
    group: "Insert",
  });
  docs.push({
    phrase: "emoji <name>",
    description: 'Insert an emoji by name, e.g. "emoji thumbs up".',
    group: "Insert",
  });

  docs.push({
    phrase: `${config.escapeWord} <word>`,
    description: "Escape: emit the next single word literally, even a command word.",
    group: "Editing",
  });
  docs.push({
    phrase: phraseText(PHRASE_SCRATCH_THAT),
    description: "Undo the most recent action.",
    group: "Editing",
  });

  return docs;
}
