import { prisma } from "@hrms/db";
import { getKycStatus } from "../handlers/getKycStatus";

jest.mock("@hrms/db", () => ({
  prisma: {
    user: { findUnique: jest.fn() },
  },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockFindUnique = prisma.user.findUnique as jest.Mock;

const makeCall = (req: any) => ({ request: req }) as any;
const makeCallback = () => jest.fn();

const kycData = {
  id: "u1",
  email: "john@test.com",
  kyc_approval: "Pending",
  kyc_date: "2024-03-01",
  aadhar_no: "1234",
  pan_no: "ABCDE1234F",
  bank_account_no: "ACC123",
  pf_no: null,
  uan_no: null,
  esic_no: null,
};

describe("getKycStatus", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns INVALID_ARGUMENT when userId is missing", async () => {
    const cb = makeCallback();
    await getKycStatus(makeCall({}), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 3 }),
    );
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND when user does not exist", async () => {
    mockFindUnique.mockResolvedValue(null);
    const cb = makeCallback();
    await getKycStatus(makeCall({ userId: "u-99" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 5 }),
    );
  });

  it("returns KYC data on success", async () => {
    mockFindUnique.mockResolvedValue(kycData);
    const cb = makeCallback();
    await getKycStatus(makeCall({ userId: "u1" }), cb);
    expect(mockFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "u1" },
        select: expect.objectContaining({
          kyc_approval: true,
          aadhar_no: true,
        }),
      }),
    );
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 0, data: kycData }),
    );
  });

  it("returns INTERNAL on database error", async () => {
    mockFindUnique.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await getKycStatus(makeCall({ userId: "u1" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 13 }),
    );
  });
});
