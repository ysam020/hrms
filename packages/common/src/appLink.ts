// Deep links carried by notifications (bell rows, push taps, emails) point
// into the web app. They are stored and sent as app-relative paths so a
// notification can never become an open redirect or a javascript: URL, and
// only turned into an absolute URL at the edge that needs one (FCM's
// webpush.fcmOptions.link, email buttons).

const MAX_LINK_LENGTH = 512;

/**
 * Returns `link` if it is a same-app path ("/approvals",
 * "/helpdesk/abc?tab=comments"), otherwise undefined. Rejects absolute and
 * protocol-relative URLs ("//evil.example"), backslash tricks, whitespace and
 * control characters.
 */
export function safeAppLink(link: unknown): string | undefined {
  if (typeof link !== "string") return undefined;
  if (link.length === 0 || link.length > MAX_LINK_LENGTH) return undefined;
  if (!link.startsWith("/") || link.startsWith("//")) return undefined;
  if (/[\\\s\u0000-\u001f\u007f]/.test(link)) return undefined;
  return link;
}

/**
 * `link` resolved against the web app's origin, or undefined if either is
 * unusable. CLIENT_URL is a comma-separated CORS list; its first entry is the
 * app's canonical origin (same rule as leadNotifications/supportNotifications).
 */
export function absoluteAppLink(
  link: unknown,
  clientUrl: string | undefined = process.env.CLIENT_URL,
): string | undefined {
  const path = safeAppLink(link);
  const first = clientUrl?.split(",")[0]?.trim();
  if (!path || !first) return undefined;
  try {
    const base = new URL(first);
    if (base.protocol !== "https:" && base.protocol !== "http:")
      return undefined;
    return new URL(path, base.origin).toString();
  } catch {
    return undefined;
  }
}
