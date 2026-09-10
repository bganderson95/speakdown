/**
 * Editor.tsx — the signal and the document, side by side.
 *
 * Left is the raw transcript in machine voice; right is the page it resolves
 * into. Reading left to right is the translation the product performs.
 */

import { TypingIndicator } from "./TypingIndicator.js";
import { useResolution } from "./useResolution.js";

export type OutputView = "rendered" | "raw";

interface EditorProps {
  transcript: string;
  onTranscriptChange: (value: string) => void;
  view: OutputView;
  onViewChange: (view: OutputView) => void;
  html: string;
  markdown: string;
  escapeWord: string;
  /** True while live dictation is driving the box, so hand edits cannot race. */
  readOnly: boolean;
  /** False hides the transcript; the document keeps its place and widens. */
  transcriptOpen: boolean;
  onClear: () => void;
  canClear: boolean;
  /** True while the microphone is actually picking up speech. */
  speaking: boolean;
}

/** Phrases worth trying first, shown when there is nothing to render yet. */
const OPENING_MOVES = [
  "heading one Project plan end heading",
  "the deadline is bold friday end bold",
  "math 40 times 3 end math",
];

/**
 * Emptiness is an invitation, not a report. This says what to do next and
 * teaches three commands while it waits.
 */
function EmptySurface({ escapeWord }: { escapeWord: string }) {
  return (
    <div className="empty">
      <p className="empty-lead">Say something and watch it set itself.</p>
      <p className="empty-body">
        Every word you say lands here. Commands are spoken plainly, with no prefix word. Put{" "}
        <code>{escapeWord}</code> in front of one to write it as ordinary text.
      </p>
      <ul className="empty-moves">
        {OPENING_MOVES.map((move) => (
          <li key={move}>{move}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The rendered/raw switch.
 *
 * The two views are the same document in two voices, so the control sits on the
 * document itself and the transition between them is a crossfade rather than a
 * swap — the point is that nothing changed but the form.
 */
function ViewSwitch({
  view,
  onViewChange,
}: {
  view: OutputView;
  onViewChange: (view: OutputView) => void;
}) {
  return (
    <div className="switch" role="group" aria-label="Output view">
      <span className={view === "rendered" ? "switch-thumb" : "switch-thumb switch-thumb-raw"} />
      <button
        type="button"
        className="switch-option"
        aria-pressed={view === "rendered"}
        onClick={() => onViewChange("rendered")}
      >
        rendered
      </button>
      <button
        type="button"
        className="switch-option"
        aria-pressed={view === "raw"}
        onClick={() => onViewChange("raw")}
      >
        raw
      </button>
    </div>
  );
}

export function Editor({
  transcript,
  onTranscriptChange,
  view,
  onViewChange,
  html,
  markdown,
  escapeWord,
  readOnly,
  transcriptOpen,
  speaking,
  onClear,
  canClear,
}: EditorProps) {
  const documentRef = useResolution(html);
  const isEmpty = html.length === 0;

  return (
    /*
     * Both panels share ONE grid row. Hiding the transcript therefore only
     * widens the document — it never pushes it onto a second row, which is what
     * made an earlier collapse jump the page.
     */
    <div className={transcriptOpen ? "workspace" : "workspace workspace-solo"}>
      {transcriptOpen && (
        <section className="transcript-panel">
          <h2 className="panel-label">transcript{readOnly ? " · live" : ""}</h2>
          <textarea
            id="transcript-input"
            className={readOnly ? "transcript transcript-live" : "transcript"}
            value={transcript}
            spellCheck={false}
            readOnly={readOnly}
            placeholder={`hello bold world end bold`}
            aria-label="Transcript"
            onChange={(event) => onTranscriptChange(event.target.value)}
          />
        </section>
      )}

      <section className="document">
        <div className="document-head">
          <h2 className="panel-label">document</h2>

          <div className="document-actions">
            <ViewSwitch view={view} onViewChange={onViewChange} />
            <button type="button" className="ghost-button" onClick={onClear} disabled={!canClear}>
              clear
            </button>
          </div>
        </div>

        <div className="page">
          {isEmpty && !speaking ? (
            <EmptySurface escapeWord={escapeWord} />
          ) : view === "rendered" ? (
            // The HTML comes from renderHtml.ts, which escapes all text and
            // sanitizes every href, so there is no untrusted markup here.
            <div
              key="rendered"
              ref={documentRef}
              className="page-body page-rendered"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          ) : (
            <pre key="raw" className="page-body page-raw">
              {markdown}
            </pre>
          )}

          {speaking && <TypingIndicator follow={view === "rendered" ? html : markdown} />}
        </div>
      </section>
    </div>
  );
}
