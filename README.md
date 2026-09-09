# Speakdown

*speech to rich text.*

Speakdown turns spoken commands into styled rich text. You speak; a transcript
arrives; a deterministic parser recognizes explicit formatting commands inside
it and produces a document model. That one model renders two ways — styled HTML
and markdown source — toggled like GitHub's edit/preview switch.

The verbal command system is complete, and it runs on **live speech** through
AssemblyAI Universal-Streaming. Prosody (loud = bold) is still to come; see
"Seams for prosody" below.

## Run it

```
npm install
cp .env.example .env.local     # then add your AssemblyAI API key
npm run dev                    # http://localhost:5173
npm test                       # 414 tests
npm run build                  # typecheck + production build
```

Without a key everything works except the microphone — type or paste a
transcript into the box instead. Get a key at
<https://www.assemblyai.com/dashboard/api-keys>.

## Architecture

```
src/
  model/     pure: the document model + both renderers
  parser/    pure: tokenizer, command vocabulary, the parse state machine
    transforms/  pure: math, date and maps-link computation
  input/     the impure boundary: transcript sources, audio, clipboard
  ui/        React
vite-plugins/
  assemblyaiToken.ts   dev-server endpoint that mints streaming tokens
```

Import rules, enforced by `src/importBoundaries.test.ts`:

- `model/` imports nothing outside `model/`
- `parser/` may import from `model/` only
- `input/` may import from `parser/` and `model/`
- `ui/` may import from anything

`model/` and `parser/` contain no React, no DOM, no audio, no network — the test
checks both the import specifiers and the source text for browser globals. That
is what lets the parser be extracted as an npm package later.

## Design

**Signal becomes document.** The chrome is an instrument — monospace, hairlines,
a live voice line. The output is a page — serif, generously set, the only raised
surface on screen. The rendered/raw switch flips the document between those two
voices, which is the whole product in one control.

**Two variable families, opposed roles.** JetBrains Mono carries the chrome,
transcript, code and raw view; Newsreader carries the rendered page, wordmark
and help prose. Both have real weight axes, which is what lets emphasis be
expressed as weight — the wordmark sets `Speak` at 300 against `down` at 700,
the same word in two forms.

**Six colours.** `--ink #151C28`, `--paper #F1F4F8`, `--vellum #FFFFFF`,
`--graphite #59637A`, `--cobalt #1B3FD1`, `--flag #B0304A`. Cobalt is the one
accent and is spent only on live state, open marks and links; `--flag` is
failure and nothing else. Every text pair clears WCAG AA in both themes, the
lowest at 5.07:1.

**The voice line** is a seismograph at rest, not a spectrum analyser: a short
hairline between two meter ticks that displaces with the microphone's RMS while
listening. It sits directly beside the speak button, because a full-width rail
read as a page divider and made the control hard to find. It doubles as the
recording indicator, so there is no separate blinking lamp competing with it,
and it takes a plain `amplitude: number` so any source can drive it.

**The transcript is hidden by default** and stays hidden when recording starts —
the document updating live is the feedback. Its control sits above the panels,
never below the thing it hides. The panel is labelled "transcript", not
"signal": the concept shapes how the UI looks, never what it is called.

With the transcript hidden the page takes the full width, text included. The
68ch measure cap only applies in the two-column layout, where the column is
narrower than that anyway; capping only the paper would have moved the empty
space inside it.

**The resolution moment.** When a spoken command becomes formatting, the element
that just resolved fades and settles over 160ms. It fires only when the
document's *shape* changes — typing ordinary words does not trigger it — and it
marks the last formatted element, since speech runs forwards. That is a
heuristic, and it is only decoration: the worst case is a brief fade on the
wrong word.

Boldness is spent in two places, the type and the page; everything else is a
hairline. Motion is 130–200ms, ease-out, composite-only, and switched off
globally under `prefers-reduced-motion`.

## Design decisions worth knowing

**One model, two views.** `renderMarkdown` and `renderHtml` both read the same
`DocumentModel`. Neither derives from the other, so the two views cannot
disagree. `renderHtml` emits an HTML string rather than React nodes, because
`model/` must not import React; it escapes every piece of text and sanitizes
every href, so the UI's `dangerouslySetInnerHTML` is safe.

