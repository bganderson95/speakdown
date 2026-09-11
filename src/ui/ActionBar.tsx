/**
 * ActionBar.tsx — the one row of things you actually do.
 *
 * Reads left to right: what you do, and what is happening while you do it.
 * Nothing else — the controls for reading the document sit on the document,
 * and everything set once rather than used constantly lives in Settings.
 */

import type { StopReason, StreamingStatus } from "../input/assemblyai.js";
import { DEFAULT_SILENCE_STOP_MS } from "../input/assemblyai.js";
import type { Mark } from "../model/documentModel.js";
import type { ParserState } from "../parser/parse.js";
import { VoiceLine } from "./VoiceLine.js";

interface ActionBarProps {
  status: StreamingStatus;
  error: string | null;
  stopReason: StopReason | null;
  amplitude: number;
  state: ParserState;
  onToggleRecording: () => void;
}

const MARK_LABELS: ReadonlyArray<[Mark, string]> = [
  ["bold", "bold"],
  ["italic", "italic"],
  ["strikethrough", "strike"],
  ["code", "code"],
  ["caps", "caps"],
];

const LIST_LABELS: Readonly<Record<string, string>> = {
  bullet: "bullets",
  ordered: "numbers",
  task: "tasks",
};

function buttonLabel(status: StreamingStatus): string {
  switch (status) {
    case "starting":
      return "Starting…";
    case "listening":
      return "Stop";
    case "stopping":
      return "Stopping…";
    case "idle":
    case "error":
      return "Record";
  }
}

/** The status text says the same thing the button does. */
function statusLine(status: StreamingStatus, stopReason: StopReason | null): string {
  switch (status) {
    case "starting":
      return "Opening the microphone";
    case "listening":
      return "Recording";
    case "stopping":
      return "Finishing up";
    case "idle":
    case "error":
      if (stopReason === "silence") {
        return `Stopped after ${Math.round(DEFAULT_SILENCE_STOP_MS / 1000)}s of silence`;
      }
      return "Not recording";
  }
}

/**
 * What is still open at the end of the transcript.
 *
 * Absent when nothing is open: an empty row says that without a label for it.
 */
function OpenScopes({ state }: { state: ParserState }) {
  const open: string[] = [];
  for (const [mark, label] of MARK_LABELS) {
    if (state.activeMarks.includes(mark)) {
      open.push(label);
    }
  }
  if (state.headingLevel !== null) {
    open.push(`h${state.headingLevel}`);
  }
  if (state.inQuote) {
    open.push("quote");
  }
  if (state.openList !== null) {
    open.push(LIST_LABELS[state.openList] ?? "list");
  }

  if (open.length === 0) {
    return null;
  }

  return (
    <div className="scopes" aria-label="Still open">
      {open.map((label) => (
        <span key={label} className="scope">
          {label}
        </span>
      ))}
    </div>
  );
}

export function ActionBar({
  status,
  error,
  stopReason,
  amplitude,
  state,
  onToggleRecording,
}: ActionBarProps) {
  const listening = status === "listening";

  return (
    <div className="action-bar">
      <button
        type="button"
        className={listening ? "record-button record-button-live" : "record-button"}
        onClick={onToggleRecording}
        disabled={status === "starting" || status === "stopping"}
      >
        <span className={listening ? "record-mark record-mark-stop" : "record-mark"} aria-hidden="true" />
        {buttonLabel(status)}
      </button>

      <div className="action-live">
        <div className="voice-well">
          <VoiceLine amplitude={amplitude} listening={listening} />
        </div>
        <span className="action-status" role="status">
          {statusLine(status, stopReason)}
        </span>
        <OpenScopes state={state} />
      </div>

      {error !== null && (
        <p className="action-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
