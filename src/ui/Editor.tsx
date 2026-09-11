/**
 * Editor.tsx — the signal and the document, side by side.
 *
 * Left is the raw transcript in machine voice; right is the page it resolves
 * into. Reading left to right is the translation the product performs.
 */

import { TypingIndicator } from "./TypingIndicator.js";
import type { OutputView } from "./ViewSwitch.js";
import { ViewSwitch } from "./ViewSwitch.js";
import { useResolution } from "./useResolution.js";

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
  onTranscriptOpenChange: (open: boolean) => void;
  /** True while the microphone is actually picking up speech. */
  speaking: boolean;
  onClear: () => void;
  canClear: boolean;
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
  onTranscriptOpenChange,
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
          <h2 className="panel-label">Transcript{readOnly ? " — live" : ""}</h2>
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
          <h2 className="panel-label">Document</h2>

          {/* Everything here acts on the panel underneath it, so it sits on it. */}
          <div className="document-actions">
            <label className="quiet-toggle">
              <input
                type="checkbox"
                checked={transcriptOpen}
                onChange={(event) => onTranscriptOpenChange(event.target.checked)}
              />
              Show transcript
            </label>
            <ViewSwitch view={view} onViewChange={onViewChange} />
            <button type="button" className="ghost-button" onClick={onClear} disabled={!canClear}>
              Clear
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
