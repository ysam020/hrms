import { Request, Response } from "express";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";
import { handleError } from "../utils/handleError";
import { isOpenToPublic } from "./recruitment";
import {
  authorizeDraft,
  createDraft,
  discardDraft,
  getDraft,
  saveDraft,
  sendRecoveryCode,
  submitDraft,
  verifyRecoveryCode,
  type Result,
} from "../services/careerApplications";

// Public application drafts (see services/careerApplications.ts). All routes
// sit behind resolvePublicTenant, so every query runs against the careers
// page's own tenant database. The draft token travels in a header, never the
// URL, so it stays out of access logs and browser history.

const send = (res: Response, r: Result) =>
  apiResponse(res, r.httpStatus, r.body);

const notFound = (res: Response) =>
  apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
    message: "This saved application wasn't found on this device.",
    code: "NO_ACCESS",
  });

const token = (req: Request) => req.get("x-draft-token") || undefined;

const withDraft =
  (fn: (draft: any, req: Request) => Promise<Result>) =>
  async (req: Request, res: Response) => {
    try {
      const draft = await authorizeDraft(
        String(req.params.draftId),
        token(req),
      );
      if (!draft) return notFound(res);
      return send(res, await fn(draft, req));
    } catch (error: unknown) {
      return handleError(res, error);
    }
  };

export async function createApplicationDraft(req: Request, res: Response) {
  try {
    return send(
      res,
      await createDraft(
        String(req.params.jobId),
        req.body?.data,
        isOpenToPublic,
      ),
    );
  } catch (error: unknown) {
    return handleError(res, error);
  }
}

export const getApplicationDraft = withDraft((draft) =>
  getDraft(draft, isOpenToPublic),
);

export const saveApplicationDraft = withDraft((draft, req) =>
  saveDraft(draft, req.body?.revision, req.body?.data, isOpenToPublic),
);

export const discardApplicationDraft = withDraft((draft) =>
  discardDraft(draft),
);

export const submitApplicationDraft = withDraft((draft) =>
  submitDraft(draft, isOpenToPublic),
);

export async function requestDraftRecovery(req: Request, res: Response) {
  try {
    return send(
      res,
      await sendRecoveryCode(
        String(req.params.jobId),
        req.body?.email,
        isOpenToPublic,
      ),
    );
  } catch (error: unknown) {
    return handleError(res, error);
  }
}

export async function verifyDraftRecovery(req: Request, res: Response) {
  try {
    return send(
      res,
      await verifyRecoveryCode(
        String(req.params.jobId),
        req.body?.email,
        req.body?.code,
        isOpenToPublic,
      ),
    );
  } catch (error: unknown) {
    return handleError(res, error);
  }
}
