import { attachAuditLogging, redactAuditValue } from "../auditMiddleware";
import { getAuditActor, getTenantClient, getTenantId } from "../tenantContext";

jest.mock("../tenantContext", () => ({
  getAuditActor: jest.fn(),
  getTenantClient: jest.fn(),
  getTenantId: jest.fn(),
}));

// Applicant data must never reach an audit row: Aadhaar numbers (any
// spelling), resumes, cover letters and draft form contents. Synthetic
// values only.
const AADHAAR = "1234 5678 9012";
const RESUME = `data:application/pdf;base64,${"QUJD".repeat(4000)}`;
const COVER = "Synthetic cover letter body. ".repeat(20);
const SECRETS = [AADHAAR, "QUJDQUJD", "Synthetic cover letter body"];

function makeClient(modelDelegates: Record<string, any> = {}) {
  const middlewares: Array<(params: any, next: any) => Promise<unknown>> = [];
  const client: any = {
    $use: jest.fn((fn: any) => middlewares.push(fn)),
    auditLog: { create: jest.fn().mockResolvedValue({}) },
    ...modelDelegates,
  };
  return { client, middlewares };
}

const flush = () => new Promise((r) => setImmediate(r));

function auditPayload(client: any): string {
  expect(client.auditLog.create).toHaveBeenCalledTimes(1);
  return JSON.stringify(client.auditLog.create.mock.calls[0][0]);
}

beforeEach(() => {
  jest.clearAllMocks();
  (getAuditActor as jest.Mock).mockReturnValue({
    userId: "actor-1",
    username: "hr.user",
    ipAddress: "10.0.0.1",
    userAgent: "jest",
  });
  (getTenantId as jest.Mock).mockReturnValue("tenant-1");
  (getTenantClient as jest.Mock).mockReturnValue(null);
});

describe("audit trail keeps applicant data out", () => {
  it("CREATE of a JobApplication stores no Aadhaar, resume or cover letter", async () => {
    const { client, middlewares } = makeClient();
    attachAuditLogging(client);
    const created = {
      id: "app-1",
      jobTitleId: "job-1",
      status: "Applied",
      aadharNo: AADHAAR,
      resume: RESUME,
      coverLetter: COVER,
    };
    await middlewares[0](
      { model: "JobApplication", action: "create", args: { data: created } },
      jest.fn().mockResolvedValue(created),
    );
    await flush();

    const payload = auditPayload(client);
    for (const s of SECRETS) expect(payload).not.toContain(s);
    const data = client.auditLog.create.mock.calls[0][0].data;
    // Useful metadata survives.
    expect(data).toMatchObject({
      action: "CREATE",
      entityType: "JobApplication",
      userId: "actor-1",
      username: "hr.user",
      tenantId: "tenant-1",
    });
    expect(data.newValue).toMatchObject({
      id: "app-1",
      jobTitleId: "job-1",
      status: "Applied",
    });
    expect(data.newValue.aadharNo).toBe("[REDACTED]");
    expect(data.newValue.resume).toMatch(/^\[OMITTED: \d+ bytes\]$/);
  });

  it("UPDATE records that a hidden field changed, without either value", async () => {
    const before = {
      id: "app-1",
      status: "Applied",
      aadharNo: "9999 8888 7777",
      resume: "s3/old.pdf",
    };
    const after = {
      id: "app-1",
      status: "Shortlisted",
      aadharNo: AADHAAR,
      resume: "s3/old.pdf",
    };
    const { client, middlewares } = makeClient({
      jobApplication: { findUnique: jest.fn().mockResolvedValue(before) },
    });
    attachAuditLogging(client);
    await middlewares[0](
      {
        model: "JobApplication",
        action: "update",
        args: { where: { id: "app-1" } },
      },
      jest.fn().mockResolvedValue(after),
    );
    await flush();

    const payload = auditPayload(client);
    for (const s of [...SECRETS, "9999 8888 7777"])
      expect(payload).not.toContain(s);
    const { oldValue, newValue } = client.auditLog.create.mock.calls[0][0].data;
    expect(oldValue.aadharNo).toBe("[REDACTED]");
    expect(newValue.aadharNo).toBe("[REDACTED] (changed)");
    // Unchanged hidden field is not flagged as changed.
    expect(newValue.resume).toMatch(/^\[OMITTED: \d+ bytes\]$/);
    expect(newValue.status).toBe("Shortlisted");
  });

  it("ApplicationDraft form data is omitted wholesale, including nested Aadhaar", async () => {
    const draft = {
      id: "d1",
      email: "applicant@example.test",
      status: "draft",
      data: {
        fullName: "Synthetic Person",
        identity: { aadhaar_no: AADHAAR },
        resume: RESUME,
      },
    };
    const { client, middlewares } = makeClient();
    attachAuditLogging(client);
    await middlewares[0](
      { model: "ApplicationDraft", action: "create", args: { data: draft } },
      jest.fn().mockResolvedValue(draft),
    );
    await flush();

    const payload = auditPayload(client);
    for (const s of [...SECRETS, "Synthetic Person"])
      expect(payload).not.toContain(s);
    expect(client.auditLog.create.mock.calls[0][0].data.newValue.data).toMatch(
      /^\[OMITTED/,
    );
  });

  it("read-time redaction hides legacy rows written before these rules", () => {
    const legacyRow = { aadharNo: AADHAAR, resume: RESUME, status: "Applied" };
    const out = JSON.stringify(redactAuditValue(legacyRow, "JobApplication"));
    for (const s of SECRETS) expect(out).not.toContain(s);
    expect(out).toContain('"status":"Applied"');
  });

  it("does not change behaviour for ordinary models", async () => {
    const before = { id: "l1", status: "Pending", days: 2 };
    const after = { id: "l1", status: "Approved", days: 2 };
    const { client, middlewares } = makeClient({
      leaveApplication: { findUnique: jest.fn().mockResolvedValue(before) },
    });
    attachAuditLogging(client);
    await middlewares[0](
      {
        model: "LeaveApplication",
        action: "update",
        args: { where: { id: "l1" } },
      },
      jest.fn().mockResolvedValue(after),
    );
    await flush();
    const { oldValue, newValue } = client.auditLog.create.mock.calls[0][0].data;
    expect(oldValue).toEqual(before);
    expect(newValue).toEqual(after);
  });
});
