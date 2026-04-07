import { prisma } from "@hrms/db";
import { createRule } from "../handlers/createRule";

jest.mock("@hrms/db", () => ({
  prisma: {
    rule: { create: jest.fn() },
  },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockCreate = (prisma as any).rule.create as jest.Mock;

const makeCall = (req: any) => ({ request: req }) as any;
const makeCallback = () => jest.fn();

const ruleRow = {
  id: "r-1",
  name: "Rule A",
  category: "hr",
  status: "draft",
  priority: 0,
  tags: [],
};

describe("createRule", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate.mockResolvedValue(ruleRow);
  });

  it("returns INVALID_ARGUMENT when name is missing", async () => {
    const cb = makeCallback();
    await createRule(makeCall({ category: "hr" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 3 }),
    );
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns INVALID_ARGUMENT when category is missing", async () => {
    const cb = makeCallback();
    await createRule(makeCall({ name: "Rule A" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 3 }),
    );
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("creates rule with defaults", async () => {
    const cb = makeCallback();
    await createRule(makeCall({ name: "Rule A", category: "hr" }), cb);
    const createData = mockCreate.mock.calls[0][0].data;
    expect(createData.status).toBe("draft");
    expect(createData.priority).toBe(0);
    expect(createData.tags).toEqual([]);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 0, data: ruleRow }),
    );
  });

  it("parses priority as integer", async () => {
    const cb = makeCallback();
    await createRule(
      makeCall({ name: "Rule A", category: "hr", priority: "5" }),
      cb,
    );
    const createData = mockCreate.mock.calls[0][0].data;
    expect(createData.priority).toBe(5);
  });

  it("returns INTERNAL on database error", async () => {
    mockCreate.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await createRule(makeCall({ name: "Rule A", category: "hr" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 13 }),
    );
  });
});
