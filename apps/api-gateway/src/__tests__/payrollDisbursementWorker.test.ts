import { prisma, prismaWithTenant, runWithTenant } from "@hrms/db";
import { logger, requestIdStorage } from "@hrms/logger";
import { runPayrollDisbursement } from "../services/payrollDisbursement";
import {
  startPayrollDisbursementWorker,
  PayrollRunStatusError,
} from "../workers/payrollDisbursementWorker";

let capturedProcessor: (job: any) => Promise<any>;
let capturedHandlers: Record<string, (...args: any[]) => any>;

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

// Two distinct clients, as in production: the master database (tenants
// only — it has no payroll runs, so this mock deliberately has no
// payrollRun model) and the tenant-routed client that payroll runs live in.
jest.mock("@hrms/db", () => {
  const master = { tenant: { findUnique: jest.fn() } };
  const tenantRouted = {
    payrollRun: { update: jest.fn(), findFirst: jest.fn() },
  };
  return {
    prisma: master,
    prismaWithTenant: tenantRouted,
    getClientForDb: jest.fn(() => ({ name: "tenant-client" })),
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

const master = prisma as any;
const tenantDb = prismaWithTenant as any;
const mockTenantFindUnique = master.tenant.findUnique as jest.Mock;
const mockRunUpdate = tenantDb.payrollRun.update as jest.Mock;
const mockRunFindFirst = tenantDb.payrollRun.findFirst as jest.Mock;
const mockRunPayrollDisbursement = runPayrollDisbursement as jest.Mock;
const p2025 = () => Object.assign(new Error("no record"), { code: "P2025" });

const runProcessor = (data: Record<string, any> = {}) =>
  capturedProcessor({
    id: "job-1",
    data: { tenantId: "t1", runId: "r1", disbursedBy: "u1", ...data },
    opts: {},
  } as any);

const exhaustedJob = (data: Record<string, any> = {}) => ({
  id: "j1",
  data: { runId: "r1", tenantId: "t1", disbursedBy: "u1", ...data },
  attemptsMade: 2,
  opts: { attempts: 2 },
});

describe("payrollDisbursementWorker", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTenantFindUnique.mockResolvedValue({ dbName: "hrms-test-tenant" });
    mockRunUpdate.mockResolvedValue({});
    mockRunFindFirst.mockResolvedValue(null);
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

  it("the master client has no payroll runs: the worker never reaches for one there", () => {
    expect(master.payrollRun).toBeUndefined();
  });

  it("resolves the tenant database from the master tenants list and runs inside that tenant", async () => {
    await runProcessor();

    expect(mockTenantFindUnique).toHaveBeenCalledWith({
      where: { id: "t1" },
      select: { dbName: true },
    });
    expect(runWithTenant).toHaveBeenCalledWith(
      "t1",
      { name: "tenant-client" },
      expect.any(Function),
    );
    expect(mockRunPayrollDisbursement).toHaveBeenCalledWith("r1");
  });

  it("refuses a job whose tenant has no resolvable database, before any disbursement", async () => {
    mockTenantFindUnique.mockResolvedValue({ dbName: null });
    await expect(runProcessor()).rejects.toMatchObject({
      name: "PayrollRunStatusError",
      code: "TENANT_UNRESOLVED",
    });
    expect(mockRunPayrollDisbursement).not.toHaveBeenCalled();
  });

  it("refuses a job with no tenant id at all", async () => {
    await expect(runProcessor({ tenantId: undefined })).rejects.toMatchObject({
      code: "TENANT_UNRESOLVED",
    });
    expect(mockTenantFindUnique).not.toHaveBeenCalled();
    expect(mockRunPayrollDisbursement).not.toHaveBeenCalled();
  });

  it("records 'disbursed' on the tenant's own run, scoped by run id and tenant", async () => {
    await runProcessor();

    expect(mockRunUpdate).toHaveBeenCalledWith({
      where: {
        id: "r1",
        tenantId: "t1",
        status: { in: ["disbursing", "disbursement_failed"] },
      },
      data: expect.objectContaining({
        disbursedBy: "u1",
        disbursedAt: expect.any(Date),
        status: "disbursed",
      }),
    });
  });

  it("fails explicitly when the run doesn't exist in the tenant database", async () => {
    mockRunUpdate.mockRejectedValue(p2025());
    mockRunFindFirst.mockResolvedValue(null);

    const err = await runProcessor().catch((e) => e);
    expect(err).toBeInstanceOf(PayrollRunStatusError);
    expect(err.code).toBe("RUN_NOT_FOUND");
  });

  it("accepts a redelivered job whose run an earlier delivery already marked disbursed", async () => {
    mockRunUpdate.mockRejectedValue(p2025());
    mockRunFindFirst.mockResolvedValue({ status: "disbursed" });

    await expect(runProcessor()).resolves.toMatchObject({ runId: "r1" });
  });

  it("fails explicitly when the run is in a status the job can't complete from", async () => {
    mockRunUpdate.mockRejectedValue(p2025());
    mockRunFindFirst.mockResolvedValue({ status: "cancelled" });

    await expect(runProcessor()).rejects.toMatchObject({
      code: "UNEXPECTED_STATUS",
    });
  });

  it("propagates a database error instead of treating it as a missing run", async () => {
    mockRunUpdate.mockRejectedValue(new Error("connection reset"));

    await expect(runProcessor()).rejects.toThrow("connection reset");
    expect(mockRunFindFirst).not.toHaveBeenCalled();
  });

  it("runs the job inside the producer's requestId context when the job carries one", async () => {
    await runProcessor({ requestId: "req-123" });
    expect(requestIdStorage.run).toHaveBeenCalledWith(
      "req-123",
      expect.any(Function),
    );
  });

  describe("on job failure", () => {
    it("records 'disbursement_failed' on the tenant's run once retries are exhausted, then forwards to the DLQ", async () => {
      mockRunFindFirst.mockResolvedValue({ status: "disbursing" });

      await capturedHandlers.failed(exhaustedJob(), new Error("crashed"));

      expect(mockRunUpdate).toHaveBeenCalledWith({
        where: { id: "r1", tenantId: "t1", status: { in: ["disbursing"] } },
        data: { status: "disbursement_failed" },
      });
      expect(mockDlqAdd).toHaveBeenCalledWith(
        "failed-payroll-disbursement",
        expect.objectContaining({
          originalQueue: "payrollDisbursementQueue",
          originalJobId: "j1",
          runStatusRecorded: true,
        }),
      );
    });

    it("never overwrites a run already recorded as disbursed", async () => {
      mockRunFindFirst.mockResolvedValue({ status: "disbursed" });

      await capturedHandlers.failed(exhaustedJob(), new Error("late error"));

      expect(mockRunUpdate).not.toHaveBeenCalled();
      expect(mockDlqAdd).toHaveBeenCalledWith(
        "failed-payroll-disbursement",
        expect.objectContaining({ runStatusRecorded: true }),
      );
    });

    it("makes a run it cannot find visible: error log plus a DLQ entry flagged for replay", async () => {
      mockRunFindFirst.mockResolvedValue(null);
      mockRunUpdate.mockRejectedValue(p2025());

      await capturedHandlers.failed(exhaustedJob(), new Error("crashed"));

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining("could not record the failure"),
        expect.objectContaining({ code: "RUN_NOT_FOUND", runId: "r1" }),
      );
      expect(mockDlqAdd).toHaveBeenCalledWith(
        "failed-payroll-disbursement",
        expect.objectContaining({
          runStatusRecorded: false,
          runStatusError: "RUN_NOT_FOUND",
        }),
      );
    });

    it("reports an unresolvable tenant the same way", async () => {
      mockTenantFindUnique.mockResolvedValue(null);

      await capturedHandlers.failed(exhaustedJob(), new Error("crashed"));

      expect(mockRunUpdate).not.toHaveBeenCalled();
      expect(mockDlqAdd).toHaveBeenCalledWith(
        "failed-payroll-disbursement",
        expect.objectContaining({
          runStatusRecorded: false,
          runStatusError: "TENANT_UNRESOLVED",
        }),
      );
    });

    it("does not touch run status or forward to DLQ while retry attempts remain", async () => {
      await capturedHandlers.failed(
        { ...exhaustedJob(), attemptsMade: 1 },
        new Error("transient"),
      );

      expect(mockRunUpdate).not.toHaveBeenCalled();
      expect(mockDlqAdd).not.toHaveBeenCalled();
    });
  });

  it("binds the gateway tenant context grpcCall forwards, so payslip lookups reach salary-service with this tenant and its database", async () => {
    const { gatewayTenantStorage } = jest.requireActual(
      "../middleware/tenantContext",
    );
    let seen: unknown;
    mockRunPayrollDisbursement.mockImplementation(async () => {
      seen = gatewayTenantStorage.getStore();
      return { runId: "r1", payoutOk: 1, payoutFail: 0 };
    });

    await runProcessor({ tenantId: "t9" });

    expect(seen).toEqual({ tenantId: "t9", dbName: "hrms-test-tenant" });
  });
});
