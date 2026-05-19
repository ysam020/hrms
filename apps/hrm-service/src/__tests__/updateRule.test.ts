import { prisma } from "@hrms/db";
import { updateRule } from "../handlers/updateRule";

jest.mock("@hrms/db", () => {
  const _db = {
    rule: { findUnique: jest.fn(), update: jest.fn() },
  };
  return {
    prisma: _db,
    prismaWithTenant: _db,
    getTenantId: jest.fn().mockReturnValue("t1"),
  };
});

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockFindUnique = (prisma as any).rule.findUnique as jest.Mock;
const mockUpdate = (prisma as any).rule.update as jest.Mock;

const makeCall = (req: any) => ({ request: req }) as any;
const makeCallback = () => jest.fn();

const ruleRow = { id: "r-1", name: "Rule A", category: "hr" };

describe("updateRule", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdate.mockResolvedValue({ ...ruleRow, name: "Updated Rule" });
  });

  it("returns INVALID_ARGUMENT when id is missing", async () => {
    const cb = makeCallback();
    await updateRule(makeCall({ name: "New Name" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 3 }),
    );
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND when rule does not exist", async () => {
    mockFindUnique.mockResolvedValue(null);
    const cb = makeCallback();
    await updateRule(makeCall({ id: "r-99" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 5 }),
    );
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("updates rule and returns OK", async () => {
    mockFindUnique.mockResolvedValue(ruleRow);
    const cb = makeCallback();
    await updateRule(
      makeCall({ id: "r-1", name: "Updated Rule", updatedBy: "admin" }),
      cb,
    );
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "r-1" },
        data: expect.objectContaining({
          name: "Updated Rule",
          lastUpdatedBy: "admin",
        }),
      }),
    );
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 0 }),
    );
  });

  it("only updates allowed fields", async () => {
    mockFindUnique.mockResolvedValue(ruleRow);
    const cb = makeCallback();
    await updateRule(
      makeCall({ id: "r-1", name: "New", unknownField: "ignored" }),
      cb,
    );
    const updateData = mockUpdate.mock.calls[0][0].data;
    expect(updateData.name).toBe("New");
    expect(updateData.unknownField).toBeUndefined();
  });

  it("returns INTERNAL on database error", async () => {
    mockFindUnique.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await updateRule(makeCall({ id: "r-1" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 13 }),
    );
  });
});
