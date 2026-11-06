// Small fetch helpers for setup, smoke and isolation checks (not used for
// load generation, which is autocannon's job).
import { environment } from "../config/environments.js";

// The loadtest gateway uses the repo's self-signed development certificate.
// environments.js only allows localhost targets, so disabling verification
// here cannot expose a token to a remote host.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

export async function apiGet(path, token, { timeoutMs = 30_000 } = {}) {
  const t0 = performance.now();
  const res = await fetch(
    `${environment.baseUrl}${environment.apiPrefix}${path}`,
    {
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    },
  );
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {}
  return {
    status: res.status,
    headers: res.headers,
    body,
    bytes: text.length,
    ms: performance.now() - t0,
  };
}
