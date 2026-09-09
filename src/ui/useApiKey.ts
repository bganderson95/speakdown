/**
 * useApiKey.ts — the viewer's own AssemblyAI key.
 *
 * WHERE IT LIVES: this browser's localStorage, and nowhere else. It is never
 * sent anywhere except to this app's own token endpoint, which exchanges it for
 * a sixty-second streaming token and forgets it.
 *
 * THE TRADE: a key in localStorage is readable by any script running on this
 * origin, so it is only as safe as the page it sits on. That is the accepted
 * shape for bring-your-own-key tools — the alternative is retyping it every
 * reload — but the interface says plainly where it is kept and offers a way to
 * remove it.
 */

import { useCallback, useState } from "react";

const STORAGE_KEY = "speakdown.assemblyai-key";

/** An AssemblyAI key is 32 hex characters. */
export function looksLikeApiKey(value: string): boolean {
  return /^[0-9a-f]{32}$/i.test(value.trim());
}

/** Reading storage can throw in private modes, so every access is guarded. */
function readStoredKey(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export interface ApiKeyState {
  /** The saved key, or "" when none is set. */
  apiKey: string;
  /** Saves a key, or clears it when given something blank. */
  setApiKey: (value: string) => void;
  /** True when a key is saved and well-formed. */
  hasApiKey: boolean;
}

export function useApiKey(): ApiKeyState {
  const [apiKey, setStoredKey] = useState<string>(() => {
    if (typeof window === "undefined") {
      return "";
    }
    return readStoredKey();
  });

  const setApiKey = useCallback((value: string) => {
    const trimmed = value.trim();
    setStoredKey(trimmed);
    try {
      if (trimmed.length === 0) {
        window.localStorage.removeItem(STORAGE_KEY);
      } else {
        window.localStorage.setItem(STORAGE_KEY, trimmed);
      }
    } catch {
      // Storage unavailable: the key still works for this session.
    }
  }, []);

  return { apiKey, setApiKey, hasApiKey: looksLikeApiKey(apiKey) };
}
