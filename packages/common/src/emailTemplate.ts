// Shared branded HTML shell for every transactional email. This is the one
// place that owns Praesto's email look (header, typography, footer) — every
// call site only supplies a title + a body fragment (h2/p/ul/strong/a), and
// picks up the brand styling for free. Built with table-based layout and
// inline styles (not flexbox/grid) because Outlook's Word rendering engine
// ignores modern CSS; this is the same constraint loginAlertEmail.ts follows.

// A base64 data: URI would render in any HTML context, but Gmail (and most
// other webmail clients) strip data: URIs from email bodies specifically —
// only a real hosted https:// image survives. This is the same PNG as
// apps/web/public/maskable_icon.png, served as a static asset off the
// deployed web app's own domain — no separate asset host to maintain.
const PRAESTO_LOGO_URL = "https://praesto.in/maskable_icon.png";

const BRAND_FONT = "'Poppins','Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const BRAND_PRIMARY = "#39a2cf";
const TEXT_DARK = "#111827";
const TEXT_BODY = "#374151";
const TEXT_MUTED = "#8a94a6";
const PAGE_BG = "#f4f6f8";

// Tenant name is admin-supplied free text — escape before interpolating into
// the header/signature so it can't break out of the surrounding markup.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function renderLogoLockup(tenantName?: string): string {
  const tenantLine = tenantName
    ? `<div style="font-family:${BRAND_FONT};font-size:12px;color:${TEXT_MUTED};line-height:1.4;">${escapeHtml(tenantName)}</div>`
    : "";
  return `
  <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
    <tr>
      <td style="padding:0 9px 0 0;vertical-align:middle;">
        <img src="${PRAESTO_LOGO_URL}" width="26" height="27" alt="Praesto" style="display:block;border:0;" />
      </td>
      <td style="vertical-align:middle;">
        <div style="font-family:${BRAND_FONT};font-size:18px;font-weight:600;color:${TEXT_DARK};letter-spacing:0.2px;line-height:1.3;">Praesto</div>
        ${tenantLine}
      </td>
    </tr>
  </table>`;
}

export function renderEmailHtml(options: {
  title: string;
  bodyHtml: string;
  /** Tenant this email is on behalf of — shown under the Praesto wordmark in
   * the header, and used to build the default "<Tenant> Team" signature.
   * Omit for platform-level emails with no tenant context (e.g. login
   * alerts, subscription notices sent directly by Praesto itself). */
  tenantName?: string;
  signature?: string;
  /** Short preview text shown next to the subject line in inbox lists (Gmail/Apple Mail). Optional — omit for none. */
  preheader?: string;
}): string {
  const signature =
    options.signature ??
    (options.tenantName ? `${options.tenantName} Team` : "Praesto Team");

  const preheaderBlock = options.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${options.preheader}</div>`
    : "";

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${options.title}</title>
<style>
  body, table, td { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
  .email-body h2 { margin:0 0 16px; font-family:${BRAND_FONT}; font-size:20px; font-weight:600; color:${TEXT_DARK}; }
  .email-body p { margin:0 0 16px; font-family:${BRAND_FONT}; font-size:15px; line-height:1.6; color:${TEXT_BODY}; }
  .email-body p:last-child { margin-bottom:0; }
  .email-body strong { color:${TEXT_DARK}; font-weight:600; }
  .email-body ul, .email-body ol { margin:0 0 16px; padding-left:20px; font-family:${BRAND_FONT}; font-size:15px; line-height:1.6; color:${TEXT_BODY}; }
  .email-body a { color:${BRAND_PRIMARY}; text-decoration:none; }
  .email-body table { border-collapse:collapse; }
</style>
</head>
<body style="margin:0;padding:0;background:${PAGE_BG};font-family:${BRAND_FONT};">
${preheaderBlock}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE_BG};padding:32px 16px;">
  <tr>
    <td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(17,24,39,0.08);">

        <!-- Header -->
        <tr>
          <td style="padding:24px 32px;border-bottom:1px solid #eef0f2;">
            ${renderLogoLockup(options.tenantName)}
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td class="email-body" style="padding:32px;">
            ${options.bodyHtml}
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;">
              <tr><td style="border-top:1px solid #eef0f2;font-size:1px;line-height:1px;">&nbsp;</td></tr>
            </table>
            <p style="margin-top:20px;font-family:${BRAND_FONT};font-size:14px;color:${TEXT_MUTED};">
              Warm regards,<br/>${escapeHtml(signature)}
            </p>
          </td>
        </tr>

        <!-- Footer — same white background as the body card above (not the
        page's outer gray) since Gmail doesn't reliably render the card's
        rounded corners/overflow:hidden, so a near-white gray here would
        otherwise blend into the outer page and look like the card just
        ends before the footer text. -->
        <tr>
          <td style="background:#ffffff;padding:18px 32px;border-top:1px solid #eef0f2;">
            <p style="margin:0;font-family:${BRAND_FONT};font-size:12px;color:${TEXT_MUTED};line-height:1.5;">
              This is an automated message from Praesto. Please do not reply directly to this email.
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}
