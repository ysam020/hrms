import { prisma } from "@hrms/db";
import { sendKycReminders } from "../jobs/sendKycReminders";

jest.mock("@hrms/db", () => {
  const _db = {
    user: { findMany: jest.fn() },
    tenant: { findMany: jest.fn() },
  };
  return {
    prisma: _db,
    prismaWithTenant: _db,
    getTenantId: jest.fn().mockReturnValue("t1"),
  };
});

jest.mock("@hrms/common", () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
  tenantFrom: jest.fn(
    (name: string) => `"${name} HR" <hr@notifications.praesto.cloud>`,
  ),
  renderEmailHtml: jest.fn(
    ({ bodyHtml }: { bodyHtml: string }) => `<html>${bodyHtml}</html>`,
  ),
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

import { sendEmail } from "@hrms/common";

const mockUserFindMany = prisma.user.findMany as jest.Mock;
const mockTenantFindMany = prisma.tenant.findMany as jest.Mock;
const mockSendEmail = sendEmail as jest.Mock;

const missingUser = {
  username: "john",
  email: "john@example.com",
  first_name: "John",
  middle_name: null,
  last_name: "Doe",
};
const rejectedUser = {
  username: "jane",
  email: "jane@example.com",
  first_name: "Jane",
  middle_name: null,
  last_name: "Smith",
};
const pendingUser = {
  username: "bob",
  email: "bob@example.com",
  first_name: "Bob",
  middle_name: null,
  last_name: "Lee",
};

// Per tenant, processTenantKycReminders queries in this order:
// missing, rejected, pending, hrUsers.
function mockTenantQueries({
  missing = [],
  rejected = [],
  pending = [],
  hrUsers = [],
}: {
  missing?: any[];
  rejected?: any[];
  pending?: any[];
  hrUsers?: any[];
}) {
  mockUserFindMany
    .mockResolvedValueOnce(missing)
    .mockResolvedValueOnce(rejected)
    .mockResolvedValueOnce(pending)
    .mockResolvedValueOnce(hrUsers);
}

describe("sendKycReminders", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTenantFindMany.mockResolvedValue([{ id: "t1", name: "Acme Corp" }]);
    process.env.HR_EMAIL = "hr@company.com";
  });

  afterEach(() => {
    delete process.env.HR_EMAIL;
  });

  it("sends no emails when all KYC lists are empty", async () => {
    mockTenantQueries({});
    await sendKycReminders();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("sends employee + HR email for each missing-KYC user", async () => {
    mockTenantQueries({ missing: [missingUser] });

    await sendKycReminders();

    // 2 emails: one to employee, one to HR (falls back to HR_EMAIL since
    // this tenant has no HUMAN RESOURCES-department users configured)
    expect(mockSendEmail).toHaveBeenCalledTimes(2);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "john@example.com" }),
    );
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "hr@company.com" }),
    );
  });

  it("sends employee + HR email for each rejected-KYC user", async () => {
    mockTenantQueries({ rejected: [rejectedUser] });

    await sendKycReminders();

    expect(mockSendEmail).toHaveBeenCalledTimes(2);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "jane@example.com" }),
    );
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "hr@company.com" }),
    );
  });

  it("sends only HR email for pending-KYC users (not employee)", async () => {
    mockTenantQueries({ pending: [pendingUser] });

    await sendKycReminders();

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "hr@company.com" }),
    );
  });

  it("skips employee email when user has no email address", async () => {
    const noEmailUser = { ...missingUser, email: null };
    mockTenantQueries({ missing: [noEmailUser] });

    await sendKycReminders();

    // Only HR email, no employee email
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "hr@company.com" }),
    );
  });

  it("skips HR emails when no tenant HR users exist and HR_EMAIL is not configured", async () => {
    delete process.env.HR_EMAIL;
    delete process.env.DEV_EMAIL;

    mockTenantQueries({ missing: [missingUser] });

    await sendKycReminders();

    // Only employee email — no HR email
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "john@example.com" }),
    );
  });

  it("falls back to DEV_EMAIL when HR_EMAIL is not set and no tenant HR users exist", async () => {
    delete process.env.HR_EMAIL;
    process.env.DEV_EMAIL = "dev@company.com";

    mockTenantQueries({ missing: [missingUser] });

    await sendKycReminders();

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "dev@company.com" }),
    );

    delete process.env.DEV_EMAIL;
  });

  it("emails each of the tenant's own HR users instead of the global fallback when HR users exist", async () => {
    mockTenantQueries({
      missing: [missingUser],
      hrUsers: [{ email: "hr-a@tenant.com" }, { email: "hr-b@tenant.com" }],
    });

    await sendKycReminders();

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "hr-a@tenant.com" }),
    );
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "hr-b@tenant.com" }),
    );
    expect(mockSendEmail).not.toHaveBeenCalledWith(
      expect.objectContaining({ to: "hr@company.com" }),
    );
  });

  it("only flags missing KYC once joining_date is at least 2 days in the past", async () => {
    mockTenantQueries({ missing: [missingUser] });

    await sendKycReminders();

    const missingQueryArgs = mockUserFindMany.mock.calls[0][0];
    expect(missingQueryArgs.where.joining_date).toEqual({
      lte: expect.any(Date),
    });
    const cutoff = missingQueryArgs.where.joining_date.lte as Date;
    const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
    // Allow a small tolerance for test execution time between Date.now()
    // calls, rather than asserting exact millisecond equality.
    expect(Math.abs(cutoff.getTime() - twoDaysAgo)).toBeLessThan(5000);
  });

  it("uses the tenant-branded from-address for every email in that tenant's sweep", async () => {
    mockTenantQueries({ missing: [missingUser] });

    await sendKycReminders();

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: '"Acme Corp HR" <hr@notifications.praesto.cloud>',
      }),
    );
  });

  it("scopes each tenant's queries by that tenant's id and keeps tenants' HR alerts separate", async () => {
    mockTenantFindMany.mockResolvedValue([
      { id: "t1", name: "Tenant One" },
      { id: "t2", name: "Tenant Two" },
    ]);
    mockUserFindMany
      // tenant t1
      .mockResolvedValueOnce([missingUser])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ email: "hr-t1@tenant.com" }])
      // tenant t2
      .mockResolvedValueOnce([rejectedUser])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ email: "hr-t2@tenant.com" }]);

    await sendKycReminders();

    // Each user.findMany call for a KYC-status query must be scoped to a
    // single tenant, not pooled across all tenants.
    const statusCalls = mockUserFindMany.mock.calls.filter(
      ([args]) => "kyc_approval" in args.where || "OR" in args.where,
    );
    for (const [args] of statusCalls) {
      expect(typeof args.where.tenantId).toBe("string");
    }

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "hr-t1@tenant.com" }),
    );
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "hr-t2@tenant.com" }),
    );
    // t1's missing-user alert never goes to t2's HR inbox and vice versa.
    expect(mockSendEmail).not.toHaveBeenCalledWith(
      expect.objectContaining({
        to: "hr-t2@tenant.com",
        html: expect.stringContaining("john"),
      }),
    );
  });

  it("continues processing other users when one email fails", async () => {
    const user2 = {
      ...missingUser,
      username: "alice",
      email: "alice@example.com",
    };
    mockTenantQueries({ missing: [missingUser, user2] });

    // First call throws, rest succeed
    mockSendEmail
      .mockRejectedValueOnce(new Error("SMTP error"))
      .mockResolvedValue(undefined);

    await expect(sendKycReminders()).resolves.toBeUndefined();
    // Should still attempt emails for the second user
    expect(mockSendEmail.mock.calls.length).toBeGreaterThan(1);
  });

  it("continues processing other tenants when one tenant's queries fail", async () => {
    mockTenantFindMany.mockResolvedValue([
      { id: "t1", name: "Tenant One" },
      { id: "t2", name: "Tenant Two" },
    ]);
    mockUserFindMany
      // tenant t1 fails entirely
      .mockRejectedValueOnce(new Error("DB error"))
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      // tenant t2 succeeds
      .mockResolvedValueOnce([missingUser])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await expect(sendKycReminders()).resolves.toBeUndefined();
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "john@example.com" }),
    );
  });

  it("throws when fetching the tenant list fails", async () => {
    mockTenantFindMany.mockRejectedValue(new Error("DB error"));
    await expect(sendKycReminders()).rejects.toThrow("DB error");
  });
});
