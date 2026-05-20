import { prisma } from "@hrms/db";
import { sendKycReminders } from "../jobs/sendKycReminders";

jest.mock("@hrms/db", () => {
  const _db = {
    user: { findMany: jest.fn() },
  };
  return {
    prisma: _db,
    prismaWithTenant: _db,
    getTenantId: jest.fn().mockReturnValue("t1"),
  };
});

jest.mock("@hrms/common", () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

import { sendEmail } from "@hrms/common";

const mockUserFindMany = prisma.user.findMany as jest.Mock;
const mockSendEmail = sendEmail as jest.Mock;

const hrUser = {
  username: "hr1",
  email: null,
  first_name: "HR",
  middle_name: null,
  last_name: "Team",
};
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

describe("sendKycReminders", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.HR_EMAIL = "hr@company.com";
    process.env.EMAIL_FROM = "noreply@company.com";
  });

  afterEach(() => {
    delete process.env.HR_EMAIL;
    delete process.env.EMAIL_FROM;
  });

  it("sends no emails when all KYC lists are empty", async () => {
    mockUserFindMany.mockResolvedValue([]);
    await sendKycReminders();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("sends employee + HR email for each missing-KYC user", async () => {
    mockUserFindMany
      .mockResolvedValueOnce([missingUser]) // missing
      .mockResolvedValueOnce([]) // rejected
      .mockResolvedValueOnce([]); // pending

    await sendKycReminders();

    // 2 emails: one to employee, one to HR
    expect(mockSendEmail).toHaveBeenCalledTimes(2);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "john@example.com" }),
    );
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "hr@company.com" }),
    );
  });

  it("sends employee + HR email for each rejected-KYC user", async () => {
    mockUserFindMany
      .mockResolvedValueOnce([]) // missing
      .mockResolvedValueOnce([rejectedUser]) // rejected
      .mockResolvedValueOnce([]); // pending

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
    mockUserFindMany
      .mockResolvedValueOnce([]) // missing
      .mockResolvedValueOnce([]) // rejected
      .mockResolvedValueOnce([pendingUser]); // pending

    await sendKycReminders();

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "hr@company.com" }),
    );
  });

  it("skips employee email when user has no email address", async () => {
    const noEmailUser = { ...missingUser, email: null };
    mockUserFindMany
      .mockResolvedValueOnce([noEmailUser])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await sendKycReminders();

    // Only HR email, no employee email
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "hr@company.com" }),
    );
  });

  it("skips HR emails when HR_EMAIL is not configured", async () => {
    delete process.env.HR_EMAIL;
    delete process.env.DEV_EMAIL;

    mockUserFindMany
      .mockResolvedValueOnce([missingUser])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await sendKycReminders();

    // Only employee email — no HR email
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "john@example.com" }),
    );
  });

  it("falls back to DEV_EMAIL when HR_EMAIL is not set", async () => {
    delete process.env.HR_EMAIL;
    process.env.DEV_EMAIL = "dev@company.com";

    mockUserFindMany
      .mockResolvedValueOnce([missingUser])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await sendKycReminders();

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "dev@company.com" }),
    );

    delete process.env.DEV_EMAIL;
  });

  it("continues processing other users when one email fails", async () => {
    const user2 = {
      ...missingUser,
      username: "alice",
      email: "alice@example.com",
    };
    mockUserFindMany
      .mockResolvedValueOnce([missingUser, user2])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    // First call throws, rest succeed
    mockSendEmail
      .mockRejectedValueOnce(new Error("SMTP error"))
      .mockResolvedValue(undefined);

    await expect(sendKycReminders()).resolves.toBeUndefined();
    // Should still attempt emails for the second user
    expect(mockSendEmail.mock.calls.length).toBeGreaterThan(1);
  });

  it("throws when the database call fails", async () => {
    mockUserFindMany.mockRejectedValue(new Error("DB error"));
    await expect(sendKycReminders()).rejects.toThrow("DB error");
  });
});
