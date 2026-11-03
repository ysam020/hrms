const mockRunCommandRaw = jest.fn();
jest.mock("../prismaClient", () => ({
  prisma: { $runCommandRaw: (...a: unknown[]) => mockRunCommandRaw(...a) },
}));
jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { logger } from "@hrms/logger";
import { warmUpDatabase } from "../warmUp";

describe("warmUpDatabase", () => {
  const env = process.env.NODE_ENV;
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NODE_ENV = "development";
  });
  afterAll(() => {
    process.env.NODE_ENV = env;
  });

  it("pings the master database once", async () => {
    mockRunCommandRaw.mockResolvedValue({ ok: 1 });
    await warmUpDatabase();
    expect(mockRunCommandRaw).toHaveBeenCalledWith({ ping: 1 });
    expect(logger.info).toHaveBeenCalled();
  });

  it("never throws when the database is unreachable", async () => {
    mockRunCommandRaw.mockRejectedValue(new Error("timeout"));
    await expect(warmUpDatabase()).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
  });

  it("does nothing under test", async () => {
    process.env.NODE_ENV = "test";
    await warmUpDatabase();
    expect(mockRunCommandRaw).not.toHaveBeenCalled();
  });
});
