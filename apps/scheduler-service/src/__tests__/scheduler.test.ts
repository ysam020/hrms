const mockRemoveRepeatableByKey = jest.fn().mockResolvedValue(undefined);
const mockAdd = jest.fn().mockResolvedValue(undefined);
const mockGetRepeatableJobs = jest.fn();

jest.mock("@hrms/queue", () => ({
  getSchedulerQueue: jest.fn(() => ({
    getRepeatableJobs: mockGetRepeatableJobs,
    removeRepeatableByKey: mockRemoveRepeatableByKey,
    add: mockAdd,
  })),
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { logger } from "@hrms/logger";
import { registerScheduledJobs } from "../scheduler";

describe("registerScheduledJobs", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRepeatableJobs.mockResolvedValue([]);
  });

  it("removes every existing repeatable job before re-registering, to avoid duplicates on restart", async () => {
    mockGetRepeatableJobs.mockResolvedValue([
      { key: "key-1" },
      { key: "key-2" },
    ]);

    await registerScheduledJobs();

    expect(mockRemoveRepeatableByKey).toHaveBeenCalledWith("key-1");
    expect(mockRemoveRepeatableByKey).toHaveBeenCalledWith("key-2");
    expect(mockRemoveRepeatableByKey).toHaveBeenCalledTimes(2);
  });

  it("registers all 10 scheduled jobs with their cron patterns", async () => {
    await registerScheduledJobs();

    expect(mockAdd).toHaveBeenCalledTimes(10);
    expect(mockAdd).toHaveBeenCalledWith(
      "updateExpiredHrActivities",
      { jobName: "updateExpiredHrActivities" },
      { repeat: { pattern: "0 1 * * *" } },
    );
    expect(mockAdd).toHaveBeenCalledWith(
      "checkTicketSla",
      { jobName: "checkTicketSla" },
      { repeat: { pattern: "0 4 * * *" } },
    );
    expect(mockAdd).toHaveBeenCalledWith(
      "sendTrialReminders",
      { jobName: "sendTrialReminders" },
      { repeat: { pattern: "30 9 * * *" } },
    );
  });

  it("logs a summary once all jobs are registered", async () => {
    await registerScheduledJobs();
    expect(logger.info).toHaveBeenCalledWith(
      "All 10 scheduled jobs registered",
    );
  });

  it("does nothing to remove when there are no existing repeatable jobs", async () => {
    await registerScheduledJobs();
    expect(mockRemoveRepeatableByKey).not.toHaveBeenCalled();
    expect(mockAdd).toHaveBeenCalledTimes(10);
  });
});
