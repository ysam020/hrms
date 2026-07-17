import { buildLoginAlertEmail } from "../services/loginAlertEmail";

const BASE_OPTS = {
  timestamp: new Date("2026-06-15T10:00:00Z"),
  ip: "203.0.113.10",
  country: "IN",
  city: "Mumbai",
  userAgent: "Mozilla/5.0",
  loginMethod: "WEBAUTHN" as const,
  isAnomaly: false,
  riskReasons: [] as string[],
};

describe("buildLoginAlertEmail", () => {
  it("uses the normal (non-alarming) header/intro copy for a non-anomalous login", () => {
    const html = buildLoginAlertEmail(BASE_OPTS);
    expect(html).toContain("New Sign-In to Your Account");
    expect(html).not.toContain("Suspicious Sign-In Detected");
    expect(html).not.toContain("Not you?");
  });

  it("uses the alarming header/intro copy and a warning banner for an anomalous login", () => {
    const html = buildLoginAlertEmail({ ...BASE_OPTS, isAnomaly: true });
    expect(html).toContain("Suspicious Sign-In Detected");
    expect(html).toContain("Not you?");
    expect(html).toContain("#c0392b"); // alarm header color
  });

  it("renders a risk-signals list when reasons are present", () => {
    const html = buildLoginAlertEmail({
      ...BASE_OPTS,
      isAnomaly: true,
      riskReasons: [
        "First sign-in from US",
        "Sign-in from an unrecognized device",
      ],
    });
    expect(html).toContain("Risk signals detected");
    expect(html).toContain("First sign-in from US");
    expect(html).toContain("Sign-in from an unrecognized device");
  });

  it("omits the risk-signals block when there are no reasons", () => {
    const html = buildLoginAlertEmail(BASE_OPTS);
    expect(html).not.toContain("Risk signals detected");
  });

  it("formats location as 'city, country (ip)' when both are known", () => {
    const html = buildLoginAlertEmail(BASE_OPTS);
    expect(html).toContain("Mumbai, IN (203.0.113.10)");
  });

  it("falls back to just the IP when city/country are unknown", () => {
    const html = buildLoginAlertEmail({
      ...BASE_OPTS,
      city: null,
      country: null,
    });
    expect(html).toContain(">203.0.113.10<");
  });

  it("labels GOOGLE_OAUTH and WEBAUTHN methods distinctly", () => {
    expect(
      buildLoginAlertEmail({ ...BASE_OPTS, loginMethod: "GOOGLE_OAUTH" }),
    ).toContain("Google OAuth");
    expect(
      buildLoginAlertEmail({ ...BASE_OPTS, loginMethod: "WEBAUTHN" }),
    ).toContain("Passkey (WebAuthn)");
  });

  it("escapes HTML-significant characters in user-controlled fields (XSS guard)", () => {
    const html = buildLoginAlertEmail({
      ...BASE_OPTS,
      userAgent: `<script>alert('xss')</script>`,
      city: `<img src=x onerror="alert(1)">`,
    });
    expect(html).not.toContain("<script>alert('xss')</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain('<img src=x onerror="alert(1)">');
  });

  it("formats the timestamp as a UTC string", () => {
    const html = buildLoginAlertEmail(BASE_OPTS);
    expect(html).toContain("15 Jun 2026");
    expect(html).toContain("UTC");
  });
});
