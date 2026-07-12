// Free/consumer email providers, deliberately excluded from domain-based
// tenant-join matching (packages/api-gateway tenant.ts) — otherwise any two
// unrelated people sharing e.g. gmail.com would be offered to join the same
// tenant. Not exhaustive — extend as needed.
//
// gmail.com / googlemail.com are intentionally NOT in this list: this
// deployment deliberately claims gmail.com for one specific tenant (Acme
// Corp — see set-tenant-domain.ts) so every new gmail.com signup is routed
// through the same request-to-join-and-be-approved flow as a real company
// domain, rather than being offered its own tenant. Access is still gated
// by an owner/admin approval either way, so this doesn't grant anyone
// automatic access — it only changes who they're offered to ask.
export const PUBLIC_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  "outlook.com",
  "outlook.in",
  "hotmail.com",
  "hotmail.co.uk",
  "hotmail.co.in",
  "live.com",
  "msn.com",
  "yahoo.com",
  "yahoo.co.uk",
  "yahoo.co.in",
  "ymail.com",
  "rocketmail.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "protonmail.com",
  "proton.me",
  "pm.me",
  "zoho.com",
  "gmx.com",
  "gmx.us",
  "mail.com",
  "yandex.com",
  "yandex.ru",
  "rediffmail.com",
  "hushmail.com",
  "fastmail.com",
  "tutanota.com",
  "tutanota.de",
  "inbox.com",
  "mail.ru",
  "qq.com",
  "163.com",
  "126.com",
  "sina.com",
  "naver.com",
  "web.de",
  "t-online.de",
  "orange.fr",
  "comcast.net",
  "verizon.net",
  "att.net",
]);

export function isPublicEmailDomain(domain: string): boolean {
  return PUBLIC_EMAIL_DOMAINS.has(domain.trim().toLowerCase());
}