**Two-pass parsing.** `readActions()` turns tokens into a list of semantic
actions; `applyActions()` builds the document from them. "scratch that" just
pops the last action and the document is rebuilt — no separate undo machinery,
and two "scratch that"s in a row naturally remove two actions.

**Soft breaks are their own node.** `{ kind: "break" }` rather than a `"\n"`
hidden inside a text run, so text runs never carry control characters.

**Separator spaces are unmarked.** Markdown emphasis delimiters must hug their
text (`** bold**` is not bold), so the space between a bold and a non-bold chunk
is always emitted with no marks. Two chunks that share marks merge into one run
with the space inside.

**Commands are spoken bare — there is no trigger word.** `bold this week end
bold`, not `format bold …`. Marks and blocks are paired open/close rather than
stateful toggles, so a phrase always means the same thing no matter what came
before it.

| Mark / block | Open | Closers (all equivalent) |
|---|---|---|
| bold | `bold` | `end bold`, `unbold` |
| italic | `italic` | `end italic`, `unitalic` |
| strikethrough | `strike`, `strikethrough` | `end strike`, `unstrike` |
| inline code | `code` | `end code` |
| all caps | `caps`, `all caps` | `end caps` |
| heading 1–6 | `heading two`, `heading 2`, bare `heading` = H1 | `end heading` |
| quote | `quote` | `end quote`, `unquote` |
| bullet list | `bullet list` | `end list` |
| numbered list | `numbered list`, `ordered list` | `end list` |
| task list | `task list`, `todo list`, `checklist` | `end list` |
| code block | `code block [language]` | `end code block` |

`end format` closes the innermost still-open scope; saying it again closes the
next one out. `end all` closes everything. (Careful with `end all caps` — the
universal `end all` matches first, so that phrase closes everything and then
re-opens caps. Say `end caps`.)

One-shot commands round it out: `next item` for the next list item, `check that`
/ `uncheck that` to tick a task, `divider` (or `horizontal rule`) for a rule,
`new line` and `new paragraph`.

**Headings are one command, not six.** The level is read from the word after
`heading` — word or numeral, since recognizers write both — exactly the way the
emoji name is read after `emoji`. Six near-identical table entries would have
bloated the vocabulary panel for no extra expressiveness.

**Two scopes are "the same" when they are the same kind.** A heading's level, a
list's style and a code block's language are settings, not identity — which is
why a single `end list` closes whichever list is open and `end heading` closes a
heading at any level. Only one block is open at a time; the model does not nest
them.

**Code block content is verbatim.** No commands run inside one — `code block
javascript const bold = 1 end code block` keeps `bold` as code, not a mark. The
one exception is `new line`, which becomes a real line break, since code that
cannot span lines would not be much of a code block. The language tag is matched
against a fixed list, because in "code block print hello" there is no way to
guess whether `print` is a language or the first word of the code.

`caps` is a mark rather than a transformation, so it stacks with the others and
shows in the toolbar chips. Neither markdown nor HTML has a capitalization
syntax, so both renderers uppercase the characters themselves — that keeps the
rendered and raw views identical, which a CSS `text-transform` would not. An open that is never closed simply
runs to the end of the block, and the toolbar chips show what is still open.

**Transformations compute their content instead of emitting it.** Same paired
grammar, but what lands in the document is the result:

| Spoken | Document gets |
|---|---|
| `math 45 plus 12 plus 82 end math` | `139` |
| `date next friday end date` | `2026-09-11` |
| `map 1600 Pennsylvania Avenue end map` | a Google Maps link |

`address` opens the maps transform too. All three are pure functions in
[src/parser/transforms/](src/parser/transforms/) and reuse the existing model
nodes — a maps result is an ordinary `LinkRun`, math and date are ordinary
`TextRun`s, so both renderers already handle them and open marks carry onto the
result (`bold math 2 plus 2 end all` gives a bold **4**).

Three things keep them honest:

- **No `eval`, ever.** Math is a ~40-line recursive-descent evaluator over
  tokens that `mathTokens.ts` has already reduced to numbers and operators. A
  test asserts neither `eval` nor `Function` appears in the source.
- **The clock is injected.** `resolveDate(phrase, now)` never reads the clock,
  so `date today` is testable against a fixed date. `parse(text, config, now)`
  takes it as a parameter, and the UI supplies it. A boundary test fails the
  build if any transform calls `new Date()`, `Date.now()` or `Math.random()`.
