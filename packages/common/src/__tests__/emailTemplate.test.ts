import { renderEmailHtml } from "../emailTemplate";

describe("renderEmailHtml", () => {
  // Gmail and most other webmail clients strip data: URI images from email
  // bodies — only a real hosted https:// image survives, so the logo must
  // be a normal URL, not inlined base64.
  it("always shows the Praesto logo as a hosted https:// image in the header", () => {
    const html = renderEmailHtml({ title: "Hi", bodyHtml: "<p>hi</p>" });
    expect(html).toContain('src="https://praesto.cloud/maskable_icon.png"');
    expect(html).toContain('alt="Praesto"');
  });

  it("shows the tenant name under the Praesto wordmark and signs off as '<Tenant> Team' when tenantName is given", () => {
    const html = renderEmailHtml({
      title: "Hi",
      bodyHtml: "<p>hi</p>",
      tenantName: "Acme Corp",
    });
    expect(html).toContain(">Acme Corp<");
    expect(html).toContain("Warm regards,<br/>Acme Corp Team");
  });

  it("falls back to 'Praesto Team' and omits the tenant line when no tenantName is given (platform-level emails)", () => {
    const html = renderEmailHtml({ title: "Hi", bodyHtml: "<p>hi</p>" });
    expect(html).toContain("Warm regards,<br/>Praesto Team");
  });

  it("lets an explicit signature override the tenantName-derived default", () => {
    const html = renderEmailHtml({
      title: "Hi",
      bodyHtml: "<p>hi</p>",
      tenantName: "Acme Corp",
      signature: "The Support Desk",
    });
    expect(html).toContain("Warm regards,<br/>The Support Desk");
  });

  it("escapes an untrusted tenantName before interpolating it into the header", () => {
    const html = renderEmailHtml({
      title: "Hi",
      bodyHtml: "<p>hi</p>",
      tenantName: "<script>alert(1)</script>",
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
