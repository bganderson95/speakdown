# CLAUDE.md — Speakdown project conventions

These are standing rules for this repository. They apply to **every** change in
**every** session, not just the initial build. If a request conflicts with a
rule here, follow the rule and say so, unless the human explicitly overrides it.

Speakdown turns spoken commands into styled rich text / markdown in real time.
The full v1 scope lives in `speakdown-v1-spec.md`; read it before building
features. This file is the shorter, permanent set of principles.

---

## 1. Readability is the top priority

- Write code **as clearly as possible.** A new reader should understand any
  function in under a minute.
- Prefer explicit `switch`/`case` and `if`/`else if` ladders over dense
  functional chains, clever one-liners, or generic table-driven dispatchers
  **when the explicit version is easier to read.**
- Slight performance costs are acceptable in exchange for clarity. This project
  is not performance-bound; do not trade readability for micro-optimizations.
- Name things plainly. `startNewParagraph()` beats `mkPara()`. Favor long,
  obvious names over short, cryptic ones.
- Keep functions small and single-purpose. If a function needs a comment to
  explain a section, consider splitting that section into its own named
  function instead.
- Comment the **why**, not the **what**. Explain precedence decisions, tricky
  ordering, and anything non-obvious (e.g. why `new paragraph` is checked
  before `new`).

## 2. Never lose the user's words

- Any word not recognized as part of a valid command is emitted as **literal
  text.**
- Unknown, misspelled, or garbled commands fall through to literal text — never
  dropped, never thrown as an error, never silently swallowed.
- Clipboard/link/emoji failures degrade gracefully: keep the literal words the
  user spoke and surface a non-blocking notice. Never crash the parse.
- **Never report a failure for a command that is merely unfinished.** Live
  transcripts arrive a word at a time, so every partial ends mid-command. Only
  complain once the input can no longer complete the command — a transform block
  that has been closed, or an emoji name that no known name starts with.
  Falling through to literal text is always safe; a premature notice is not.

## 3. Determinism

- Given the same input string, the parser must always produce the same document
  model. No randomness. **No LLM or network call in the parse path.**
- All parsing is pure functions of the input text, the `ParserConfig`, and the
  injected `now`.
- **The clock is injected, never read inside a transform.** `resolveDate(phrase,
  now)` is deterministic given its arguments; `parse()` takes `now` as a
  parameter and that default is the only place the parser touches the clock.
  A test in `importBoundaries.test.ts` fails the build if any file in
  `parser/transforms/` calls `new Date()`, `Date.now()` or `Math.random()`.
- **Never use `eval` or `new Function`.** The math transform is a small
  recursive-descent evaluator over tokens that are already numbers and
  operators; a test asserts neither appears in the source.
- Transformations construct strings only. A maps link is pure URL construction
  — no geocoding, no lookup, no network.

## 4. Architecture: pure core, thin shell

Import boundaries (must always hold):

- `model/` imports nothing from `parser/`, `input/`, or `ui/`.
- `parser/` may import from `model/` only.
- `input/` may import from `parser/` and `model/`.
- `ui/` may import from anything.

Consequences to preserve:

- `model/` and `parser/` contain **no** React, no DOM, no audio, no `window`,
  no `navigator`, no `fetch`. They are pure TypeScript and must run under
  Vitest with no browser environment.
- Browser-only work (clipboard reads, mic, WebSocket to AssemblyAI) lives in
  `input/` or `ui/`, never in the parser. The parser may emit a sentinel
  (e.g. `href: "clipboard"`) that a thin outer layer resolves.
- The parser is text-source-agnostic. It consumes a plain string/token stream.
  Whether that came from a textarea (v1) or AssemblyAI (v2) is invisible to it.
  Never add source-specific logic inside the parser.

## 5. The document model is the single source of truth

- Both the markdown renderer and the HTML renderer read from the **same**
  `DocumentModel`. Never render one view from the other view's output.
- Do not introduce a markdown-string→HTML library as the primary render path;
  render both views straight from the model so they can never diverge.
- When adding a feature, extend the model first, then both renderers, then the
  parser. Keep the model minimal — don't add node types v1 doesn't use.

## 6. Configuration, not hardcoding

- **There is no trigger word.** Commands are spoken bare (`bold`, `bullet list`,
  `new paragraph`). A trigger prefix was removed deliberately — do not
  reintroduce one.
- The escape word (default `"say"`) lives in the one `ParserConfig` object and
  is read everywhere. Never hardcode `"say"` in parsing logic. It is the only
  way to speak a command word as text, so keep it rock-solid and well-tested.
- Inline marks are `bold`, `italic`, `strikethrough`, `code` and `caps`. `caps`
  is a *transforming* mark: it has no markdown or HTML syntax, so both renderers
  uppercase the characters. Never render it with CSS `text-transform` — that
  would make the rendered and raw views disagree.
- **Keep the spoken vocabulary small.** Aliases are not free: every one shows up
  in the help panel the user has to read. Prefer reading a parameter from the
  following word (a heading's level, an emoji's name) over enumerating a command
  per value, and add an alias only when it is a genuinely different way someone
  would say the thing.
- Block scopes are headings, quotes and lists. **Only one block is open at a
  time** — the model does not nest them, and opening one closes any other.
- Two scopes are "the same" when they are the same KIND. A heading's level, a
  list's style and a code block's language are settings, not identity, which is
  why one `end list` closes whichever list is open.
