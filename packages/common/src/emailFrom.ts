// Resolves which of the app's two verified Resend sending identities a given
// email belongs to.
//
// Resend requires a *verified* sending domain — we cannot send
// `From: hr@<tenant's own domain>` without that tenant verifying their domain
// with Resend, which doesn't exist as a flow today. So every tenant's
// internal HR/ops mail is sent from one shared, already-verified praesto.in
// address instead, with the tenant's name in the display name and their
// own helpEmail (if set) as Reply-To — looks tenant-branded without needing
// per-tenant DNS verification. True per-tenant custom-domain sending is a
// separate future feature.
//
// Platform-level mail (billing, new-tenant welcome, security alerts — see
// the table in the email-system plan) uses PLATFORM_FROM instead.

export const PLATFORM_FROM = '"Praesto" <noreply@praesto.in>';

// Display name is the tenant name alone — no " HR" suffix/prefix, and never
// a person's name, regardless of who triggered the email (e.g. whichever HR
// staffer approved a leave request or scheduled an interview). Every
// tenant-branded email across the app goes through this one function, so
// this is the single place that formatting is enforced.
export function tenantFrom(tenantName: string): string {
  return `"${tenantName}" <hr@praesto.in>`;
}

export function tenantReplyTo(helpEmail?: string | null): string | undefined {
  return helpEmail || undefined;
}
