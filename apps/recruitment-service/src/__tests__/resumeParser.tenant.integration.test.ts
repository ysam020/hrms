/**
 * Two-tenant integration test for resume scoring: @hrms/db's real tenant
 * routing over an in-memory PrismaClient, one database per tenant. Both
 * tenants hold an application with the same id; the master database holds
 * a decoy the previous implementation (master client, no tenant) used.
 */
jest.mock(
  "@prisma/client",
  () => require("@hrms/db/testing").prismaClientModule,
);

const mockDlqAdd = jest.fn().mockResolvedValue(undefined);
jest.mock("@hrms/queue", () => ({
  getBullMQConnection: jest.fn(() => ({})),
  getDeadLetterQueue: jest.fn(() => ({ add: mockDlqAdd })),
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  requestIdStorage: { run: jest.fn((_id: string, fn: () => any) => fn()) },
}));

jest.mock("pdf-parse", () =>
  jest.fn().mockResolvedValue({ text: "Experienced engineer." }),
);

let processor: (job: any) => Promise<void>;
let handlers: Record<string, (...args: any[]) => void> = {};
jest.mock("bullmq", () => ({
  Worker: jest.fn().mockImplementation((_q: string, p: any) => {
    processor = p;
    handlers = {};
    return {
      on: (event: string, h: any) => {
        handlers[event] = h;
      },
    };
  }),
}));

import {
  MASTER_DB,
  readTable,
  resetDatabases,
  seedDatabase,
} from "@hrms/db/testing";
import { startResumeParserWorker } from "../workers/resumeParser";

const TENANT_A = "aaaaaaaaaaaaaaaaaaaaaaaa";
const TENANT_B = "bbbbbbbbbbbbbbbbbbbbbbbb";
const DB_A = "tenant_a_db";
const DB_B = "tenant_b_db";
const SHARED_APPLICATION_ID = "app000000000000000000001";

const application = (title: string) => ({
  id: SHARED_APPLICATION_ID,
  resume: "data:application/pdf;base64,JVBERi0xLjQ=",
  jobTitleId: "jt",
  status: "Pending",
  resumeScore: null,
  jobOpening: {
    jobTitle: title,
    requiredSkills: "TypeScript",
    jobDescription: "Build APIs",
    experience: 2,
  },
});

function seed() {
  resetDatabases();
  seedDatabase(MASTER_DB, {
    tenant: [
      { id: TENANT_A, isActive: true, dbName: DB_A },
      { id: TENANT_B, isActive: true, dbName: DB_B },
    ],
    jobApplication: [application("master decoy")],
  });
  seedDatabase(DB_A, { jobApplication: [application("A role")] });
  seedDatabase(DB_B, { jobApplication: [application("B role")] });
}

const score = (db: string) => readTable(db, "jobApplication")[0].resumeScore;

describe("resume scoring across two tenants (real tenant routing, in-memory databases)", () => {
  beforeAll(() => {
    process.env.DEV_MONGODB_URI = "mongodb://fake-host/master";
  });
  beforeEach(() => {
    jest.clearAllMocks();
    seed();
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        message: { content: JSON.stringify({ score: 8, notes: "Strong" }) },
      }),
    });
    startResumeParserWorker();
  });

  it("scores the application in the job's tenant only, despite the same id existing in the other tenant", async () => {
    await processor({
      id: "j1",
      data: { applicationId: SHARED_APPLICATION_ID, tenantId: TENANT_B },
    });

    expect(score(DB_B)).toBe(8);
    expect(readTable(DB_B, "jobApplication")[0].status).toBe("Applied");
    expect(score(DB_A)).toBeNull();
    expect(score(MASTER_DB)).toBeNull();
    // The LLM prompt was built from tenant B's own job opening.
    const prompt = JSON.stringify((global as any).fetch.mock.calls[0][1]);
    expect(prompt).toContain("B role");
    expect(prompt).not.toContain("A role");
  });

  it("refuses a job without tenantId permanently, writes nothing, and records it in the dead-letter queue", async () => {
    const job = { id: "j2", data: { applicationId: SHARED_APPLICATION_ID } };
    const run = processor(job);
    await expect(run).rejects.toMatchObject({ name: "UnrecoverableError" });
    await expect(run).rejects.toThrow(/has no tenantId/);
    expect(score(DB_A)).toBeNull();
    expect(score(DB_B)).toBeNull();
    expect(score(MASTER_DB)).toBeNull();

    handlers.failed(job, await run.catch((e) => e));
    expect(mockDlqAdd).toHaveBeenCalledWith(
      "failed-resume-parse",
      expect.objectContaining({ jobId: "j2" }),
    );
  });

  it("refuses an unknown tenant permanently rather than falling back to the master database", async () => {
    await expect(
      processor({
        id: "j3",
        data: {
          applicationId: SHARED_APPLICATION_ID,
          tenantId: "eeeeeeeeeeeeeeeeeeeeeeee",
        },
      }),
    ).rejects.toMatchObject({ name: "UnrecoverableError" });
    expect(score(MASTER_DB)).toBeNull();
  });

  it("refuses a tenant without its own database", async () => {
    seedDatabase(MASTER_DB, {
      tenant: [{ id: TENANT_A, isActive: true, dbName: null }],
    });
    await expect(
      processor({
        id: "j4",
        data: { applicationId: SHARED_APPLICATION_ID, tenantId: TENANT_A },
      }),
    ).rejects.toThrow(/has no resolvable database/);
    expect(score(MASTER_DB)).toBeNull();
    expect(score(DB_A)).toBeNull();
  });
});
