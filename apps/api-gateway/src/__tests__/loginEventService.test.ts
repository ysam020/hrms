import { prisma } from "@hrms/db";
import { sendEmail } from "@hrms/common";
import geoip from "geoip-lite";
import { recordLoginEvent } from "../services/loginEventService";
import { analyzeLoginRisk } from "../services/loginRiskAnalyzer";

jest.mock("@hrms/db", () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    loginEvent: { findMany: jest.fn(), create: jest.fn() },
  },
}));

jest.mock("@hrms/common", () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock("geoip-lite", () => ({
  lookup: jest.fn(),
}));

jest.mock("../services/loginRiskAnalyzer", () => {
  const actual = jest.requireActual("../services/loginRiskAnalyzer");
  return { ...actual, analyzeLoginRisk: jest.fn() };
});

const db: any = prisma;
const mockGeoLookup = geoip.lookup as jest.Mock;
const mockAnalyze = analyzeLoginRisk as jest.Mock;
const mockSendEmail = sendEmail as jest.Mock;

const INPUT = {
  userId: "u1",
  ip: "203.0.113.10",
  userAgent: "Mozilla/5.0",
  loginMethod: "WEBAUTHN" as const,
};

describe("recordLoginEvent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.user.findUnique.mockResolvedValue({
      email: "jane@acme.com",
      tenantId: "t1",
    });
    db.loginEvent.findMany.mockResolvedValue([]);
    db.loginEvent.create.mockResolvedValue({});
    mockGeoLookup.mockReturnValue({
      country: "IN",
      city: "Mumbai",
      ll: [19.07, 72.87],
    });
    mockAnalyze.mockReturnValue({ score: 0, reasons: [], isAnomaly: false });
  });

  it("creates a LoginEvent row with the resolved risk score when the user has a tenant", async () => {
    mockAnalyze.mockReturnValue({
      score: 20,
      reasons: ["Sign-in from a new network"],
      isAnomaly: false,
    });
    await recordLoginEvent(INPUT);
    expect(db.loginEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "t1",
        userId: "u1",
        userEmail: "jane@acme.com",
        riskScore: 20,
        riskReasons: ["Sign-in from a new network"],
        isAnomaly: false,
      }),
    });
  });

  it("does not persist a LoginEvent when the user has no tenant yet (pending setup)", async () => {
    db.user.findUnique.mockResolvedValue({
      email: "jane@acme.com",
      tenantId: null,
    });
    await recordLoginEvent(INPUT);
    expect(db.loginEvent.create).not.toHaveBeenCalled();
  });

  it("strips the IPv4-mapped IPv6 prefix before storing/analyzing", async () => {
    await recordLoginEvent({ ...INPUT, ip: "::ffff:203.0.113.10" });
    expect(db.loginEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ip: "203.0.113.10" }),
      }),
    );
  });

  it("does not geolocate private RFC-1918 addresses", async () => {
    await recordLoginEvent({ ...INPUT, ip: "192.168.1.5" });
    expect(mockGeoLookup).not.toHaveBeenCalled();
  });

  it("does not geolocate loopback unless GEOIP_TEST_IP is set", async () => {
    delete process.env.GEOIP_TEST_IP;
    await recordLoginEvent({ ...INPUT, ip: "127.0.0.1" });
    expect(mockGeoLookup).not.toHaveBeenCalled();
  });

  it("uses GEOIP_TEST_IP to simulate a real location for loopback in dev", async () => {
    process.env.GEOIP_TEST_IP = "8.8.8.8";
    await recordLoginEvent({ ...INPUT, ip: "127.0.0.1" });
    expect(mockGeoLookup).toHaveBeenCalledWith("8.8.8.8");
    delete process.env.GEOIP_TEST_IP;
  });

  it("does not geolocate the 172.16-172.31 private range", async () => {
    await recordLoginEvent({ ...INPUT, ip: "172.20.1.1" });
    expect(mockGeoLookup).not.toHaveBeenCalled();
  });

  it("does geolocate a 172.x address outside the private range (e.g. 172.32.x)", async () => {
    await recordLoginEvent({ ...INPUT, ip: "172.32.1.1" });
    expect(mockGeoLookup).toHaveBeenCalledWith("172.32.1.1");
  });

  it("sends no email when the risk score is below the notify threshold", async () => {
    mockAnalyze.mockReturnValue({ score: 5, reasons: [], isAnomaly: false });
    await recordLoginEvent(INPUT);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("sends no email when the user has no email on file", async () => {
    db.user.findUnique.mockResolvedValue({ email: null, tenantId: "t1" });
    mockAnalyze.mockReturnValue({ score: 90, reasons: ["x"], isAnomaly: true });
    await recordLoginEvent(INPUT);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("sends a routine sign-in email at/above notify threshold but below anomaly threshold", async () => {
    mockAnalyze.mockReturnValue({
      score: 35,
      reasons: ["Sign-in from a new network"],
      isAnomaly: false,
    });
    await recordLoginEvent(INPUT);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "jane@acme.com",
        subject: "New sign-in to your account",
      }),
    );
  });

  it("sends a security-alert-subject email for an anomalous login", async () => {
    mockAnalyze.mockReturnValue({
      score: 80,
      reasons: ["Impossible travel"],
      isAnomaly: true,
    });
    await recordLoginEvent(INPUT);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "Security alert: Suspicious sign-in detected",
      }),
    );
  });

  it("does not throw when sendEmail rejects", async () => {
    mockAnalyze.mockReturnValue({ score: 90, reasons: [], isAnomaly: true });
    mockSendEmail.mockRejectedValue(new Error("SMTP down"));
    await expect(recordLoginEvent(INPUT)).resolves.toBeUndefined();
  });

  it("queries login history within the 90-day window, most recent first, capped at 50", async () => {
    await recordLoginEvent(INPUT);
    expect(db.loginEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "u1",
          timestamp: { gte: expect.any(Date) },
        }),
        orderBy: { timestamp: "desc" },
        take: 50,
      }),
    );
  });
});
