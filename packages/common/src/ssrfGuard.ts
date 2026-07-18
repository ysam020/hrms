import dns from "dns";

// SSRF protection — block requests to private/loopback/link-local address
// ranges, including the cloud instance-metadata IP (169.254.169.254 falls
// inside 169.254.0.0/16) and IPv4-mapped IPv6 addresses (::ffff:127.0.0.1
// etc). Originally lived duplicated (and less completely — missing
// 169.254.*/fc00:/fe80:) in webhooks.ts; consolidated here so every
// outbound-URL feature (chat link previews, tenant webhooks, ...) gets the
// same coverage instead of each reinventing its own subset.
const PRIVATE_IP_RE =
  /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0|::1|::ffff:|fe80:)/i;

// IPv6 Unique Local Address block fc00::/7 — every address in range has a
// first group between 0xfc00 and 0xfdff, i.e. starting with hex "fc" or
// "fd". A literal "fc00:" prefix match (the previous check) missed the far
// more common "fd00::/8" half of the block that Kubernetes/Cilium/Docker/
// Tailscale actually default to.
const IPV6_ULA_RE = /^(fc|fd)[0-9a-f]{2}:/i;

function isPrivateIp(host: string): boolean {
  if (PRIVATE_IP_RE.test(host) || IPV6_ULA_RE.test(host)) return true;
  // 172.16.0.0/12
  const m = host.match(/^172\.(\d+)\./);
  return !!m && parseInt(m[1], 10) >= 16 && parseInt(m[1], 10) <= 31;
}

/**
 * Hostname/protocol-level check — cheap, synchronous, catches the obvious
 * cases. Does NOT protect against DNS rebinding (a hostname that resolves
 * to a private/metadata IP only at request time) — pair with
 * isSafeHostname() below, called again immediately before the request is
 * actually sent.
 */
export function isSafeUrl(
  raw: string,
  { requireHttps = true }: { requireHttps?: boolean } = {},
): boolean {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  if (requireHttps && parsed.protocol !== "https:") return false;
  // URL#hostname wraps IPv6 literals in brackets (e.g. "[::1]", "[fc00::1]") —
  // strip them before testing against PRIVATE_IP_RE, which matches on the
  // bare address and would otherwise never match a bracketed IPv6 host.
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return !isPrivateIp(hostname);
}

/**
 * Resolves the hostname and checks every returned address — prevents
 * DNS-rebinding SSRF (a domain that's public at validation time but is
 * re-pointed at a private/metadata IP before — or at — request time).
 * Callers must call this again right before making the request, not just
 * once at registration/creation time, since DNS can change in between.
 */
export async function isSafeHostname(hostname: string): Promise<boolean> {
  try {
    const addresses = await dns.promises.lookup(hostname, { all: true });
    if (addresses.length === 0) return false;
    return addresses.every(({ address }) => !isPrivateIp(address));
  } catch {
    return false;
  }
}
