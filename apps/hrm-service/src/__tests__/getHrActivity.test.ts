import { prisma } from "@hrms/db";
import { getHrActivity } from "../handlers/getHrActivity";

jest.mock("@hrms/db", () => ({
  prisma: {
    hrActivity: { findUnique: jest.fn() },
  },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockFindUnique = (prisma as any).hrActivity.findUnique as jest.Mock;

const makeCall = (req: any) => ({ request: req }) as any;
const makeCallback = () => jest.fn();

const activity = { id: "act-1", title: "Meeting", status: "active" };

describe("getHrActivity", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns INVALID_ARGUMENT when id is missing", async () => {
    const cb = makeCallback();
    await getHrActivity(makeCall({}), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 3 }),
    );
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND when activity does not exist", async () => {
    mockFindUnique.mockResolvedValue(null);
    const cb = makeCallback();
    await getHrActivity(makeCall({ id: "act-99" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 5 }),
    );
  });

  it("returns NOT_FOUND for deleted activity", async () => {
    mockFindUnique.mockResolvedValue({ ...activity, status: "deleted" });
    const cb = makeCallback();
    await getHrActivity(makeCall({ id: "act-1" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 5 }),
    );
  });

  it("returns activity data on success", async () => {
    mockFindUnique.mockResolvedValue(activity);
    const cb = makeCallback();
    await getHrActivity(makeCall({ id: "act-1" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 0, data: activity }),
    );
  });

  it("returns INTERNAL on database error", async () => {
    mockFindUnique.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await getHrActivity(makeCall({ id: "act-1" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 13 }),
    );
  });
});
