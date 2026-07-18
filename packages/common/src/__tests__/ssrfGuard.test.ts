import dns from "dns";
import { isSafeUrl, isSafeHostname } from "../ssrfGuard";

describe("isSafeUrl", () => {
  it("accepts a normal public https URL", () => {
    expect(isSafeUrl("https://example.com/webhook")).toBe(true);
  });

  it("accepts a public IPv6 literal", () => {
    expect(isSafeUrl("https://[2606:4700:4700::1111]/x")).toBe(true);
  });

  it("rejects a malformed URL", () => {
    expect(isSafeUrl("not-a-url")).toBe(false);
  });

  it("rejects non-https by default", () => {
    expect(isSafeUrl("http://example.com")).toBe(false);
  });

  it("allows non-https when requireHttps is false", () => {
    expect(isSafeUrl("http://example.com", { requireHttps: false })).toBe(true);
  });

  it.each([
    ["localhost", "https://localhost/x"],
    ["127.x loopback", "https://127.0.0.1/x"],
    ["10.x private", "https://10.1.2.3/x"],
    ["192.168.x private", "https://192.168.1.1/x"],
    ["169.254.x link-local", "https://169.254.1.1/x"],
    ["cloud metadata IP", "https://169.254.169.254/latest/meta-data"],
    ["0.0.0.0", "https://0.0.0.0/x"],
    ["IPv6 loopback ::1", "https://[::1]/x"],
    ["IPv4-mapped IPv6", "https://[::ffff:127.0.0.1]/x"],
    ["fc00: unique-local", "https://[fc00::1]/x"],
    [
      "fd00::/8 unique-local (Docker/Cilium/Tailscale default)",
      "https://[fd12:3456::1]/x",
    ],
    ["fdff: end of ULA block", "https://[fdff:ffff::1]/x"],
    ["fe80: link-local", "https://[fe80::1]/x"],
  ])("rejects %s", (_label, url) => {
    expect(isSafeUrl(url)).toBe(false);
  });

  it.each([
    ["fbff::1", true],
    ["fe00::1", true],
  ])("fc00::/7 boundary: %s -> safe=%s", (host, expectedSafe) => {
    expect(isSafeUrl(`https://[${host}]/x`)).toBe(expectedSafe);
  });

  it.each([
    ["172.16.0.1", false],
    ["172.31.255.255", false],
    ["172.15.255.255", true],
    ["172.32.0.1", true],
  ])("172.16.0.0/12 boundary: %s -> safe=%s", (host, expectedSafe) => {
    expect(isSafeUrl(`https://${host}/x`)).toBe(expectedSafe);
  });
});

describe("isSafeHostname", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns true when every resolved address is public", async () => {
    jest
      .spyOn(dns.promises, "lookup")
      .mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as any);
    await expect(isSafeHostname("example.com")).resolves.toBe(true);
  });

  it("returns false when any resolved address is private (DNS rebinding)", async () => {
    jest.spyOn(dns.promises, "lookup").mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "169.254.169.254", family: 4 },
    ] as any);
    await expect(isSafeHostname("evil.example.com")).resolves.toBe(false);
  });

  it("returns false when the lookup resolves no addresses", async () => {
    jest.spyOn(dns.promises, "lookup").mockResolvedValue([] as any);
    await expect(isSafeHostname("nowhere.example.com")).resolves.toBe(false);
  });

  it("returns false when the lookup throws", async () => {
    jest
      .spyOn(dns.promises, "lookup")
      .mockRejectedValue(new Error("ENOTFOUND"));
    await expect(isSafeHostname("bad.example.com")).resolves.toBe(false);
  });
});