- **Marks and blocks are paired open/close, never stateful toggles.** Each has
  an open phrase and one or more closer phrases (`end <x>` universally, plus
  short aliases like `unbold`/`unquote`). A phrase must always mean the same
  thing regardless of what came before it. Do not reintroduce a toggle.
- Open/close phrases live in the `SCOPE_COMMANDS` table in `commands.ts`, so
  adding or removing a closer alias is a one-line edit. The table says *what*
  the phrases are; the parser logic that consumes it stays an explicit,
  scannable ladder — do not collapse it into a generic dispatch engine.
- **Transformations** (`map`/`address`, `math`, `date`) are open/close pairs
  whose content is *computed* rather than emitted. Each is backed by a pure
  function in `parser/transforms/`, listed in the `TRANSFORM_COMMANDS` table.
- Command matching is case-insensitive; literal text preserves original casing.
- Anything the UI shows about the vocabulary (help text, chips) is derived from
  the command definitions + active config, so it cannot drift from the parser.

## 7. Design system

The identity is "signal becomes document": the chrome is an instrument, the
output is a page, and the rendered/raw switch flips between those two voices.

**Name things for the user, not for the concept.** The left panel is labelled
"transcript", not "signal" — the concept informs how it looks, never what it is
called. If a label needs the design rationale to make sense, it is wrong.

- **Two families, opposed roles.** `--font-instrument` (JetBrains Mono) is
  chrome, transcript, code and the raw view. `--font-document` (Newsreader) is
  the rendered page, the wordmark and help prose. Never mix the roles: putting
  the document's serif on a button, or mono in the rendered page, breaks the
  one idea the design carries.
- **Six named colours only** (`--ink --paper --vellum --graphite --cobalt
  --flag`) plus derived hairlines. Cobalt is the single accent and is spent on
  live state, open marks and links. `--flag` is failure only, never decoration.
- **Boldness is spent in two places**: the typography and the page. Everything
  else is a hairline and quiet type. Do not add another raised card, another
  accent colour, or a second solid-filled control.
- **Scale, not magic numbers.** Type comes from `--t-*`, space from `--s*`
  (4px base). Add a token before adding a one-off value.
- **Motion is short and ease-out** (`--fast` 130ms, `--calm` 200ms, `--ease`).
  Composite-only properties. Every animation is switched off under
  `prefers-reduced-motion`, which is handled once, globally, at the foot of
  `styles.css` — do not add per-rule exceptions.
- **Never override a visibility choice the user made.** The transcript is
  hidden by default and stays hidden when recording starts; the document
  updating live is the feedback, not the raw text reappearing.
- Keep contrast at WCAG AA or better in both themes, and keep one visible
  focus treatment (`:focus-visible`, cobalt outline) rather than per-component
  focus styling.

## 8. API keys (bring your own)

- **A deployment never holds a key.** `api/assemblyai-token.ts` refuses any
  request without an `x-assemblyai-key` header. Do not add an environment
  fallback there, and do not set `ASSEMBLYAI_API_KEY` on a host.
- The **only** environment fallback is `vite dev`, as a local convenience.
  `vite preview` deliberately omits the route so a preview behaves like a
  deployment.
- The key passes through `server/mintToken.ts` and is exchanged for a
  60-second token. Never store it, never log it, never put it in a response.
- The one server hop is not a design preference: AssemblyAI's token endpoint
  sends no CORS headers and 405s on `OPTIONS`, so the browser cannot call it
  directly. Do not "simplify" it away.
- The client declares `API_KEY_HEADER` itself rather than importing from
  `server/`, which would breach §4. A test asserts the two match.

## 9. Testing (Vitest)

- Every pure module (`model/`, `parser/`) is unit-tested.
- One behavior per test, arrange/act/assert, plainly written.
- Any new command ships with tests covering: the happy path, at least one
  combination with another command, and its failure/fall-through behavior.
- `normalizeSpokenUrl` and `parse` are the highest-value test targets — keep
  their tables broad.
- Add a test (or lint rule) guarding the import boundaries in §4 if practical.

## 10. Scope discipline

- **Interpretive** transforms (summarize, translate, fix grammar) are a separate
  future tier and are explicitly out of scope — they cannot be deterministic.
  Only add transforms that are pure functions of their input.
- v1 is the verbal command system only. Prosody / volume (loud = bold) is v2 and
  must not be built into v1 — but do not design anything that blocks it. Inline
  nodes carry `marks[]` so prosody can add marks later; leave a noted place for
  per-word timing.
- Headings, ordered lists, task lists, fenced code blocks, dividers and
  strikethrough have been added at the human's request. Tables, footnotes and
  the like are still out unless asked. Resist scope creep; protect the core.
- **Code block content is verbatim.** No commands run inside one — not even the
  escape word — because code is not commands. The one exception is `new line`,
  which becomes a real line break.
- When unsure whether something belongs in v1, ask rather than assume.

## 11. Working style for changes

- Before editing, state briefly which module(s) you'll touch and why, and check
  it respects the import boundaries.
- Make the smallest change that fully solves the request. Prefer editing one
  module cleanly over spreading a change across many.
- If a request would violate a rule here (lose user words, add impurity to the
  parser, hardcode the trigger, diverge the two views), flag it and propose the
  compliant version.
