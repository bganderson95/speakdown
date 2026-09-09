/**
 * api/assemblyai-token.ts — the deployed token endpoint.
 *
 * DELIBERATELY HAS NO KEY OF ITS OWN. Every caller must present their own
 * AssemblyAI key; there is no environment fallback here, so a public
 * deployment can never spend the maintainer's quota.
 *
 * Written against the standard Request/Response signature, so it runs as a
 * Vercel Edge Function as-is and needs only a thin adapter elsewhere.
 */

import { API_KEY_HEADER, MISSING_KEY_MESSAGE, mintToken } from "../server/mintToken.js";

export const config = { runtime: "edge" };

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export default async function handler(request: Request): Promise<Response> {
  const apiKey = request.headers.get(API_KEY_HEADER);
  if (apiKey === null || apiKey.trim().length === 0) {
    return json(401, { error: MISSING_KEY_MESSAGE });
  }

  const result = await mintToken(apiKey);
  return json(result.status, result.body);
}
