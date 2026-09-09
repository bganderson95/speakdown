/**
 * assemblyaiBrowser.ts — the browser implementations of everything the session
 * needs from the outside world.
 *
 * Every impure thing a live session touches — the network, a WebSocket, the
 * microphone — is reached through here, so createAssemblyAISource() can be
 * driven entirely by fakes in tests.
 */

import type { StreamingDependencies, StreamingSocket } from "./assemblyai.js";
import { openMicrophone } from "./microphone.js";

/**
 * The header the browser uses to present its own AssemblyAI key.
 *
 * Declared here rather than imported from server/, which would breach the
 * import boundary in CLAUDE.md §4. A test asserts this matches the server's
 * copy, so the two cannot drift.
 *
 * It lives in this file, the only one that sends it, so that assemblyai.ts and
 * this module do not import values from each other.
 */
export const API_KEY_HEADER = "x-assemblyai-key";

/**
 * Asks our own backend for a temporary streaming token.
 *
 * The user's key is sent per-request and never stored server-side. It has to
 * make this one hop because AssemblyAI's token endpoint sends no CORS headers,
 * so the browser cannot call it directly.
 */
async function fetchTokenFromBackend(endpoint: string, apiKey: string | null): Promise<string> {
  const headers: Record<string, string> = {};
  if (apiKey !== null && apiKey.trim().length > 0) {
    headers[API_KEY_HEADER] = apiKey.trim();
  }

  let response: Response;
  try {
    response = await fetch(endpoint, { headers });
  } catch {
    throw new Error(`Could not reach the token endpoint at ${endpoint}.`);
  }

  if (!response.ok) {
    // The endpoint puts a readable reason in { error }; show that rather than
    // a status code the user can do nothing with.
    const raw = (await response.text()).slice(0, 400);
    let message = raw;
    try {
      const parsed: unknown = JSON.parse(raw);
      const reason = (parsed as { error?: unknown }).error;
      if (typeof reason === "string") {
        message = reason;
      }
    } catch {
      // Not JSON; the raw body is the best we have.
    }
    throw new Error(message);
  }

  // A static host with no function deployed answers this route with the app's
  // own index.html, so a 200 is not proof of an endpoint. Say what is actually
  // wrong rather than letting a JSON parse error surface.
  const raw = await response.text();
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new Error(
      `No token endpoint is deployed at ${endpoint}. Deploy the function in api/ alongside the site.`,
    );
  }

  if (
    typeof payload !== "object" ||
    payload === null ||
    typeof (payload as { token?: unknown }).token !== "string"
  ) {
    throw new Error("Token endpoint did not return a token.");
  }
  return (payload as { token: string }).token;
}

/** Wraps a real WebSocket in the small StreamingSocket interface. */
function openBrowserSocket(url: string): StreamingSocket {
  const socket = new WebSocket(url);
  socket.binaryType = "arraybuffer";

  const wrapper: StreamingSocket = {
    send(data) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(data);
      }
    },
    close() {
      socket.close();
    },
    onopen: null,
    onmessage: null,
    onerror: null,
    onclose: null,
  };

  socket.onopen = () => wrapper.onopen?.();
  socket.onmessage = (event: MessageEvent<string>) => wrapper.onmessage?.(event.data);
  socket.onerror = () => wrapper.onerror?.("The streaming connection failed.");
  socket.onclose = () => wrapper.onclose?.();

  return wrapper;
}

export const BROWSER_DEPENDENCIES: StreamingDependencies = {
  fetchToken: fetchTokenFromBackend,
  openSocket: openBrowserSocket,
  openMicrophone,
};

