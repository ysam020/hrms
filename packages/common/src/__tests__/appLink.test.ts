import { absoluteAppLink, safeAppLink } from "../appLink";

describe("safeAppLink", () => {
  it.each([
    "/approvals",
    "/helpdesk/abc123",
    "/payroll/tax-declarations/u1?tab=proofs",
  ])("keeps the app path %s", (link) => expect(safeAppLink(link)).toBe(link));

  it.each([
    "https://evil.example",
    "//evil.example/x",
    "javascript:alert(1)",
    "approvals",
    "/\\evil.example",
    "/a b",
    "/a\nb",
    "",
    "/" + "a".repeat(600),
    undefined,
    null,
    42,
  ])("rejects %p", (link) => expect(safeAppLink(link)).toBeUndefined());
});

describe("absoluteAppLink", () => {
  it("resolves against the first CLIENT_URL entry", () => {
    expect(
      absoluteAppLink(
        "/approvals",
        "https://app.praesto.in, https://localhost:5173",
      ),
    ).toBe("https://app.praesto.in/approvals");
  });

  it("ignores any path on CLIENT_URL and refuses unsafe links or bases", () => {
    expect(absoluteAppLink("/x", "https://app.praesto.in/deep/")).toBe(
      "https://app.praesto.in/x",
    );
    expect(absoluteAppLink("//evil", "https://app.praesto.in")).toBeUndefined();
    expect(absoluteAppLink("/x", undefined)).toBeUndefined();
    expect(absoluteAppLink("/x", "ftp://files")).toBeUndefined();
    expect(absoluteAppLink("/x", "not a url")).toBeUndefined();
  });
});
