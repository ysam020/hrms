import { prisma } from "@hrms/db";
import {
  checkTrialEligibility,
  claimTrial,
  instrumentKey,
  trialKeysFor,
} from "../services/trial";

jest.mock("@hrms/db", () => {
  class PrismaClientKnownRequestError extends Error {
    code: string;
    constructor(message: string, { code }: { code: string }) {
      super(message);
      this.code = code;
    }
  }
  return {
    Prisma: { PrismaClientKnownRequestError },
    prisma: {
      user: { findUnique: jest.fn() },
      tenantMembership: { findFirst: jest.fn() },
      tenant: { findFirst: jest.fn() },
      trialClaim: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        deleteMany: jest.fn(),
      },
    },
    canonicalizeEmail: (e: string) => e.trim().toLowerCase(),
    getEmailDomain: (e: string) => e.split("@")[1] ?? null,
    isPublicEmailDomain: (d: string) => ["gmail.com"].includes(d),
  };
});

const db: any = prisma;
const { Prisma } = jest.requireMock("@hrms/db");

// The TrialClaim collection with its unique index on `key`, in memory.
function useClaimStore() {
  const rows = new Map<string, { subscriptionId: string }>();
  db.trialClaim.create.mockImplementation(async ({ data }: any) => {
    // Yield first so concurrent claims genuinely interleave.
    await Promise.resolve();
    if (rows.has(data.key))
      throw new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002" });
    rows.set(data.key, { subscriptionId: data.subscriptionId });
    return data;
  });
  db.trialClaim.findUnique.mockImplementation(
    async ({ where }: any) => rows.get(where.key) ?? null,
  );
  db.trialClaim.deleteMany.mockImplementation(async ({ where }: any) => {
    for (const key of where.key.in)
      if (rows.get(key)?.subscriptionId === where.subscriptionId)
        rows.delete(key);
    return {};
  });
  return rows;
}

describe("trial eligibility", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.user.findUnique.mockResolvedValue({ email: "Owner@Acme.test" });
    db.tenantMembership.findFirst.mockResolvedValue(null);
    db.tenant.findFirst.mockResolvedValue(null);
    db.trialClaim.findFirst.mockResolvedValue(null);
  });

  it("is eligible for a brand-new organisation", async () => {
    await expect(checkTrialEligibility("u1")).resolves.toEqual({
      eligible: true,
    });
  });

  it("refuses someone who already owns an organisation (existing customers included)", async () => {
    db.tenantMembership.findFirst.mockResolvedValue({ id: "m1" });
    await expect(checkTrialEligibility("u1")).resolves.toEqual({
      eligible: false,
      reason: "owns_organisation",
    });
    expect(db.tenantMembership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1", role: "owner" } }),
    );
  });

  it("refuses a company domain that already has any organisation, active or not", async () => {
    db.tenant.findFirst.mockResolvedValue({ id: "t9" });
    await expect(checkTrialEligibility("u1")).resolves.toEqual({
      eligible: false,
      reason: "domain_has_organisation",
    });
    expect(db.tenant.findFirst.mock.calls[0][0].where).toEqual({
      domain: "acme.test",
    });
  });

  it("refuses when a colleague's new account shares a domain that already had a trial", async () => {
    db.trialClaim.findFirst.mockResolvedValue({ id: "c1" });
    await expect(checkTrialEligibility("u2")).resolves.toEqual({
      eligible: false,
      reason: "trial_used",
    });
    expect(db.trialClaim.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: { in: ["user:u2", "domain:acme.test"] } },
      }),
    );
  });

  it("checks only the account (not the domain) for free-mail signups", async () => {
    db.user.findUnique.mockResolvedValue({ email: "someone@gmail.com" });
    await checkTrialEligibility("u1");
    expect(db.tenant.findFirst).not.toHaveBeenCalled();
    await expect(trialKeysFor("u1")).resolves.toEqual(["user:u1"]);
  });

  it("skips claims and ignores its own tenant when buildTenant re-checks a retried signup", async () => {
    await checkTrialEligibility("u1", {
      claims: false,
      subscriptionId: "sub_1",
    });
    expect(db.trialClaim.findFirst).not.toHaveBeenCalled();
    expect(db.tenant.findFirst.mock.calls[0][0].where).toEqual({
      domain: "acme.test",
      NOT: { razorpaySubscriptionId: "sub_1" },
    });
  });
});

describe("instrumentKey", () => {
  it("hashes a UPI handle case-insensitively and never stores it raw", () => {
    const a = instrumentKey("upi", "Owner@OKHDFC");
    expect(a).toBe(instrumentKey("upi", "owner@okhdfc"));
    expect(a).toMatch(/^instrument:[0-9a-f]{64}$/);
    expect(a).not.toContain("okhdfc");
  });

  it("ignores methods without a stable identifier", () => {
    expect(instrumentKey("emandate", "HDFC Bank")).toBeNull();
    expect(instrumentKey("upi", "UPI")).toBeNull();
  });
});

describe("claimTrial", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("claims every key for a first trial", async () => {
    const rows = useClaimStore();
    await expect(
      claimTrial(["user:u1", "domain:acme.test"], "sub_1", "u1"),
    ).resolves.toBe(true);
    expect([...rows.keys()]).toEqual(["user:u1", "domain:acme.test"]);
  });

  it("lets a retry of the same signup re-claim its own keys", async () => {
    useClaimStore();
    await claimTrial(["user:u1", "domain:acme.test"], "sub_1", "u1");
    await expect(
      claimTrial(["user:u1", "domain:acme.test"], "sub_1", "u1"),
    ).resolves.toBe(true);
  });

  it("refuses a second organisation sharing any signal and rolls back its partial claims", async () => {
    const rows = useClaimStore();
    await claimTrial(["user:u1", "instrument:abc"], "sub_1", "u1");

    // A new account, same UPI handle.
    await expect(
      claimTrial(["user:u2", "instrument:abc"], "sub_2", "u2"),
    ).resolves.toBe(false);
    expect(rows.has("user:u2")).toBe(false);
    expect(rows.get("instrument:abc")?.subscriptionId).toBe("sub_1");
  });

  it("lets exactly one of two concurrent signups for the same company win", async () => {
    const rows = useClaimStore();
    const results = await Promise.all([
      claimTrial(["user:u1", "domain:acme.test"], "sub_1", "u1"),
      claimTrial(["user:u2", "domain:acme.test"], "sub_2", "u2"),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    const winner = results[0] ? "sub_1" : "sub_2";
    for (const row of rows.values()) expect(row.subscriptionId).toBe(winner);
  });

  it("releases its claims and rethrows on an unexpected database error", async () => {
    const rows = useClaimStore();
    db.trialClaim.create
      .mockImplementationOnce(async ({ data }: any) => {
        rows.set(data.key, { subscriptionId: data.subscriptionId });
      })
      .mockRejectedValueOnce(new Error("db down"));
    await expect(
      claimTrial(["user:u1", "domain:acme.test"], "sub_1", "u1"),
    ).rejects.toThrow("db down");
    expect(rows.size).toBe(0);
  });
});
