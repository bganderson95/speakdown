/**
 * App.tsx — wires the pure core to the screen.
 *
 * The flow is one direction: transcript -> parse -> resolve clipboard links ->
 * render. Both output views come from the same DocumentModel, so they can never
 * disagree.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { hasClipboardLinks, readClipboardText, resolveClipboardLinks } from "../input/resolveClipboardLinks.js";
import { renderHtml } from "../model/renderHtml.js";
import { renderMarkdown } from "../model/renderMarkdown.js";
import type { ParserConfig } from "../parser/commands.js";
import { DEFAULT_CONFIG, validateConfigWord } from "../parser/commands.js";
import { parse } from "../parser/parse.js";
import { CommandHelp } from "./CommandHelp.js";
import type { OutputView } from "./Editor.js";
import { Editor } from "./Editor.js";
import { Recorder } from "./Recorder.js";
import { Settings } from "./Settings.js";
import { useLiveTranscription } from "./useLiveTranscription.js";

const SAMPLE_TRANSCRIPT = [
  "heading one Speakdown end heading",
  "quote speakdown turns spoken words into formatted text unquote",
  "heading two This week end heading",
  "the plan is bold short end bold and it is caps urgent end caps",
  "numbered list finish the code parser end code",
  "next item wire up the italic rendered unitalic view",
  "next item read link the docs to example dot com slash q3",
  "end list divider",
  "heading two Shipping end heading",
  "task list write the changelog check that next item ship on",
  "date next friday end date end list",
  "new paragraph the office is at map 1600 Pennsylvania Avenue end map",
  "and we are strike behind end strike ahead by math 12 times 4 end math points",
  "emoji rocket",
  "code block python print hello world end code block",
].join(" ");

/**
 * Appends what was just dictated to whatever was already in the box, so you can
 * dictate, stop, edit by hand, and dictate again.
 */
function joinTranscript(base: string, live: string): string {
  if (base.trim().length === 0) {
    return live;
  }
  if (live.length === 0) {
    return base;
  }
  return `${base.trimEnd()} ${live}`;
}

export function App() {
  const [transcript, setTranscript] = useState(SAMPLE_TRANSCRIPT);
  const [config, setConfig] = useState<ParserConfig>(DEFAULT_CONFIG);
  const [escapeInput, setEscapeInput] = useState(DEFAULT_CONFIG.escapeWord);
  const [escapeError, setEscapeError] = useState<string | null>(null);
  const [view, setView] = useState<OutputView>("rendered");
  // Hidden by default: the document is the point, and the transcript is the
  // raw material behind it.
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  // Clipboard state lives here, not in the parser: reading it needs a browser
  // API and a user gesture. `clipboardTried` stops us from re-prompting on
  // every keystroke once a read has already been attempted.
  const [clipboardUrl, setClipboardUrl] = useState<string | null>(null);
  const [clipboardTried, setClipboardTried] = useState(false);

  // What was in the box when recording started. Live turns are appended to it.
  const baseTranscriptRef = useRef("");
  const live = useLiveTranscription((spoken) =>
    setTranscript(joinTranscript(baseTranscriptRef.current, spoken)),
  );

  // The clock is injected rather than read inside the parser, which is what
  // keeps the date transformation pure and testable. Reading it here means
  // "date today" resolves against the moment the transcript last changed.
  const parseResult = useMemo(() => parse(transcript, config, new Date()), [transcript, config]);
  const needsClipboard = hasClipboardLinks(parseResult.document);

  useEffect(() => {
    if (!needsClipboard || clipboardTried) {
      return;
    }
    let cancelled = false;
    void readClipboardText().then((text) => {
      if (!cancelled) {
        setClipboardUrl(text);
        setClipboardTried(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [needsClipboard, clipboardTried]);

  const resolution = useMemo(
    () => resolveClipboardLinks(parseResult.document, clipboardUrl),
    [parseResult, clipboardUrl],
  );

  const html = useMemo(() => renderHtml(resolution.document), [resolution]);
  const markdown = useMemo(() => renderMarkdown(resolution.document), [resolution]);

  function handleEscapeInputChange(value: string): void {
    setEscapeInput(value);
    try {
      validateConfigWord("Escape word", value);
      setEscapeError(null);
      setConfig({ ...config, escapeWord: value.trim() });
    } catch (error) {
      // Keep parsing with the last valid escape word while the field is bad.
      setEscapeError(error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Starting from a click matters: getUserMedia needs a user gesture, and the
   * microphone is opened first so its real sample rate can go into the socket
   * URL.
   */
  function handleToggleRecording(): void {
    if (live.isActive) {
      void live.stop();
      return;
    }

    // Dictation appends to whatever is already in the box — except the example
    // text, which nobody wants to speak onto the end of.
    const base = transcript === SAMPLE_TRANSCRIPT ? "" : transcript;
    baseTranscriptRef.current = base;
    setTranscript(base);
    void live.start();
  }

  function handleClearTranscript(): void {
    baseTranscriptRef.current = "";
    setTranscript("");
  }

  /** Retrying inside a click gives the browser the user gesture it wants. */
  async function handleClipboardRetry(): Promise<void> {
    const text = await readClipboardText();
    setClipboardUrl(text);
    setClipboardTried(true);
  }

  const notices: string[] = [];
  for (const notice of parseResult.notices) {
    notices.push(notice.message);
  }
  for (const notice of resolution.notices) {
    notices.push(notice.message);
  }

  return (
    <div className="app">
      <header className="masthead">
        <h1 className="wordmark">
          <span className="wordmark-speak">Speak</span>
          <span className="wordmark-down">down</span>
        </h1>
        <p className="tagline">speech to rich text</p>
      </header>

      <Recorder
        status={live.status}
        error={live.error}
        stopReason={live.stopReason}
        amplitude={live.amplitude}
        state={parseResult.state}
        onToggle={handleToggleRecording}
      />

      <div className="chrome-row">
        <Settings
          escapeInput={escapeInput}
          escapeError={escapeError}
          onEscapeInputChange={handleEscapeInputChange}
          transcriptOpen={transcriptOpen}
          onTranscriptOpenChange={setTranscriptOpen}
        />
        <button
          type="button"
          className="ghost-button"
          onClick={handleClearTranscript}
          disabled={live.isActive || transcript.length === 0}
        >
          clear
        </button>
      </div>

      <Editor
        transcript={transcript}
        onTranscriptChange={setTranscript}
        view={view}
        onViewChange={setView}
        html={html}
        markdown={markdown}
        escapeWord={config.escapeWord}
        readOnly={live.isActive}
        transcriptOpen={transcriptOpen}
      />

      {(notices.length > 0 || needsClipboard) && (
        <div className="notices" role="status">
          {notices.map((message) => (
            <p key={message} className="notice">
              {message}
            </p>
          ))}
          {needsClipboard && clipboardUrl === null && (
            <button type="button" className="notice-action" onClick={() => void handleClipboardRetry()}>
              read clipboard
            </button>
          )}
        </div>
      )}

      <CommandHelp config={config} />
    </div>
  );
}