- **A maps link is pure string construction.** No geocoding, no network — just
  an `encodeURIComponent`'d Maps search URL.

A transform that cannot read its content keeps the spoken words as literal text
and raises a non-blocking notice: `math 10 divided by 0 end math` renders "10
divided by 0" rather than `Infinity`. Empty content produces nothing at all.

**Failures are only reported once the command is finished.** A live transcript
arrives a word at a time, so every partial ends mid-command: `math 45 plus` is an
unfinished expression, not a broken one, and `emoji` on its own is a name that
has not been spoken yet. Judging those would flash an error on every use. So a
transform only reports a failure once its block is closed, and `emoji` stays
quiet while the following words could still grow into a known name ("thumbs" is
on its way to "thumbs up"). The words fall through to literal text either way,
so nothing is lost while the parser waits.

**A close with no matching open is a no-op** — the words are dropped, not
inserted. Someone saying `end bold` plainly meant to close something, and
printing "end bold" into their prose would be worse. This is the only place
recognized words are not emitted, and it applies only to recognized closers:
`end fnord` is not a closer, so both words fall through as literal text.

**Nothing else the user said is ever lost.** Any word that is not part of a
recognized command is emitted verbatim. The escape word is the only way to speak
a command word as text: `say bold` gives the literal word "bold".

**"scratch that" removes the last action**, which is either the last run of
spoken text — every word since the previous command — or the last structural
action. This follows §5.4 ("the last emitted inline run"). If it feels too
coarse in real dictation, changing `emitLiteral()` in `parse.ts` to push one
action per word makes it word-level instead; nothing else changes.

**Clipboard stays out of the parser.** `parse.ts` emits a link with the sentinel
href `speakdown:clipboard`. `input/resolveClipboardLinks.ts` swaps in the real
URL. The transform is pure and takes the clipboard text as an argument; the one
impure function, `readClipboardText()`, is called from the UI inside a click, so
the browser gets the user gesture it requires. A failed or empty read degrades
the link to plain text carrying the display words and shows a non-blocking
notice.

**Command precedence** is documented at the top of `parse.ts`: the escape word
first, then the universal closers, then per-command closers before opens (so the
"bold" in "end bold" cannot open a new scope), then longer phrases before
shorter ones. `link` and `emoji` only count as commands when their arguments are
actually usable.

**Open/close phrases live in one table** (`SCOPE_COMMANDS` in `commands.ts`), so
adding or removing a closer alias is a one-line edit. The table defines the
phrases; the parser that consumes it stays an explicit, scannable ladder.

**Free-form arguments end at the next command.** A spoken URL runs from the `to`
keyword until the escape word or the start of any other command, so
`link the docs to example dot com bold now` works. A URL word that happens to be
a command word therefore ends the URL — the honest consequence of a grammar with
no trigger word.

## Live speech

Speaking is a transcript source, nothing more. `input/assemblyai.ts` implements
the same `TranscriptSource` interface as the textarea, so **the parser, the
model and both renderers are byte-for-byte unchanged** from the textarea-only
version. Speech in, plain string out, same pipeline.

```
microphone.ts        mic -> mono PCM16 chunks (AudioWorklet, ~50 ms each)
assemblyai.ts        session state machine: token -> socket -> audio -> turns
transcriptBuffer.ts  pure: Turn events -> one transcript string
```

**Protocol** (AssemblyAI Universal-Streaming v3, checked against the current
docs rather than written from memory):

- `wss://streaming.assemblyai.com/v3/ws`, with `token`, `encoding=pcm_s16le`,
  `sample_rate` and `format_turns` as query parameters
- audio as binary frames, mono 16-bit little-endian PCM
- JSON `Begin` / `Turn` / `Termination` messages back; unknown message types are
  ignored, so a new server message cannot break a live session
- `{"type":"Terminate"}` to finish, then wait briefly for the last `Turn`

## Deploying

Speakdown is **bring your own key**. A deployed copy has no AssemblyAI key of
its own: each visitor pastes their own into the app, and it is spent only on
their own transcription. There is no sign-in and no account — it is a demo, and
a key is the whole of the auth.

**Why a server function exists at all.** AssemblyAI's token endpoint sends no
`Access-Control-Allow-Origin` header and answers `OPTIONS` with 405, so a
browser cannot call it directly even holding a valid key. One server-side hop is
unavoidable. `api/assemblyai-token.ts` is that hop and nothing more: it reads
the caller's key from the `x-assemblyai-key` header, exchanges it for a
60-second streaming token, and returns the token. The key is never stored, never
logged, and never written to a response.

