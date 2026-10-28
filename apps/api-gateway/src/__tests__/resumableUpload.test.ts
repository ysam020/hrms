// Resumable (S3 multipart) upload handlers: ownership, validation, and that
// /complete only succeeds when S3 holds every part at the declared size.

const store = new Map<string, string>();
jest.mock("@hrms/cache", () => ({
  getRedisClient: () => ({
    set: jest.fn(async (k: string, v: string) => {
      store.set(k, v);
      return "OK";
    }),
    get: jest.fn(async (k: string) => store.get(k) ?? null),
    del: jest.fn(async (k: string) => (store.delete(k) ? 1 : 0)),
  }),
}));
jest.mock("@hrms/logger", () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));
jest.mock("@hrms/common", () => ({
  apiResponse: (res: any, status: number, payload: any) =>
    res.status(status).json({ success: status < 400, ...payload }),
  RESPONSE_STATUS: {
    SUCCESS: 200,
    BAD_REQUEST: 400,
    NOT_FOUND: 404,
    CONFLICT: 409,
  },
  hasPrivilegedRole: jest.fn(),
  HR_ROLES: [],
}));
jest.mock("../utils/handleError", () => ({
  handleError: (res: any, e: any) =>
    res.status(500).json({ success: false, message: String(e) }),
}));
jest.mock("@hrms/db", () => ({
  prismaWithTenant: {},
  getTenantId: () => "t1",
}));
jest.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: jest.fn(
    async (_c: unknown, cmd: any) =>
      `https://s3.example/${cmd.input.Key}?part=${cmd.input.PartNumber}`,
  ),
}));

const sent: any[] = [];
let s3Parts: { PartNumber: number; Size: number; ETag: string }[] = [];
jest.mock("../config/s3", () => ({
  S3_BUCKET: "bucket",
  s3FileUrl: (k: string) => `https://bucket/${k}`,
  s3Client: {
    send: jest.fn(async (cmd: any) => {
      sent.push(cmd);
      const name = cmd.constructor.name;
      if (name === "CreateMultipartUploadCommand") return { UploadId: "up1" };
      if (name === "ListPartsCommand")
        return { Parts: s3Parts, IsTruncated: false };
      return {};
    }),
  },
}));

import {
  abortMultipartUpload,
  completeMultipartUpload,
  getPartUploadUrl,
  listUploadedParts,
  startMultipartUpload,
} from "../handlers/resumableUpload";

const MB = 1024 * 1024;

function res() {
  const r: any = { statusCode: 200 };
  r.status = (c: number) => ((r.statusCode = c), r);
  r.json = (b: unknown) => ((r.body = b), r);
  return r;
}
const req = (
  body: any = {},
  user = { userId: "u1", tenantId: "t1" },
  params = {},
) => ({ body, user, params }) as any;

const startBody = {
  fileName: "certificate.pdf",
  fileType: "application/pdf",
  size: 12 * MB,
  folder: "leave",
  username: "asha.raman",
};

beforeEach(() => {
  store.clear();
  sent.length = 0;
  s3Parts = [];
});

describe("resumable uploads", () => {
  it("starts a session scoped to the user", async () => {
    const r = res();
    await startMultipartUpload(req(startBody), r);
    expect(r.statusCode).toBe(200);
    expect(r.body.data).toMatchObject({ uploadId: "up1", partCount: 3 });
    expect([...store.keys()]).toEqual(["upload:t1:u1:up1"]);
  });

  it("rejects disallowed types and oversized files", async () => {
    const a = res();
    await startMultipartUpload(req({ ...startBody, fileName: "x.exe" }), a);
    expect(a.statusCode).toBe(400);
    const b = res();
    await startMultipartUpload(req({ ...startBody, size: 40 * MB }), b);
    expect(b.statusCode).toBe(400);
    const c = res();
    await startMultipartUpload(
      req({ ...startBody, fileType: "application/x-msdownload" }),
      c,
    );
    expect(c.statusCode).toBe(400);
  });

  it("does not let another user or tenant use the session", async () => {
    await startMultipartUpload(req(startBody), res());
    for (const user of [
      { userId: "u2", tenantId: "t1" },
      { userId: "u1", tenantId: "t2" },
    ]) {
      const r = res();
      await getPartUploadUrl(req({ uploadId: "up1", partNumber: 1 }, user), r);
      expect(r.statusCode).toBe(404);
      const c = res();
      await completeMultipartUpload(req({ uploadId: "up1" }, user), c);
      expect(c.statusCode).toBe(404);
    }
  });

  it("signs part URLs only within the part range", async () => {
    await startMultipartUpload(req(startBody), res());
    const ok = res();
    await getPartUploadUrl(req({ uploadId: "up1", partNumber: 2 }), ok);
    expect(ok.body.data.url).toContain("part=2");
    const bad = res();
    await getPartUploadUrl(req({ uploadId: "up1", partNumber: 4 }), bad);
    expect(bad.statusCode).toBe(400);
  });

  it("reports server-confirmed parts for resuming", async () => {
    await startMultipartUpload(req(startBody), res());
    s3Parts = [{ PartNumber: 1, Size: 5 * MB, ETag: '"a"' }];
    const r = res();
    await listUploadedParts(req({}, undefined, { uploadId: "up1" }), r);
    expect(r.body.data.parts).toEqual([{ partNumber: 1, size: 5 * MB }]);
  });

  it("refuses to complete until every part is present", async () => {
    await startMultipartUpload(req(startBody), res());
    s3Parts = [
      { PartNumber: 1, Size: 5 * MB, ETag: '"a"' },
      { PartNumber: 3, Size: 2 * MB, ETag: '"c"' },
    ];
    const r = res();
    await completeMultipartUpload(req({ uploadId: "up1" }), r);
    expect(r.statusCode).toBe(409);
    expect(
      sent.some((c) => c.constructor.name === "CompleteMultipartUploadCommand"),
    ).toBe(false);
    expect(store.size).toBe(1);
  });

  it("refuses to complete when sizes don't add up", async () => {
    await startMultipartUpload(req(startBody), res());
    s3Parts = [
      { PartNumber: 1, Size: 5 * MB, ETag: '"a"' },
      { PartNumber: 2, Size: 5 * MB, ETag: '"b"' },
      { PartNumber: 3, Size: 1 * MB, ETag: '"c"' },
    ];
    const r = res();
    await completeMultipartUpload(req({ uploadId: "up1" }), r);
    expect(r.statusCode).toBe(409);
  });

  it("completes with S3's own ETags and ends the session", async () => {
    await startMultipartUpload(req(startBody), res());
    s3Parts = [
      { PartNumber: 1, Size: 5 * MB, ETag: '"a"' },
      { PartNumber: 2, Size: 5 * MB, ETag: '"b"' },
      { PartNumber: 3, Size: 2 * MB, ETag: '"c"' },
    ];
    const r = res();
    await completeMultipartUpload(req({ uploadId: "up1" }), r);
    expect(r.statusCode).toBe(200);
    const done = sent.find(
      (c) => c.constructor.name === "CompleteMultipartUploadCommand",
    );
    expect(done.input.MultipartUpload.Parts).toEqual([
      { PartNumber: 1, ETag: '"a"' },
      { PartNumber: 2, ETag: '"b"' },
      { PartNumber: 3, ETag: '"c"' },
    ]);
    expect(store.size).toBe(0);
  });

  it("aborts and forgets the session", async () => {
    await startMultipartUpload(req(startBody), res());
    const r = res();
    await abortMultipartUpload(req({ uploadId: "up1" }), r);
    expect(r.statusCode).toBe(200);
    expect(store.size).toBe(0);
  });
});
