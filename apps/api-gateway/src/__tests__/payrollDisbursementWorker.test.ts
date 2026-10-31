import { prisma } from "@hrms/db";
import { requestIdStorage } from "@hrms/logger";
import { runPayrollDisbursement } from "../services/payrollDisbursement";
import { startPayrollDisbursementWorker } from "../workers/payrollDisbursementWorker";

let capturedProcessor: (job: any) => Promise<any>;
let capturedHandlers: Record<string, (...args: any[]) => void>;

jest.mock("bullmq", () => ({
  Worker: jest.fn().mockImplementation((_name: string, processor: any) => {
    capturedProcessor = processor;
    capturedHandlers = {};
    return {
      on: jest.fn((event: string, handler: any) => {
        capturedHandlers[event] = handler;
      }),
    };
  }),
}));

const mockDlqAdd = jest.fn().mockResolvedValue(undefined);
jest.mock("@hrms/queue", () => ({
  getBullMQConnection: jest.fn(() => ({})),
  getDeadLetterQueue: jest.fn(() => ({ add: mockDlqAdd })),
}));

jest.mock("@hrms/db", () => {
  const _db = {
    tenant: { findUnique: jest.fn() },
    payrollRun: { update: jest.fn(), findFirst: jest.fn() },
  };
  return {
    prisma: _db,
    getClientForDb: jest.fn(() => ({})),
    runWithTenant: jest.fn((_tenantId, _client, fn) => fn()),
  };
});

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  requestIdStorage: { run: jest.fn((_id: string, fn: () => any) => fn()) },
}));

jest.mock("../services/payrollDisbursement", () => ({
  runPayrollDisbursement: jest.fn(),
}));

const mockTenantFindUnique = prisma.tenant.findUnique as jest.Mock;
const mockPayrollRunUpdate = prisma.payrollRun.update as jest.Mock;
const mockPayrollRunFindFirst = prisma.payrollRun.findFirst as jest.Mock;
const mockRunPayrollDisbursement = runPayrollDisbursement as jest.Mock;

const runProcessor = (data: Record<string, any> = {}) =>
  capturedProcessor({
    id: "job-1",
    data: {
      tenantId: "t1",
      runId: "r1",
      disbursedBy: "u1",
      ...data,
    },
    opts: {},
  } as any);

describe("payrollDisbursementWorker", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTenantFindUnique.mockResolvedValue({ dbName: "hrms-test-tenant" });
    mockPayrollRunUpdate.mockResolvedValue({});
    mockPayrollRunFindFirst.mockResolvedValue({
      month: 6,
      year: 2024,
      employeeCount: 2,
    });
    mockRunPayrollDisbursement.mockResolvedValue({
      runId: "r1",
      payoutOk: 2,
      payoutFail: 0,
      payoutSkipped: 0,
      alreadyDone: 0,
      postProcessed: 2,
      notifiedRecipients: 2,
    });
    startPayrollDisbursementWorker();
  });

  it("resolves tenant db and runs the disbursement inside the tenant context", async () => {
    await runProcessor();

    expect(mockTenantFindUnique).toHaveBeenCalledWith({
      where: { id: "t1" },
      select: { dbName: true },
    });
    expect(mockRunPayrollDisbursement).toHaveBeenCalledWith("r1");
  });

  it("throws when the tenant has no resolvable database", async () => {
    mockTenantFindUnique.mockResolvedValue({ dbName: null });
    await expect(runProcessor()).rejects.toThrow(/has no resolvable database/);
    expect(mockRunPayrollDisbursement).not.toHaveBeenCalled();
  });

  it("moves the run from 'disbursing' to 'disbursed' with disbursedBy/disbursedAt on success", async () => {
    await runProcessor();

    expect(mockPayrollRunUpdate).toHaveBeenCalledWith({
      where: {
        id: "r1",
        status: { in: ["disbursing", "disbursement_failed"] },
      },
      data: expect.objectContaining({
        disbursedBy: "u1",
        status: "disbursed",
      }),
    });
  });

  it("tolerates the run already being 'disbursed' (a retry-payouts call that found no full-job status to flip)", async () => {
    mockPayrollRunUpdate.mockRejectedValue(
      Object.assign(new Error("no record"), { code: "P2025" }),
    );

    await expect(runProcessor()).resolves.toBeDefined();
  });

  it("runs the job inside the producer's requestId context when the job carries one", async () => {
    await runProcessor({ requestId: "req-123" });
    expect(requestIdStorage.run).toHaveBeenCalledWith(
      "req-123",
      expect.any(Function),
    );
  });

  describe("on job failure", () => {
    it("marks the run 'disbursement_failed' once BullMQ retries are exhausted", async () => {
      const job = {
        id: "j1",
        data: { runId: "r1", tenantId: "t1", disbursedBy: "u1" },
        attemptsMade: 2,
        opts: { attempts: 2 },
      };
      await capturedHandlers.failed(job, new Error("crashed"));
      await new Promise((resolve) => setImmediate(resolve));

      expect(mockPayrollRunUpdate).toHaveBeenCalledWith({
        where: { id: "r1", status: "disbursing" },
        data: { status: "disbursement_failed" },
      });
      expect(mockDlqAdd).toHaveBeenCalledWith(
        "failed-payroll-disbursement",
        expect.objectContaining({
          originalQueue: "payrollDisbursementQueue",
          originalJobId: "j1",
        }),
      );
    });

    it("does not touch run status or forward to DLQ while retry attempts remain", async () => {
      const job = {
        id: "j2",
        data: { runId: "r1", tenantId: "t1", disbursedBy: "u1" },
        attemptsMade: 1,
        opts: { attempts: 2 },
      };
      await capturedHandlers.failed(job, new Error("transient"));
      await new Promise((resolve) => setImmediate(resolve));

      expect(mockPayrollRunUpdate).not.toHaveBeenCalled();
      expect(mockDlqAdd).not.toHaveBeenCalled();
    });
  });
});
