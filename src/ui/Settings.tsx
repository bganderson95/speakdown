/**
 * Settings.tsx — the controls that are not part of composing: whether the
 * transcript is visible, the API key, and which word escapes a command.
 *
 * Kept out of the instrument bar so that bar stays about the voice.
 */

import { ApiKeyField } from "./ApiKeyField.js";

interface SettingsProps {
  apiKey: string;
  onApiKeyChange: (value: string) => void;
  escapeInput: string;
  escapeError: string | null;
  onEscapeInputChange: (value: string) => void;
  transcriptOpen: boolean;
  onTranscriptOpenChange: (open: boolean) => void;
}

export function Settings({
  apiKey,
  onApiKeyChange,
  escapeInput,
  escapeError,
  onEscapeInputChange,
  transcriptOpen,
  onTranscriptOpenChange,
}: SettingsProps) {
  return (
    <div className="settings">
      {/*
        The transcript's visibility is controlled from here, above the panels,
        so the control is never below the thing it hides.
      */}
      <label className="toggle">
        <input
          type="checkbox"
          checked={transcriptOpen}
          onChange={(event) => onTranscriptOpenChange(event.target.checked)}
        />
        show transcript
      </label>

      <ApiKeyField apiKey={apiKey} onApiKeyChange={onApiKeyChange} />

      <label className="field">
        <span className="field-label">escape word</span>
        <input
          className={escapeError === null ? "field-input" : "field-input field-input-bad"}
          value={escapeInput}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={escapeError !== null}
          aria-describedby={escapeError === null ? undefined : "escape-error"}
          onChange={(event) => onEscapeInputChange(event.target.value)}
        />
      </label>

      {/*
        No hint sits here. The vocabulary below already explains the escape
        word, and a third item made this quiet row noisy. Only the error, which
        cannot be found anywhere else, earns the space.
      */}
      {escapeError !== null && (
        <span className="field-error" id="escape-error" role="alert">
          {escapeError}
        </span>
      )}
    </div>
  );
}
