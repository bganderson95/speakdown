/**
 * ApiKeyControl.tsx — the key, in the masthead, in whichever state it is in.
 *
 * Recording is impossible without a key, so this is never behind a disclosure.
 * It is also not a banner in the page: it lives next to the wordmark, where the
 * thing that says "you are set up" belongs, and it changes shape rather than
 * moving.
 *
 *   no key  ->  the field itself, marked in the accent
 *   a key   ->  a quiet chip showing the last four characters
 *
 * Removing a key returns it to the first state, which is also how you replace
 * one — there is no third state to design.
 */

import { useState } from "react";
import { looksLikeApiKey } from "./useApiKey.js";

const KEY_DASHBOARD_URL = "https://www.assemblyai.com/dashboard/api-keys";

interface ApiKeyControlProps {
  apiKey: string;
  onApiKeyChange: (value: string) => void;
}

/** Enough of the key to recognize, not enough to reuse. */
function maskKey(apiKey: string): string {
  return `••••${apiKey.slice(-4)}`;
}

/** Set up, and quiet about it. The dot is the whole status report. */
function SavedChip({
  apiKey,
  onApiKeyChange,
}: {
  apiKey: string;
  onApiKeyChange: (value: string) => void;
}) {
  return (
    <p className="key-chip" title="AssemblyAI key saved in this browser">
      <span className="key-dot" aria-hidden="true" />
      <span className="visually-hidden">AssemblyAI </span>key
      <code>{maskKey(apiKey)}</code>
      <button
        type="button"
        className="key-forget"
        title="Stored in this browser only. Forgetting it removes it from this browser."
        onClick={() => onApiKeyChange("")}
      >
        forget
      </button>
    </p>
  );
}

export function ApiKeyControl({ apiKey, onApiKeyChange }: ApiKeyControlProps) {
  const [draft, setDraft] = useState("");

  if (looksLikeApiKey(apiKey)) {
    return <SavedChip apiKey={apiKey} onApiKeyChange={onApiKeyChange} />;
  }

  // Only complain about a key that cannot become valid — a half-typed one is
  // just unfinished, the same courtesy the parser gives an unfinished command.
  const tooLong = draft.trim().length > 32;
  const ready = looksLikeApiKey(draft);

  function save(): void {
    if (looksLikeApiKey(draft)) {
      onApiKeyChange(draft);
      setDraft("");
    }
  }

  return (
    <div className="keybar">
      <label className="keybar-label" htmlFor="apikey-input">
        AssemblyAI key needed to record
      </label>

      <div className="keybar-row">
        <input
          id="apikey-input"
          className={tooLong ? "keybar-input keybar-input-bad" : "keybar-input"}
          type="password"
          value={draft}
          spellCheck={false}
          autoComplete="off"
          placeholder="Paste it here"
          aria-invalid={tooLong}
          aria-describedby="apikey-note"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              save();
            }
          }}
        />
        <button type="button" className="primary-button" onClick={save} disabled={!ready}>
          Save
        </button>
      </div>

      <p className="keybar-note" id="apikey-note">
        {tooLong ? (
          "An AssemblyAI key is 32 characters."
        ) : (
          <>
            Stored in this browser only.{" "}
            <a className="field-link" href={KEY_DASHBOARD_URL} target="_blank" rel="noopener noreferrer">
              Get a free key
            </a>
          </>
        )}
      </p>
    </div>
  );
}
