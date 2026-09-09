/**
 * assemblyaiToken.ts — the dev server's token endpoint.
 *
 * Same contract as the deployed function in api/assemblyai-token.ts, with one
 * deliberate difference: **in `vite dev` only**, a request that carries no key
 * of its own falls back to ASSEMBLYAI_API_KEY from .env.local, so working on
 * the app locally does not mean pasting a key into the UI every time.
 *
 * That fallback exists in `vite dev` and nowhere else. `vite preview` serves
 * the production build and deliberately does NOT register this middleware, so
 * previewing locally exercises the same "bring your own key" path a real
 * deployment does.
 */

import type { Connect, Plugin } from "vite";
import { API_KEY_HEADER, MISSING_KEY_MESSAGE, mintToken } from "../server/mintToken.js";

export const TOKEN_ROUTE = "/api/assemblyai-token";

interface TokenPluginOptions {
  /** Server-side key from the environment. Dev convenience only. */
  apiKey: string | undefined;
}

function sendJson(
  response: Parameters<Connect.NextHandleFunction>[1],
  status: number,
  body: unknown,
): void {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
}

/** The key a request should use: the caller's own, else the dev environment. */
function resolveKey(request: Connect.IncomingMessage, envKey: string | undefined): string | null {
  const header = request.headers[API_KEY_HEADER];
  const supplied = Array.isArray(header) ? header[0] : header;
  if (supplied !== undefined && supplied.trim().length > 0) {
    return supplied.trim();
  }

  const fallback = envKey?.trim();
  return fallback !== undefined && fallback.length > 0 ? fallback : null;
}

export function assemblyaiTokenPlugin(options: TokenPluginOptions): Plugin {
  const handler: Connect.NextHandleFunction = (request, response, next) => {
    // Compare only the path; a query string would otherwise miss the route.
    const path = (request.url ?? "").split("?")[0];
    if (path !== TOKEN_ROUTE) {
      next();
      return;
    }

    const apiKey = resolveKey(request, options.apiKey);
    if (apiKey === null) {
      sendJson(response, 401, {
        error: `${MISSING_KEY_MESSAGE} For local development you can instead put ASSEMBLYAI_API_KEY in .env.local and restart the dev server.`,
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
    // configureServer only: `vite preview` must behave like a deployment.
    configureServer(server) {
      server.middlewares.use(handler);
    },
  };
}
