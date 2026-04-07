import { prisma } from "@hrms/db";
import { getMyResignation } from "../handlers/getMyResignation";

jest.mock("@hrms/db", () => ({
  prisma: {
    resignation: { findFirst: jest.fn() },
  },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockFindFirst = (prisma as any).resignation.findFirst as jest.Mock;

const makeCall = (req: any) => ({ request: req }) as any;
const makeCallback = () => jest.fn();

const resignation = { id: "res-1", username: "john", status: "Submitted" };

describe("getMyResignation", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns INVALID_ARGUMENT when username is missing", async () => {
    const cb = makeCallback();
    await getMyResignation(makeCall({}), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 3 }),
    );
    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND when no resignation found for username", async () => {
    mockFindFirst.mockResolvedValue(null);
    const cb = makeCallback();
    await getMyResignation(makeCall({ username: "john" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 5 }),
    );
  });

  it("returns most recent resignation for username", async () => {
    mockFindFirst.mockResolvedValue(resignation);
    const cb = makeCallback();
    await getMyResignation(makeCall({ username: "john" }), cb);
    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { username: "john" },
        orderBy: { submittedOn: "desc" },
      }),
    );
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 0, data: resignation }),
    );
  });

  it("returns INTERNAL on database error", async () => {
    mockFindFirst.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await getMyResignation(makeCall({ username: "john" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 13 }),
    );
  });
});
