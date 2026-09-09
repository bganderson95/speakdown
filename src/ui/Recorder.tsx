/**
 * Recorder.tsx — the instrument bar: the voice line, the record control, and
 * whatever formatting is currently open.
 *
 * There is no separate "recording" lamp. The line coming alive is the signal.
 */

import type { StopReason, StreamingStatus } from "../input/assemblyai.js";
import { DEFAULT_SILENCE_STOP_MS } from "../input/assemblyai.js";
import type { Mark } from "../model/documentModel.js";
import type { ParserState } from "../parser/parse.js";
import { VoiceLine } from "./VoiceLine.js";

interface RecorderProps {
  status: StreamingStatus;
  error: string | null;
  stopReason: StopReason | null;
  amplitude: number;
  state: ParserState;
  onToggle: () => void;
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
      return "starting";
    case "listening":
      return "stop";
    case "stopping":
      return "stopping";
    case "idle":
    case "error":
      return "speak";
  }
}

/**
 * What is still open at the end of the transcript.
 *
 * These matter more than they look: an open mark runs to the end of the block,
 * and this row is how you see that it is still on.
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

  return (
    <div className="scopes" aria-label="Still open">
      {open.length === 0 ? (
        <span className="scopes-none">nothing open</span>
      ) : (
        open.map((label) => (
          <span key={label} className="scope">
            {label}
          </span>
        ))
      )}
    </div>
  );
}

/** An automatic stop has to say so, or recording just ends and looks broken. */
function statusLine(status: StreamingStatus, stopReason: StopReason | null): string {
  switch (status) {
    case "starting":
      return "opening the microphone";
    case "listening":
      return "listening";
    case "stopping":
      return "finishing up";
    case "idle":
    case "error":
      if (stopReason === "silence") {
        return `stopped after ${Math.round(DEFAULT_SILENCE_STOP_MS / 1000)}s of silence`;
      }
      return "not recording";
  }
}

export function Recorder({
  status,
  error,
  stopReason,
  amplitude,
  state,
  onToggle,
}: RecorderProps) {
  const listening = status === "listening";

  return (
    <div className="instrument">
      {/*
        The meter belongs to the button, not to the page. A full-width rail
        read as decoration and made the control hard to find.
      */}
      <div className="transport">
        <button
          type="button"
          className={listening ? "speak-button speak-button-live" : "speak-button"}
          onClick={onToggle}
          disabled={status === "starting" || status === "stopping"}
        >
          {buttonLabel(status)}
        </button>
        <div className="voice-well">
          <VoiceLine amplitude={amplitude} listening={listening} />
        </div>
      </div>

      <span className="instrument-status" role="status">
        {statusLine(status, stopReason)}
      </span>

      <OpenScopes state={state} />

      {error !== null && (
        <p className="instrument-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
