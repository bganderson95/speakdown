/**
 * mintToken.ts — exchanges an AssemblyAI API key for a short-lived streaming
 * token. Shared by the dev server and the deployed function so both behave
 * identically.
 *
 * WHY THIS HAS TO EXIST AT ALL: AssemblyAI's token endpoint sends no CORS
 * headers and answers OPTIONS with 405, so a browser cannot call it directly
 * even when the user is holding their own key. Something server-side has to
 * make that one request.
 *
 * The key passes through and is never stored, never logged, and never returned.
 */

const TOKEN_URL = "https://streaming.assemblyai.com/v3/token";

/** How long the browser has to open the socket with this token. */
const EXPIRES_IN_SECONDS = 60;

/** The header a browser uses to supply its own key. */
export const API_KEY_HEADER = "x-assemblyai-key";

export interface TokenResult {
  status: number;
  body: { token: string; expires_in_seconds: number } | { error: string };
}

/** An AssemblyAI key is 32 hex characters. Reject anything else before use. */
export function looksLikeApiKey(value: string): boolean {
  return /^[0-9a-f]{32}$/i.test(value.trim());
}

export const MISSING_KEY_MESSAGE =
  "This deployment has no API key of its own. Add your AssemblyAI key in the app to start recording.";

export const MALFORMED_KEY_MESSAGE =
  "That does not look like an AssemblyAI key. They are 32 hexadecimal characters.";

/**
 * Mints a token. Never throws: every failure comes back as a status and a
 * message the interface can show.
 */
export async function mintToken(apiKey: string): Promise<TokenResult> {
  if (!looksLikeApiKey(apiKey)) {
    return { status: 400, body: { error: MALFORMED_KEY_MESSAGE } };
  }

  const url = new URL(TOKEN_URL);
  url.searchParams.set("expires_in_seconds", String(EXPIRES_IN_SECONDS));

  let response: Response;
  try {
    response = await fetch(url, { headers: { authorization: apiKey.trim() } });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "";
    return { status: 502, body: { error: `Could not reach AssemblyAI. ${detail}`.trim() } };
  }

  if (!response.ok) {
    // Always 502, never AssemblyAI's own status: their 404 for a bad key would
    // read as "this endpoint does not exist" on our side. The reason goes in
    // the body, where the interface can show it.
    const detail = (await response.text()).slice(0, 300);
    return {
      status: 502,
      body: { error: `AssemblyAI rejected the key (${response.status}): ${detail}` },
    };
  }

  const payload: unknown = await response.json();
  const token = (payload as { token?: unknown }).token;
  if (typeof token !== "string") {
    return { status: 502, body: { error: "AssemblyAI did not return a token." } };
  }

  return { status: 200, body: { token, expires_in_seconds: EXPIRES_IN_SECONDS } };
}
