import { prisma } from "@hrms/db";
import { deleteRule } from "../handlers/deleteRule";

jest.mock("@hrms/db", () => ({
  prisma: {
    rule: { findUnique: jest.fn(), delete: jest.fn() },
  },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockFindUnique = (prisma as any).rule.findUnique as jest.Mock;
const mockDelete = (prisma as any).rule.delete as jest.Mock;

const makeCall = (req: any) => ({ request: req }) as any;
const makeCallback = () => jest.fn();

describe("deleteRule", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDelete.mockResolvedValue(undefined);
  });

  it("returns INVALID_ARGUMENT when id is missing", async () => {
    const cb = makeCallback();
    await deleteRule(makeCall({}), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 3 }),
    );
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND when rule does not exist", async () => {
    mockFindUnique.mockResolvedValue(null);
    const cb = makeCallback();
    await deleteRule(makeCall({ id: "r-99" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 5 }),
    );
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("deletes rule and returns OK", async () => {
    mockFindUnique.mockResolvedValue({ id: "r-1", name: "Rule A" });
    const cb = makeCallback();
    await deleteRule(makeCall({ id: "r-1" }), cb);
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: "r-1" } });
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 0 }),
    );
  });

  it("returns INTERNAL on database error", async () => {
    mockFindUnique.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await deleteRule(makeCall({ id: "r-1" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 13 }),
    );
  });
});
