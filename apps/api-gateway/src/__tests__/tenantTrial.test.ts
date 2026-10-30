// Trial signup through createTenant → buildTenant. Razorpay, the database
// and the trial-claim store are all mocked: the tests assert what would be
// written, never touch a real account or DB.

jest.mock("@hrms/db", () => {
  const _db = {
    user: { findUnique: jest.fn(), update: jest.fn() },
    tenant: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
    tenantMembership: { findFirst: jest.fn(), create: jest.fn() },
  };
  return {
    prisma: _db,
    prismaWithTenant: _db,
    Prisma: { PrismaClientKnownRequestError: class extends Error {} },
    getClientForDb: jest.fn(() => ({
      $runCommandRaw: jest.fn().mockResolvedValue({}),
      tenantSettings: { create: jest.fn().mockResolvedValue({}) },
    })),
    canonicalizeEmail: (e: string) => e.toLowerCase(),
    getEmailDomain: (e: string) => e.split("@")[1] ?? "",
    isPublicEmailDomain: jest.fn().mockReturnValue(false),
    runWithTenant: jest.fn((_t: any, _c: any, fn: any) => fn()),
    recordAuditEntry: jest.fn(),
    AuditActor: {},
  };
});

jest.mock("@hrms/common", () => ({
  apiResponse: jest.fn((res: any, status: number, data: any) =>
    res.json({ status, ...data }),
  ),
  RESPONSE_STATUS: {
    SUCCESS: 200,
    BAD_REQUEST: 400,
    NOT_FOUND: 404,
    FORBIDDEN: 403,
    CONFLICT: 409,
  },
  sendEmail: jest.fn(),
  tenantFrom: jest.fn(),
  tenantReplyTo: jest.fn(),
  PLATFORM_FROM: '"Praesto" <hr@praesto.in>',
  renderEmailHtml: jest.fn(({ bodyHtml }: { bodyHtml: string }) => bodyHtml),
  hasPrivilegedRole: jest.fn(),
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock("@hrms/notifications", () => ({
  notify: jest.fn().mockResolvedValue({ notificationId: "n1", jobIds: {} }),
}));

jest.mock("@hrms/crypto", () => ({ aesEncrypt: (v: string) => `enc(${v})` }));

jest.mock("../handlers/salary", () => ({ seedSalaryFromHire: jest.fn() }));

const mockSubFetch = jest.fn();
const mockSubCancel = jest.fn();
jest.mock("../handlers/payment", () => ({
  getRazorpay: () => ({
    subscriptions: { fetch: mockSubFetch, cancel: mockSubCancel },
  }),
  fetchPaymentMethod: jest.fn(),
}));

jest.mock("../services/tenantTokenStore", () => ({
  storeRefreshToken: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../services/trial", () => ({
  ...jest.requireActual("../services/trial"),
  checkTrialEligibility: jest.fn(),
  claimTrial: jest.fn(),
  trialKeysFor: jest.fn(),
}));

import { createHmac } from "crypto";
import { prisma } from "@hrms/db";
import { notify } from "@hrms/notifications";
import { fetchPaymentMethod } from "../handlers/payment";
import {
  checkTrialEligibility,
  claimTrial,
  instrumentKey,
  trialKeysFor,
} from "../services/trial";
import { createTenant } from "../handlers/tenant";

const db: any = prisma;
const mockEligibility = checkTrialEligibility as jest.Mock;
const mockClaim = claimTrial as jest.Mock;
const mockKeys = trialKeysFor as jest.Mock;
const mockFetchPaymentMethod = fetchPaymentMethod as jest.Mock;
const mockNotify = notify as jest.Mock;
const DAY_MS = 24 * 60 * 60 * 1000;

const makeRes = () => ({ json: jest.fn(), cookie: jest.fn() }) as any;
const body = (res: any) => res.json.mock.calls[0][0];

function signupReq(overrides: Record<string, unknown> = {}) {
  const razorpayPaymentId = "pay_auth";
  const razorpaySubscriptionId = "sub_trial";
  return {
    user: { userId: "u1" },
    ip: "127.0.0.1",
    socket: {},
    headers: {},
    body: {
      name: "Acme",
      billing: "monthly",
      // Client-supplied — a trial must ignore it in favour of its notes.
      planTier: "enterprise",
      razorpayPaymentId,
      razorpaySubscriptionId,
      razorpaySignature: createHmac("sha256", "key_secret")
        .update(`${razorpayPaymentId}|${razorpaySubscriptionId}`)
        .digest("hex"),
      ...overrides,
    },
  } as any;
}

const trialSubscription = (overrides: Record<string, unknown> = {}) => ({
  id: "sub_trial",
  status: "authenticated",
  start_at: Math.floor((Date.now() + 14 * DAY_MS) / 1000),
  notes: {
    purpose: "trial_signup",
    userId: "u1",
    planTier: "growth",
    billing: "annual",
  },
  ...overrides,
});

describe("createTenant — free trial signup", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.RAZORPAY_KEY_SECRET = "key_secret";
    process.env.ACCESS_JWT_TOKEN = "access";
    process.env.REFRESH_TOKEN = "refresh";
    db.tenant.findFirst.mockResolvedValue(null);
    db.tenant.findUnique.mockResolvedValue(null);
    db.tenant.create.mockImplementation(async ({ data }: any) => ({
      id: "t1",
      ...data,
    }));
    db.user.findUnique.mockResolvedValue({
      email: "owner@acme.test",
      username: "owner",
    });
    db.user.update.mockResolvedValue({});
    db.tenantMembership.findFirst.mockResolvedValue(null);
    db.tenantMembership.create.mockResolvedValue({});
    mockSubFetch.mockResolvedValue(trialSubscription());
    mockSubCancel.mockResolvedValue({});
    mockFetchPaymentMethod.mockResolvedValue({
      method: "upi",
      summary: "owner@okhdfc",
    });
    mockEligibility.mockResolvedValue({ eligible: true });
    mockKeys.mockResolvedValue(["user:u1", "domain:acme.test"]);
    mockClaim.mockResolvedValue(true);
  });

  it("creates a trialing tenant from Razorpay's record, not the request", async () => {
    const res = makeRes();
    await createTenant(signupReq(), res);

    expect(body(res).status).toBe(200);
    const data = db.tenant.create.mock.calls[0][0].data;
    const endsAt = new Date(trialSubscription().start_at * 1000);
    expect(data).toMatchObject({
      subscriptionStatus: "trialing",
      planTier: "growth",
      billing: "annual",
      planExpiresAt: endsAt,
      trialEndsAt: endsAt,
      trialStartedAt: expect.any(Date),
      trialRemindersSent: [],
      razorpaySubscriptionId: "sub_trial",
    });
    expect(data.planActivatedAt).toBeUndefined();
  });

  it("claims the organisation's signals, including the mandate's UPI handle, before inserting", async () => {
    await createTenant(signupReq(), makeRes());
    expect(mockClaim).toHaveBeenCalledWith(
      ["user:u1", "domain:acme.test", instrumentKey("upi", "owner@okhdfc")],
      "sub_trial",
      "u1",
    );
    expect(mockEligibility).toHaveBeenCalledWith("u1", {
      claims: false,
      subscriptionId: "sub_trial",
    });
    expect(mockClaim.mock.invocationCallOrder[0]).toBeLessThan(
      db.tenant.create.mock.invocationCallOrder[0],
    );
  });

  it("tells the owner when the trial ends in the welcome email", async () => {
    await createTenant(signupReq(), makeRes());
    expect(mockNotify.mock.calls[0][0].email.html).toContain(
      "Your free trial runs until",
    );
  });

  it("refuses a second trial for the same organisation and cancels the uncharged mandate", async () => {
    mockClaim.mockResolvedValue(false);
    const res = makeRes();
    await createTenant(signupReq(), res);

    expect(body(res)).toMatchObject({
      status: 409,
      code: "TRIAL_NOT_ELIGIBLE",
    });
    expect(mockSubCancel).toHaveBeenCalledWith("sub_trial", {
      cancel_at_cycle_end: 0,
    });
    expect(db.tenant.create).not.toHaveBeenCalled();
  });

  it("refuses an owner of another organisation even after checkout", async () => {
    mockEligibility.mockResolvedValue({
      eligible: false,
      reason: "owns_organisation",
    });
    const res = makeRes();
    await createTenant(signupReq(), res);
    expect(body(res).status).toBe(409);
    expect(mockClaim).not.toHaveBeenCalled();
    expect(db.tenant.create).not.toHaveBeenCalled();
  });

  it("rejects another user's trial subscription", async () => {
    mockSubFetch.mockResolvedValue(
      trialSubscription({
        notes: { purpose: "trial_signup", userId: "someone-else" },
      }),
    );
    const res = makeRes();
    await createTenant(signupReq(), res);
    expect(body(res).status).toBe(400);
    expect(db.tenant.create).not.toHaveBeenCalled();
  });

  it("rejects a trial whose start is further out than the configured trial", async () => {
    mockSubFetch.mockResolvedValue(
      trialSubscription({
        start_at: Math.floor((Date.now() + 60 * DAY_MS) / 1000),
      }),
    );
    const res = makeRes();
    await createTenant(signupReq(), res);
    expect(body(res).status).toBe(400);
    expect(db.tenant.create).not.toHaveBeenCalled();
  });

  it("won't build a tenant from some other deferred (never-charged) subscription", async () => {
    mockSubFetch.mockResolvedValue(
      trialSubscription({
        notes: { purpose: "payment_method_change", tenantId: "t9" },
      }),
    );
    const res = makeRes();
    await createTenant(signupReq(), res);
    expect(body(res).status).toBe(400);
    expect(db.tenant.create).not.toHaveBeenCalled();
  });

  it("accepts a paid signup whose start time is a few seconds ahead (clock skew)", async () => {
    mockSubFetch.mockResolvedValue({
      id: "sub_trial",
      status: "active",
      start_at: Math.floor((Date.now() + 30_000) / 1000),
      notes: [],
    });
    const res = makeRes();
    await createTenant(signupReq(), res);
    expect(body(res).status).toBe(200);
    expect(db.tenant.create.mock.calls[0][0].data.subscriptionStatus).toBe(
      "active",
    );
  });

  it("rejects a forged checkout signature before asking Razorpay anything", async () => {
    const res = makeRes();
    await createTenant(signupReq({ razorpaySignature: "f".repeat(64) }), res);
    expect(body(res).status).toBe(400);
    expect(mockSubFetch).not.toHaveBeenCalled();
  });

  it("leaves a paid signup exactly as before — active immediately, no claims", async () => {
    mockSubFetch.mockResolvedValue({
      id: "sub_trial",
      status: "active",
      start_at: null,
      notes: [],
    });
    const res = makeRes();
    await createTenant(signupReq({ planTier: "growth" }), res);

    const data = db.tenant.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      subscriptionStatus: "active",
      planActivatedAt: expect.any(Date),
      planTier: "growth",
    });
    expect(data.trialEndsAt).toBeUndefined();
    expect(mockClaim).not.toHaveBeenCalled();
  });

  it("resumes a retried signup without re-checking or re-claiming", async () => {
    db.tenant.findFirst.mockResolvedValue({
      id: "t1",
      name: "Acme",
      slug: "acme",
      dbName: "hrms-acme",
    });
    db.tenantMembership.findFirst.mockResolvedValue({ role: "owner" });
    const res = makeRes();
    await createTenant(signupReq(), res);

    expect(body(res).message).toBe("Organisation setup resumed.");
    expect(mockSubFetch).not.toHaveBeenCalled();
    expect(mockClaim).not.toHaveBeenCalled();
    expect(db.tenant.create).not.toHaveBeenCalled();
  });
});
