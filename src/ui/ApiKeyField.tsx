/**
 * ApiKeyField.tsx — where the viewer supplies their own AssemblyAI key.
 *
 * Recording is impossible without one on a deployed copy, so this sits in the
 * controls row rather than behind a settings panel. It says where the key is
 * kept, because a field that silently swallows a credential is not honest.
 */

import { useState } from "react";
import { looksLikeApiKey } from "./useApiKey.js";

/** Where a viewer gets a key of their own. */
const KEY_DASHBOARD_URL = "https://www.assemblyai.com/dashboard/api-keys";

interface ApiKeyFieldProps {
  apiKey: string;
  onApiKeyChange: (value: string) => void;
}

/** "…" plus the last four characters: enough to recognize, not to reuse. */
function maskKey(apiKey: string): string {
  return `…${apiKey.slice(-4)}`;
}

export function ApiKeyField({ apiKey, onApiKeyChange }: ApiKeyFieldProps) {
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);

  const saved = looksLikeApiKey(apiKey);
  const draftIsBad = draft.trim().length > 0 && !looksLikeApiKey(draft);

  function save(): void {
    if (!looksLikeApiKey(draft)) {
      return;
    }
    onApiKeyChange(draft);
    setDraft("");
    setEditing(false);
  }

  if (saved && !editing) {
    return (
      <span className="apikey">
        <span className="field-label">api key</span>
        <code className="apikey-mask">{maskKey(apiKey)}</code>
        <button type="button" className="link-button" onClick={() => setEditing(true)}>
          replace
        </button>
        <button
          type="button"
          className="link-button"
          onClick={() => {
            onApiKeyChange("");
            setDraft("");
          }}
        >
          forget
        </button>
      </span>
    );
  }

  return (
    <span className="apikey">
      <label className="field">
        <span className="field-label">api key</span>
        <input
          className={draftIsBad ? "field-input field-input-wide field-input-bad" : "field-input field-input-wide"}
          type="password"
          value={draft}
          spellCheck={false}
          autoComplete="off"
          placeholder="your AssemblyAI key"
          title="Kept in this browser only. It is sent to this app's token endpoint to mint a 60-second streaming token, and stored nowhere else."
          aria-invalid={draftIsBad}
          aria-describedby={draftIsBad ? "apikey-note" : undefined}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              save();
            }
          }}
        />
      </label>

      {draft.trim().length === 0 ? (
        <a
          className="field-link"
          href={KEY_DASHBOARD_URL}
          target="_blank"
          rel="noopener noreferrer"
          title="Opens your AssemblyAI dashboard, where you can copy a key"
        >
          get a key
        </a>
      ) : draftIsBad ? (
        <span className="field-note" id="apikey-note">
          keys are 32 hex characters
        </span>
      ) : (
        <button type="button" className="link-button" onClick={save}>
          save
        </button>
      )}
    </span>
  );
}
