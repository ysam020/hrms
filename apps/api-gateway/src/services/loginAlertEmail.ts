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
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:${headerColor};padding:28px 32px;">
              <p style="margin:0;color:#ffffff;font-size:20px;font-weight:bold;">${headerText}</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:28px 32px;">
              <p style="margin:0 0 20px 0;font-size:15px;color:#444;line-height:1.6;">${intro}</p>

              <!-- Details table -->
              <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
                <tr style="border-bottom:1px solid #eee;">
                  <td style="padding:10px 0;color:#888;width:130px;">Time</td>
                  <td style="padding:10px 0;color:#222;">${formatTimestamp(timestamp)}</td>
                </tr>
                <tr style="border-bottom:1px solid #eee;">
                  <td style="padding:10px 0;color:#888;">Location</td>
                  <td style="padding:10px 0;color:#222;">${formatLocation(ip, city, country)}</td>
                </tr>
                <tr style="border-bottom:1px solid #eee;">
                  <td style="padding:10px 0;color:#888;">Device</td>
                  <td style="padding:10px 0;color:#222;word-break:break-word;">${escapeHtml(userAgent)}</td>
                </tr>
                <tr style="border-bottom:1px solid #eee;">
                  <td style="padding:10px 0;color:#888;">Method</td>
                  <td style="padding:10px 0;color:#222;">${formatMethod(loginMethod)}</td>
                </tr>
                ${reasonsBlock}
              </table>

              ${warningBanner}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8f9fa;padding:18px 32px;border-top:1px solid #eee;">
              <p style="margin:0;font-size:13px;color:#999;line-height:1.5;">
                This is an automated security notification from Praesto.<br/>
                Do not reply to this email.
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
