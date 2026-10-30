import { createHash } from "crypto";

jest.mock("../grpc/clients", () => ({
  recruitmentClient: {},
  grpcCall: jest.fn(),
}));

jest.mock("../config/s3", () => ({
  s3Client: { send: jest.fn() },
  S3_BUCKET: "bucket",
  S3_URL_PREFIX: "https://cdn.example/",
  s3FileUrl: (key: string) => `https://cdn.example/${key}`,
}));

jest.mock("@hrms/db", () => {
  const _db = {
    applicationDraft: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    jobApplication: { findFirst: jest.fn() },
    tenant: { findUnique: jest.fn() },
  };
  return {
    prisma: _db,
    prismaWithTenant: _db,
    getTenantId: jest.fn().mockReturnValue("t1"),
  };
});

jest.mock("@hrms/common", () => ({
  RESPONSE_STATUS: {
    SUCCESS: 200,
    CREATED: 201,
    BAD_REQUEST: 400,
    NOT_FOUND: 404,
    CONFLICT: 409,
  },
  grpcToHttpStatus: jest.requireActual("@hrms/common").grpcToHttpStatus,
  sendEmail: jest.fn().mockResolvedValue(undefined),
  tenantFrom: (n: string) => n,
  renderEmailHtml: ({ bodyHtml }: { bodyHtml: string }) => bodyHtml,
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

import { prisma } from "@hrms/db";
import { sendEmail } from "@hrms/common";
import { grpcCall } from "../grpc/clients";
import { s3Client } from "../config/s3";
import {
  authorizeDraft,
  createDraft,
  saveDraft,
  sendRecoveryCode,
  submitDraft,
  verifyRecoveryCode,
} from "../services/careerApplications";

const db = prisma as any;
const mockGrpc = grpcCall as jest.Mock;
const mockSend = sendEmail as jest.Mock;
const sha = (v: string) => createHash("sha256").update(v).digest("hex");

const JOB_ID = "a".repeat(24);
const DRAFT_ID = "b".repeat(24);
const job = {
  id: JOB_ID,
  jobTitle: "Engineer",
  status: "Active",
  applicationFormJson: JSON.stringify({ resume: "optional" }),
  screeningQuestionsJson: "[]",
};
const isOpen = (j: any) => j?.status === "Active";

const personal = {
  name: "Asha Rao",
  email: "Asha@Example.com",
  mobile: "9876543210",
};
const complete = {
  ...personal,
  profile: { currentLocation: "Pune", totalExperience: 3 },
  consent: true,
};

const draftRow = (over: Record<string, any> = {}) => ({
  id: DRAFT_ID,
  jobOpeningId: JOB_ID,
  email: "asha@example.com",
  data: complete,
  revision: 3,
  tokenHashes: [sha("tok")],
  emailVerifiedAt: null,
  status: "draft",
  applicationId: null,
  expiresAt: new Date(Date.now() + 86_400_000),
  updatedAt: new Date(),
  recoveryAttempts: 0,
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockGrpc.mockImplementation(async (_c: unknown, method: string) =>
    method === "getJobOpening"
      ? { data: job }
      : { status: 0, data: { id: "app-1" } },
  );
  db.jobApplication.findFirst.mockResolvedValue(null);
  db.applicationDraft.findFirst.mockResolvedValue(null);
  db.applicationDraft.create.mockImplementation(async ({ data }: any) => ({
    ...draftRow(),
    ...data,
    revision: 1,
  }));
  db.tenant.findUnique.mockResolvedValue({ name: "Acme" });
});

describe("creating drafts", () => {
  it("needs name, email and mobile before anything is stored", async () => {
    const r = await createDraft(JOB_ID, { name: "A" }, isOpen);
    expect(r.httpStatus).toBe(400);
    expect(Object.keys((r.body as any).errors).sort()).toEqual([
      "email",
      "mobile",
      "name",
    ]);
    expect(db.applicationDraft.create).not.toHaveBeenCalled();
  });

  it("stores only a hash of the token it hands back", async () => {
    const r = await createDraft(JOB_ID, personal, isOpen);
    expect(r.httpStatus).toBe(201);
    const token = (r.body as any).data.token;
    const stored = db.applicationDraft.create.mock.calls[0][0].data;
    expect(stored.tokenHashes).toEqual([sha(token)]);
    expect(stored.email).toBe("asha@example.com");
    expect(JSON.stringify(stored)).not.toContain(token);
  });

  it("won't hand out an existing draft to whoever types its email", async () => {
    db.applicationDraft.findFirst.mockResolvedValueOnce({ id: DRAFT_ID });
    const r = await createDraft(JOB_ID, personal, isOpen);
    expect(r.httpStatus).toBe(409);
    expect((r.body as any).code).toBe("DRAFT_EXISTS");
    expect((r.body as any).data).toBeUndefined();
  });

  it("refuses a second application to the same job", async () => {
    db.jobApplication.findFirst.mockResolvedValueOnce({ id: "app-0" });
    const r = await createDraft(JOB_ID, personal, isOpen);
    expect((r.body as any).code).toBe("ALREADY_APPLIED");
  });

  it("refuses drafts for closed openings", async () => {
    mockGrpc.mockResolvedValueOnce({ data: { ...job, status: "Expired" } });
    const r = await createDraft(JOB_ID, personal, isOpen);
    expect(r.httpStatus).toBe(404);
  });
});

describe("draft access", () => {
  it("needs the right token — knowing the id isn't enough", async () => {
    db.applicationDraft.findUnique.mockResolvedValue(draftRow());
    expect(await authorizeDraft(DRAFT_ID, "tok")).not.toBeNull();
    expect(await authorizeDraft(DRAFT_ID, "guess")).toBeNull();
    expect(await authorizeDraft(DRAFT_ID, undefined)).toBeNull();
  });

  it("refuses expired and discarded drafts", async () => {
    db.applicationDraft.findUnique.mockResolvedValueOnce(
      draftRow({ expiresAt: new Date(Date.now() - 1000) }),
    );
    expect(await authorizeDraft(DRAFT_ID, "tok")).toBeNull();
    db.applicationDraft.findUnique.mockResolvedValueOnce(
      draftRow({ status: "discarded" }),
    );
    expect(await authorizeDraft(DRAFT_ID, "tok")).toBeNull();
  });
});

describe("saving drafts", () => {
  it("refuses a stale revision and returns the newer server copy", async () => {
    const r = await saveDraft(draftRow() as any, 2, complete, isOpen);
    expect(r.httpStatus).toBe(409);
    expect((r.body as any).code).toBe("STALE");
    expect((r.body as any).data.revision).toBe(3);
    expect(db.applicationDraft.updateMany).not.toHaveBeenCalled();
  });

  it("saves conditionally on the revision so racing saves can't both win", async () => {
    db.applicationDraft.updateMany.mockResolvedValueOnce({ count: 0 });
    db.applicationDraft.findUnique.mockResolvedValueOnce(
      draftRow({ revision: 4 }),
    );
    const r = await saveDraft(draftRow() as any, 3, complete, isOpen);
    expect(db.applicationDraft.updateMany.mock.calls[0][0].where).toEqual({
      id: DRAFT_ID,
      revision: 3,
      status: "draft",
    });
    expect(r.httpStatus).toBe(409);
  });

  it("clears verification when the email changes", async () => {
    db.applicationDraft.updateMany.mockResolvedValueOnce({ count: 1 });
    db.applicationDraft.findUnique.mockResolvedValueOnce(
      draftRow({ revision: 4 }),
    );
    await saveDraft(
      draftRow({ emailVerifiedAt: new Date() }) as any,
      3,
      { ...complete, email: "other@example.com" },
      isOpen,
    );
    expect(db.applicationDraft.updateMany.mock.calls[0][0].data).toMatchObject({
      email: "other@example.com",
      emailVerifiedAt: null,
    });
  });
});

describe("submitting", () => {
  beforeEach(() => {
    db.applicationDraft.updateMany.mockResolvedValue({ count: 1 });
  });

  it("creates one application and records it on the draft", async () => {
    const r = await submitDraft(draftRow() as any, isOpen);
    expect(r.httpStatus).toBe(200);
    expect(mockGrpc).toHaveBeenCalledWith(
      expect.anything(),
      "applyForJob",
      expect.objectContaining({
        email: "asha@example.com",
        emailVerified: false,
      }),
    );
    expect(db.applicationDraft.update).toHaveBeenLastCalledWith({
      where: { id: DRAFT_ID },
      data: expect.objectContaining({
        status: "submitted",
        applicationId: "app-1",
        data: {},
      }),
    });
  });

  it("answers a retry with the same application instead of creating another", async () => {
    const r = await submitDraft(
      draftRow({ status: "submitted", applicationId: "app-1" }) as any,
      isOpen,
    );
    expect((r.body as any).data).toEqual({
      id: "app-1",
      alreadySubmitted: true,
    });
    expect(mockGrpc).not.toHaveBeenCalledWith(
      expect.anything(),
      "applyForJob",
      expect.anything(),
    );
  });

  it("lets only one of two concurrent submits through", async () => {
    db.applicationDraft.updateMany.mockResolvedValueOnce({ count: 0 });
    const r = await submitDraft(draftRow() as any, isOpen);
    expect((r.body as any).code).toBe("IN_PROGRESS");
    expect(mockGrpc).not.toHaveBeenCalledWith(
      expect.anything(),
      "applyForJob",
      expect.anything(),
    );
  });

  it("puts an incomplete draft back to draft with field errors", async () => {
    const r = await submitDraft(draftRow({ data: personal }) as any, isOpen);
    expect(r.httpStatus).toBe(400);
    expect((r.body as any).errors).toHaveProperty("consent");
    expect(db.applicationDraft.update).toHaveBeenLastCalledWith({
      where: { id: DRAFT_ID },
      data: { status: "draft" },
    });
  });

  it("checks the uploaded résumé's real size", async () => {
    (s3Client.send as jest.Mock).mockResolvedValueOnce({
      ContentLength: 9 * 1024 * 1024,
      ContentType: "application/pdf",
    });
    const r = await submitDraft(
      draftRow({
        data: {
          ...complete,
          resume: "https://cdn.example/job_applications/t1/x.pdf",
        },
      }) as any,
      isOpen,
    );
    expect((r.body as any).errors.resume).toMatch(/5 MB/);
  });

  it("only counts the email as verified if it wasn't changed after verifying", async () => {
    await submitDraft(draftRow({ emailVerifiedAt: new Date() }) as any, isOpen);
    expect(mockGrpc).toHaveBeenLastCalledWith(
      expect.anything(),
      "applyForJob",
      expect.objectContaining({ emailVerified: true }),
    );
  });
});

describe("recovery on another device", () => {
  it("answers the same whether or not a draft exists, and emails only when one does", async () => {
    const none = await sendRecoveryCode(JOB_ID, "nobody@example.com", isOpen);
    db.applicationDraft.findFirst.mockResolvedValueOnce(draftRow());
    const some = await sendRecoveryCode(JOB_ID, "asha@example.com", isOpen);
    expect(none.body).toEqual(some.body);
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][0].to).toBe("asha@example.com");
    // The code is stored hashed, never in clear.
    const stored = db.applicationDraft.update.mock.calls[0][0].data;
    const code = /(\d{6})<\/p>/.exec(mockSend.mock.calls[0][0].html)![1];
    expect(stored.recoveryCodeHash).toBe(sha(`${DRAFT_ID}:${code}`));
  });

  it("doesn't resend within a minute", async () => {
    db.applicationDraft.findFirst.mockResolvedValueOnce(
      draftRow({ recoveryCodeSentAt: new Date() }),
    );
    await sendRecoveryCode(JOB_ID, "asha@example.com", isOpen);
    expect(mockSend).not.toHaveBeenCalled();
  });

  const withCode = (over = {}) =>
    draftRow({
      recoveryCodeHash: sha(`${DRAFT_ID}:123456`),
      recoveryCodeExpiresAt: new Date(Date.now() + 60_000),
      ...over,
    });

  it("issues this device its own token for the right code", async () => {
    db.applicationDraft.findFirst.mockResolvedValueOnce(withCode());
    db.applicationDraft.update.mockImplementationOnce(
      async ({ data }: any) => ({
        ...withCode(),
        ...data,
      }),
    );
    const r = await verifyRecoveryCode(
      JOB_ID,
      "asha@example.com",
      "123456",
      isOpen,
    );
    expect(r.httpStatus).toBe(200);
    const token = (r.body as any).data.token;
    const data = db.applicationDraft.update.mock.calls[0][0].data;
    expect(data.tokenHashes).toEqual([sha("tok"), sha(token)]);
    expect(data.recoveryCodeHash).toBeNull();
    expect(data.emailVerifiedAt).toBeInstanceOf(Date);
  });

  it("counts wrong guesses and kills the code after five", async () => {
    db.applicationDraft.findFirst.mockResolvedValueOnce(
      withCode({ recoveryAttempts: 4 }),
    );
    const r = await verifyRecoveryCode(
      JOB_ID,
      "asha@example.com",
      "000000",
      isOpen,
    );
    expect(r.httpStatus).toBe(400);
    expect(db.applicationDraft.update.mock.calls[0][0].data).toEqual({
      recoveryAttempts: 5,
      recoveryCodeHash: null,
    });
  });

  it("refuses an expired code", async () => {
    db.applicationDraft.findFirst.mockResolvedValueOnce(
      withCode({ recoveryCodeExpiresAt: new Date(Date.now() - 1) }),
    );
    const r = await verifyRecoveryCode(
      JOB_ID,
      "asha@example.com",
      "123456",
      isOpen,
    );
    expect(r.httpStatus).toBe(400);
    expect(db.applicationDraft.update).not.toHaveBeenCalled();
  });
});
