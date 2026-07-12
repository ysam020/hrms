import {
  getExitInterviewTemplate,
  updateExitInterviewTemplate,
  submitExitInterviewResponse,
} from "../handlers/exitInterviewTemplates";

jest.mock("@hrms/db", () => {
  const _db = {
    exitInterviewTemplate: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    exitInterviewResponse: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    resignation: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  };
  return { prismaWithTenant: _db };
});

jest.mock("@hrms/cache", () => ({
  cacheManager: { invalidatePattern: jest.fn() },
}));

jest.mock("@hrms/common", () => ({
  apiResponse: jest.fn((res: any, status: number, data: any) =>
    res.json({ status, ...data }),
  ),
  RESPONSE_STATUS: {
    SUCCESS: 200,
    NOT_FOUND: 404,
    FORBIDDEN: 403,
  },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock("../utils/user", () => ({
  isSuperUser: jest.fn().mockResolvedValue(false),
}));

import { prismaWithTenant as prisma } from "@hrms/db";
import { cacheManager } from "@hrms/cache";

const mockTemplateFindFirst = (prisma as any).exitInterviewTemplate
  .findFirst as jest.Mock;
const mockTemplateCreate = (prisma as any).exitInterviewTemplate
  .create as jest.Mock;
const mockTemplateUpdate = (prisma as any).exitInterviewTemplate
  .update as jest.Mock;
const mockResponseFindFirst = (prisma as any).exitInterviewResponse
  .findFirst as jest.Mock;
const mockResponseCreate = (prisma as any).exitInterviewResponse
  .create as jest.Mock;
const mockResignationFindFirst = (prisma as any).resignation
  .findFirst as jest.Mock;
const mockResignationUpdate = (prisma as any).resignation.update as jest.Mock;
const mockInvalidate = cacheManager.invalidatePattern as jest.Mock;

const makeReq = (overrides: any = {}) =>
  ({
    user: { userId: "user-1", tenantId: "t1", tenantRole: "hr" },
    params: {},
    body: {},
    ...overrides,
  }) as any;
const makeRes = () => ({ json: jest.fn() }) as any;

describe("exitInterviewTemplates handlers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInvalidate.mockResolvedValue(undefined);
  });

  describe("getExitInterviewTemplate", () => {
    it("returns the default question set when no template row exists", async () => {
      mockTemplateFindFirst.mockResolvedValue(null);
      const res = makeRes();
      await getExitInterviewTemplate(makeReq(), res);
      const data = (res.json as jest.Mock).mock.calls[0][0].data;
      expect(data.id).toBeNull();
      expect(data.questions.length).toBeGreaterThan(0);
    });

    it("orders by updatedAt desc so it always resolves the freshest row", async () => {
      mockTemplateFindFirst.mockResolvedValue({ id: "tpl-1", questions: [] });
      await getExitInterviewTemplate(makeReq(), makeRes());
      expect(mockTemplateFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { updatedAt: "desc" } }),
      );
    });
  });

  describe("updateExitInterviewTemplate", () => {
    it("updates the existing template, resolved with the same orderBy as the read path", async () => {
      mockTemplateFindFirst.mockResolvedValue({ id: "tpl-1" });
      mockTemplateUpdate.mockResolvedValue({ id: "tpl-1", questions: [] });
      await updateExitInterviewTemplate(
        makeReq({ body: { questions: [{ id: "q1", label: "Q1" }] } }),
        makeRes(),
      );
      expect(mockTemplateFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { updatedAt: "desc" } }),
      );
      expect(mockTemplateUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "tpl-1" } }),
      );
      expect(mockTemplateCreate).not.toHaveBeenCalled();
    });

    it("creates a template when none exists yet", async () => {
      mockTemplateFindFirst.mockResolvedValue(null);
      mockTemplateCreate.mockResolvedValue({ id: "tpl-new" });
      await updateExitInterviewTemplate(
        makeReq({ body: { questions: [] } }),
        makeRes(),
      );
      expect(mockTemplateCreate).toHaveBeenCalled();
    });

    it("returns FORBIDDEN for a non-privileged caller", async () => {
      const res = makeRes();
      await updateExitInterviewTemplate(
        makeReq({
          user: { userId: "u1", tenantId: "t1", tenantRole: "employee" },
          body: { questions: [] },
        }),
        res,
      );
      expect(mockTemplateFindFirst).not.toHaveBeenCalled();
      expect((res.json as jest.Mock).mock.calls[0][0].status).toBe(403);
    });
  });

  describe("submitExitInterviewResponse", () => {
    beforeEach(() => {
      mockResignationFindFirst.mockResolvedValue({
        id: "res-1",
        userId: "user-1",
      });
      mockTemplateFindFirst.mockResolvedValue({ id: "tpl-1" });
      mockResponseFindFirst.mockResolvedValue(null);
      mockResponseCreate.mockResolvedValue({ id: "resp-1" });
      mockResignationUpdate.mockResolvedValue({});
    });

    it("invalidates the resignations cache after recording the response", async () => {
      // Regression test: this used to update the resignation's
      // feedbackSubmittedOn without ever invalidating the cached resignation
      // list/detail, so ViewResignations kept showing stale data.
      await submitExitInterviewResponse(
        makeReq({ params: { id: "res-1" }, body: { answers: [] } }),
        makeRes(),
      );
      expect(mockInvalidate).toHaveBeenCalledWith("t:t1:resignations:*");
    });

    it("resolves the template with the same orderBy as the read/update paths", async () => {
      await submitExitInterviewResponse(
        makeReq({ params: { id: "res-1" }, body: { answers: [] } }),
        makeRes(),
      );
      expect(mockTemplateFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { updatedAt: "desc" } }),
      );
    });

    it("auto-materializes a default template when none exists, instead of writing a non-ObjectId placeholder", async () => {
      mockTemplateFindFirst.mockResolvedValue(null);
      mockTemplateCreate.mockResolvedValue({ id: "tpl-auto" });
      await submitExitInterviewResponse(
        makeReq({ params: { id: "res-1" }, body: { answers: [] } }),
        makeRes(),
      );
      expect(mockTemplateCreate).toHaveBeenCalled();
      expect(mockResponseCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ templateId: "tpl-auto" }),
        }),
      );
    });

    it("returns NOT_FOUND when the resignation doesn't belong to this tenant", async () => {
      mockResignationFindFirst.mockResolvedValue(null);
      const res = makeRes();
      await submitExitInterviewResponse(
        makeReq({ params: { id: "res-1" }, body: { answers: [] } }),
        res,
      );
      expect(mockInvalidate).not.toHaveBeenCalled();
      expect((res.json as jest.Mock).mock.calls[0][0].status).toBe(404);
    });

    it("returns FORBIDDEN when submitting on behalf of someone else's resignation without privilege", async () => {
      mockResignationFindFirst.mockResolvedValue({
        id: "res-1",
        userId: "someone-else",
      });
      const res = makeRes();
      await submitExitInterviewResponse(
        makeReq({
          user: { userId: "user-1", tenantId: "t1", tenantRole: "employee" },
          params: { id: "res-1" },
          body: { answers: [] },
        }),
        res,
      );
      expect(mockInvalidate).not.toHaveBeenCalled();
      expect((res.json as jest.Mock).mock.calls[0][0].status).toBe(403);
    });

    it("updates an existing response instead of creating a duplicate on resubmission", async () => {
      mockResponseFindFirst.mockResolvedValue({ id: "resp-existing" });
      const mockResponseUpdate = (prisma as any).exitInterviewResponse
        .update as jest.Mock;
      mockResponseUpdate.mockResolvedValue({ id: "resp-existing" });
      await submitExitInterviewResponse(
        makeReq({ params: { id: "res-1" }, body: { answers: [] } }),
        makeRes(),
      );
      expect(mockResponseUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "resp-existing" } }),
      );
      expect(mockResponseCreate).not.toHaveBeenCalled();
    });
  });
});