**There is no environment fallback in the deployed function.** It is not that
the key is optional there — a request without one is refused with 401. That is
what stops a public deployment from quietly spending the maintainer's quota.

```
vercel deploy        # api/ is an Edge Function; nothing else to configure
```

The handler is a plain `(Request) => Response`, so other hosts need only a thin
adapter around `server/mintToken.ts`, which holds the actual logic. Set no
environment variables: the deployment is meant to have no key.

**Locally it is more forgiving.** `vite dev` falls back to `ASSEMBLYAI_API_KEY`
from `.env.local` when the browser sends no key, so working on the app does not
mean retyping one on every reload. That fallback exists in `vite dev` and
nowhere else — `vite preview` deliberately does not register the route, so a
local preview behaves exactly like a real deployment. Every `.env*` file is
gitignored and the variable has no `VITE_` prefix, so it is never inlined into
the bundle.

**Where the visitor's key is kept.** In their browser's `localStorage`, under
`speakdown.assemblyai-key`, and nowhere else. That is readable by any script on
the origin, which is the accepted shape for a BYO-key tool — the alternative is
retyping it every reload — and the field says so and offers a way to forget it.

**No resampling.** AssemblyAI accepts 8000–96000 Hz, so the client asks for a
16 kHz `AudioContext` and then reports whatever rate the browser actually gave
it. Chrome and Firefox honour the request; Safari sometimes returns its hardware
rate. Telling the server the truth is correct and much less code than a
resampler.

**Pauses do two things.** A silence of **2 seconds or more between turns**
becomes a paragraph break: `transcriptBuffer.ts` splices the words "new
paragraph" into the transcript and the parser handles it as the ordinary command
it already knows. Nothing about time leaks into the parser, and the break stays
visible and editable in the transcript box. The gap is measured on AssemblyAI's
*audio timeline* — last word of one turn to first word of the next — not the
wall clock, so network jitter can neither invent nor swallow a break.

A silence of **5 seconds or more stops the session**. Nothing arrives from the
server while nobody is speaking, so that one is a wall-clock timer: the absence
of messages is the signal. It resets on every turn that adds words, and the
status line says "Stopped after 5s of silence" so an automatic stop never looks
like a fault. Before the *first* words there is a longer 15-second grace period
— gathering your thoughts after pressing record is not the same as trailing off
— but there is still a limit, so a session started by accident cannot run
forever. All three thresholds are options on `createAssemblyAISource`
(`pauseParagraphMs`, `silenceStopMs`, `startSilenceStopMs`); zero disables them.

**Turn handling.** A turn arrives many times — partials while you speak, then a
final, then a punctuated rewrite — all sharing one `turn_order`.
`transcriptBuffer.ts` keys on that and takes the latest, with one guard: once a
turn is formatted, a late unformatted message can never undo the punctuation.
Every partial re-parses the whole transcript, which is what keeps `scratch that`
and the mark toggles correct mid-sentence.

**Testing without a browser.** The three browser dependencies — token fetch,
WebSocket, microphone — are injected. `assemblyai.test.ts` drives the whole
session state machine with fakes: buffering audio before the socket opens,
publishing turns, refused microphones, failed tokens, unexpected closes, and the
final turn that lands after `Terminate` is sent.

## Seams for prosody

- Inline nodes already carry `marks[]`; a prosody pass adds marks to existing
  runs. `TextRun` has a comment marking where word timings would live, and
  `transcriptBuffer.getWords()` already collects the millisecond `start`/`end`
  of every word from the live stream.
- Silence is already measured (see "Pauses" below); an acoustic prosody pass
  would read `transcriptBuffer.getWords()` alongside the parsed document.

## Note on bare commands

With no trigger word, ordinary speech can hit a command: "the code parser" opens
inline code, and "put say in front of it" escapes the following word. That is
the deliberate trade — the trigger word made every command tedious to say and
hard to read back. The escape word is the release valve (`say code` gives the
literal word "code"), and the toolbar chips show anything left open.

`say` itself fires anywhere, including inside a sentence like "what you say
next". It is configurable in the toolbar; a rarer word ("literally") avoids the
collision.
