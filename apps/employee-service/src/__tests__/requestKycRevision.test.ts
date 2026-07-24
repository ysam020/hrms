import { prisma } from "@hrms/db";
import { cacheManager } from "@hrms/cache";
import { notify } from "@hrms/notifications";
import { requestKycRevision } from "../handlers/requestKycRevision";

jest.mock("@hrms/db", () => {
  const _db = {
    user: { findUnique: jest.fn(), update: jest.fn() },
  };
  return {
    prisma: _db,
    prismaWithTenant: _db,
    getTenantId: jest.fn().mockReturnValue("t1"),
  };
});

jest.mock("@hrms/cache", () => ({
  cacheManager: { invalidatePattern: jest.fn(), delete: jest.fn() },
}));

jest.mock("@hrms/notifications", () => ({
  notify: jest.fn().mockResolvedValue({ notificationId: "n1", jobIds: {} }),
}));
const mockNotify = notify as jest.Mock;

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockFindUnique = prisma.user.findUnique as jest.Mock;
const mockUpdate = prisma.user.update as jest.Mock;
const mockInvalidate = cacheManager.invalidatePattern as jest.Mock;
const mockCacheDelete = cacheManager.delete as jest.Mock;

const makeCall = (req: any) => ({ request: req }) as any;
const makeCallback = () => jest.fn();

const user = { id: "u1", username: "john", kyc_approval: "Pending" };

describe("requestKycRevision", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdate.mockResolvedValue({
      ...user,
      kyc_approval: "Revision Requested",
    });
    mockInvalidate.mockResolvedValue(undefined);
    mockCacheDelete.mockResolvedValue(undefined);
  });

  it("returns INVALID_ARGUMENT when employeeId is missing", async () => {
    const cb = makeCallback();
    await requestKycRevision(
      makeCall({ fieldIssuesJson: JSON.stringify({ aadhar_no: "blurry" }) }),
      cb,
    );
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 3 }),
    );
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("returns INVALID_ARGUMENT when fieldIssuesJson is empty", async () => {
    const cb = makeCallback();
    await requestKycRevision(
      makeCall({ employeeId: "u1", fieldIssuesJson: "{}" }),
      cb,
    );
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 3 }),
    );
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("returns INVALID_ARGUMENT when fieldIssuesJson is malformed", async () => {
    const cb = makeCallback();
    await requestKycRevision(
      makeCall({ employeeId: "u1", fieldIssuesJson: "not json" }),
      cb,
    );
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 3 }),
    );
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND when user does not exist", async () => {
    mockFindUnique.mockResolvedValue(null);
    const cb = makeCallback();
    await requestKycRevision(
      makeCall({
        employeeId: "u-99",
        fieldIssuesJson: JSON.stringify({ aadhar_no: "blurry" }),
      }),
      cb,
    );
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 5 }),
    );
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns FAILED_PRECONDITION when the KYC is already Approved", async () => {
    mockFindUnique.mockResolvedValue({ ...user, kyc_approval: "Approved" });
    const cb = makeCallback();
    await requestKycRevision(
      makeCall({
        employeeId: "u1",
        fieldIssuesJson: JSON.stringify({ aadhar_no: "blurry" }),
      }),
      cb,
    );
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 9 }),
    );
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("sets Revision Requested with the given field issues and invalidates cache", async () => {
    mockFindUnique.mockResolvedValue(user);
    const cb = makeCallback();
    const fieldIssues = {
      aadhar_no: "Blurry photo, please re-upload",
      bank_account_no: "Doesn't match the passbook",
    };
    await requestKycRevision(
      makeCall({
        employeeId: "u1",
        fieldIssuesJson: JSON.stringify(fieldIssues),
      }),
      cb,
    );

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: {
        kyc_approval: "Revision Requested",
        kyc_revision_notes: fieldIssues,
      },
    });
    expect(mockInvalidate).toHaveBeenCalledWith("t:t1:employees:*");
    expect(mockCacheDelete).toHaveBeenCalledWith("t:t1:employee:u1");
    expect(mockCacheDelete).toHaveBeenCalledWith("t:t1:employee-details:john");
    expect(mockCacheDelete).toHaveBeenCalledWith("t:t1:user:v6:u1");
    expect(mockCacheDelete).toHaveBeenCalledWith("t:t1:user:v6:john");
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        status: 0,
        kycStatus: "Revision Requested",
      }),
    );
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "kycRevisionRequested",
        targetUser: "john",
        push: { enabled: true },
      }),
    );
  });

  it("returns INTERNAL on database error", async () => {
    mockFindUnique.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await requestKycRevision(
      makeCall({
        employeeId: "u1",
        fieldIssuesJson: JSON.stringify({ aadhar_no: "blurry" }),
      }),
      cb,
    );
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 13 }),
    );
  });
});
