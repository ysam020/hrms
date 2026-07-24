import type { LoginMethod } from "./loginRiskAnalyzer";

interface LoginAlertEmailOptions {
  timestamp: Date;
  ip: string;
  country: string | null;
  city: string | null;
  userAgent: string;
  loginMethod: LoginMethod;
  isAnomaly: boolean;
  riskReasons: string[];
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function formatTimestamp(d: Date): string {
  return d.toUTCString().replace("GMT", "UTC");
}

function formatLocation(
  ip: string,
  city: string | null,
  country: string | null,
): string {
  const parts = [city, country]
    .filter((s): s is string => Boolean(s))
    .map(escapeHtml);
  const safeIp = escapeHtml(ip);
  return parts.length > 0 ? `${parts.join(", ")} (${safeIp})` : safeIp;
}

function formatMethod(method: LoginMethod): string {
  return method === "GOOGLE_OAUTH" ? "Google OAuth" : "Passkey (WebAuthn)";
}

const BRAND_FONT = "'Poppins','Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export function buildLoginAlertEmail(opts: LoginAlertEmailOptions): string {
  const {
    timestamp,
    ip,
    country,
    city,
    userAgent,
    loginMethod,
    isAnomaly,
    riskReasons,
  } = opts;

  const headerColor = isAnomaly ? "#c0392b" : "#2c3e50";
  const headerText = isAnomaly
    ? "Suspicious Sign-In Detected"
    : "New Sign-In to Your Account";
  const intro = isAnomaly
    ? "We detected a sign-in to your account that looks unusual. If this was you, no action is required. If you do not recognize this activity, contact your administrator immediately."
    : "We noticed a new sign-in to your account. If this was you, no action is required.";

  const reasonsBlock =
    riskReasons.length > 0
      ? `
      <tr>
        <td colspan="2" style="padding:12px 0 4px 0;">
          <strong style="color:#c0392b;">Risk signals detected:</strong>
          <ul style="margin:6px 0 0 0;padding-left:20px;color:#555;font-size:14px;">
            ${riskReasons.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}
          </ul>
        </td>
      </tr>`
      : "";

  const warningBanner = isAnomaly
    ? `
    <tr>
      <td style="padding:16px 0 0 0;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#fdf3f2;border:1px solid #e8c4c0;border-radius:6px;">
          <tr>
            <td style="padding:14px 18px;font-size:14px;color:#922b21;line-height:1.6;">
              <strong>Not you?</strong> Contact your administrator right away to secure your account.
            </td>
          </tr>
        </table>
      </td>
    </tr>`
    : "";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>${headerText}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:${BRAND_FONT};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(17,24,39,0.08);">

          <!-- Brand header -->
          <tr>
            <td style="padding:20px 32px;border-bottom:1px solid #eef0f2;">
              <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                <tr>
                  <td style="padding:0 3px 0 0;"><table cellpadding="0" cellspacing="0"><tr><td style="width:7px;height:7px;line-height:7px;font-size:0;background:#fd7624;border-radius:50%;">&nbsp;</td></tr></table></td>
                  <td style="padding:0 3px 0 0;"><table cellpadding="0" cellspacing="0"><tr><td style="width:7px;height:7px;line-height:7px;font-size:0;background:#25b37b;border-radius:50%;">&nbsp;</td></tr></table></td>
                  <td style="padding:0 3px 0 0;"><table cellpadding="0" cellspacing="0"><tr><td style="width:7px;height:7px;line-height:7px;font-size:0;background:#f03933;border-radius:50%;">&nbsp;</td></tr></table></td>
                  <td style="padding:0 0 0 8px;font-family:${BRAND_FONT};font-size:18px;font-weight:600;color:#111827;letter-spacing:0.2px;">Praesto</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Alert banner -->
          <tr>
            <td style="background:${headerColor};padding:20px 32px;">
              <p style="margin:0;color:#ffffff;font-size:18px;font-weight:600;">${headerText}</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:28px 32px;">
              <p style="margin:0 0 20px 0;font-size:15px;color:#374151;line-height:1.6;">${intro}</p>

              <!-- Details table -->
              <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
                <tr style="border-bottom:1px solid #eef0f2;">
                  <td style="padding:10px 0;color:#8a94a6;width:130px;">Time</td>
                  <td style="padding:10px 0;color:#111827;">${formatTimestamp(timestamp)}</td>
                </tr>
                <tr style="border-bottom:1px solid #eef0f2;">
                  <td style="padding:10px 0;color:#8a94a6;">Location</td>
                  <td style="padding:10px 0;color:#111827;">${formatLocation(ip, city, country)}</td>
                </tr>
                <tr style="border-bottom:1px solid #eef0f2;">
                  <td style="padding:10px 0;color:#8a94a6;">Device</td>
                  <td style="padding:10px 0;color:#111827;word-break:break-word;">${escapeHtml(userAgent)}</td>
                </tr>
                <tr style="border-bottom:1px solid #eef0f2;">
                  <td style="padding:10px 0;color:#8a94a6;">Method</td>
                  <td style="padding:10px 0;color:#111827;">${formatMethod(loginMethod)}</td>
                </tr>
                ${reasonsBlock}
              </table>

              ${warningBanner}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8f9fa;padding:18px 32px;border-top:1px solid #eef0f2;">
              <p style="margin:0;font-family:${BRAND_FONT};font-size:12px;color:#8a94a6;line-height:1.5;">
                This is an automated security notification from Praesto. Please do not reply directly to this email.
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
