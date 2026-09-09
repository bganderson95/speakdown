/**
 * assemblyaiToken.ts — a dev/preview server endpoint that mints short-lived
 * AssemblyAI streaming tokens.
 *
 * The AssemblyAI API key must never be shipped to the browser. The key lives in
 * the server environment (.env.local, which is gitignored); the browser calls
 * GET /api/assemblyai-token and receives a token that expires in a minute.
 *
 * This runs only in `vite dev` and `vite preview`. Deploying Speakdown for real
 * means reimplementing this one endpoint on whatever backend you host, with the
 * same contract:  200 { token }  or  a non-200 with { error }.
 */

import type { Connect, Plugin } from "vite";

export const TOKEN_ROUTE = "/api/assemblyai-token";

const TOKEN_URL = "https://streaming.assemblyai.com/v3/token";

/** How long the browser has to open the socket with this token. */
const EXPIRES_IN_SECONDS = 60;

interface TokenPluginOptions {
  /** The AssemblyAI API key, read from the server environment. */
  apiKey: string | undefined;
}

function sendJson(response: Parameters<Connect.NextHandleFunction>[1], status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
}

/** Asks AssemblyAI for a temporary token using the server-side API key. */
async function mintToken(apiKey: string): Promise<{ status: number; body: unknown }> {
  const url = new URL(TOKEN_URL);
  url.searchParams.set("expires_in_seconds", String(EXPIRES_IN_SECONDS));

  let response: Response;
  try {
    response = await fetch(url, { headers: { authorization: apiKey } });
  } catch (error) {
    return {
      status: 502,
      body: { error: `Could not reach AssemblyAI: ${error instanceof Error ? error.message : ""}` },
    };
  }

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    // Always 502, never AssemblyAI's own status. Forwarding their 404 for a bad
    // key would read as "this endpoint does not exist" on our side; a non-200
    // from this route should always mean "could not get you a token", with the
    // reason in the body.
    return {
      status: 502,
      body: { error: `AssemblyAI rejected the token request (${response.status}): ${detail}` },
    };
  }

  const payload: unknown = await response.json();
  const token = (payload as { token?: unknown }).token;
  if (typeof token !== "string") {
    return { status: 502, body: { error: "AssemblyAI did not return a token." } };
  }

  return { status: 200, body: { token, expires_in_seconds: EXPIRES_IN_SECONDS } };
}

export function assemblyaiTokenPlugin(options: TokenPluginOptions): Plugin {
  const handler: Connect.NextHandleFunction = (request, response, next) => {
    // Compare only the path; a query string would otherwise miss the route.
    const path = (request.url ?? "").split("?")[0];
    if (path !== TOKEN_ROUTE) {
      next();
      return;
    }

    const apiKey = options.apiKey?.trim();
    if (apiKey === undefined || apiKey.length === 0) {
      sendJson(response, 503, {
        error:
          "ASSEMBLYAI_API_KEY is not set. Copy .env.example to .env.local, add your key, and restart the dev server.",
      });
      return;
    }

    void mintToken(apiKey).then(
      (result) => sendJson(response, result.status, result.body),
      (error: unknown) =>
        sendJson(response, 500, {
          error: error instanceof Error ? error.message : "Token request failed.",
        }),
    );
  };

  return {
    name: "speakdown:assemblyai-token",
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}
