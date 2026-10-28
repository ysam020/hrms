import { Response } from "express";
import path from "path";
import { randomBytes } from "crypto";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  ListPartsCommand,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getRedisClient } from "@hrms/cache";
import { logger } from "@hrms/logger";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";
import { AuthRequest } from "../middleware/authenticate";
import { handleError } from "../utils/handleError";
import { s3Client, S3_BUCKET, s3FileUrl } from "../config/s3";
import {
  ALLOWED_EXTENSIONS,
  ALLOWED_MIMETYPES,
  DANGEROUS_EXTENSIONS,
  sanitizePart,
} from "./general";

// Resumable uploads on S3 multipart upload. Same validation and key layout
// as POST /upload/presigned-url (which stays for one-shot uploads); the
// difference is that the file goes up in parts the server can account for:
//
//   POST /upload/multipart/start      → { uploadId, partSize, partCount }
//   POST /upload/multipart/part-url   → presigned PUT for one part
//   GET  /upload/multipart/:id/parts  → parts S3 has confirmed (the truth a
//                                       client resumes from)
//   POST /upload/multipart/complete   → verifies every part, completes
//   POST /upload/multipart/abort      → discards the upload
//
// Sessions live in Redis under the authenticated tenant + user, so only the
// person who started an upload can continue, finish or abort it. They expire
// after SESSION_TTL; abandoned S3 parts are removed by the bucket's
// AbortIncompleteMultipartUpload lifecycle rule (see docs/offline-first.md).
// Nothing is reachable as a file until /complete has verified it.

export const RESUMABLE_MAX_BYTES = 15 * 1024 * 1024; // matches the web limit
export const PART_SIZE = 5 * 1024 * 1024; // S3's minimum part size
const SESSION_TTL_SECONDS = 24 * 60 * 60;
const PART_URL_TTL_SECONDS = 15 * 60;

interface Session {
  key: string;
  size: number;
  fileType: string;
  partSize: number;
  partCount: number;
  createdAt: number;
}

const sessionKey = (req: AuthRequest, uploadId: string) =>
  `upload:${req.user?.tenantId ?? "none"}:${req.user?.userId}:${uploadId}`;

async function loadSession(
  req: AuthRequest,
  uploadId: unknown,
): Promise<Session | null> {
  if (typeof uploadId !== "string" || !uploadId || uploadId.length > 1024)
    return null;
  const raw = await getRedisClient().get(sessionKey(req, uploadId));
  return raw ? (JSON.parse(raw) as Session) : null;
}

const notFound = (res: Response) =>
  apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
    message: "This upload has expired or doesn't exist. Start it again.",
  });

async function confirmedParts(key: string, uploadId: string) {
  const parts: { partNumber: number; size: number; etag: string }[] = [];
  let marker: string | undefined;
  do {
    const out = await s3Client.send(
      new ListPartsCommand({
        Bucket: S3_BUCKET,
        Key: key,
        UploadId: uploadId,
        PartNumberMarker: marker,
      }),
    );
    for (const p of out.Parts ?? [])
      if (p.PartNumber && p.ETag)
        parts.push({
          partNumber: p.PartNumber,
          size: p.Size ?? 0,
          etag: p.ETag,
        });
    marker = out.IsTruncated ? out.NextPartNumberMarker : undefined;
  } while (marker);
  return parts.sort((a, b) => a.partNumber - b.partNumber);
}

export async function startMultipartUpload(req: AuthRequest, res: Response) {
  try {
    const { fileName, fileType, size, folder, username, formikField } =
      req.body ?? {};
    const bytes = Number(size);
    if (!fileName || !fileType || !folder || !username || !bytes) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "fileName, fileType, size, folder and username are required",
      });
    }
    if (!Number.isInteger(bytes) || bytes <= 0 || bytes > RESUMABLE_MAX_BYTES) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "File size must be between 1 byte and 15MB.",
      });
    }
    const ext = path.extname(String(fileName)).toLowerCase();
    if (DANGEROUS_EXTENSIONS.includes(ext)) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: `Dangerous file type: ${ext}`,
      });
    }
    if (
      !ALLOWED_EXTENSIONS.includes(ext) ||
      !ALLOWED_MIMETYPES.includes(fileType)
    ) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "File type not allowed",
      });
    }
    const safeFolder = sanitizePart(folder);
    const safeUser = sanitizePart(username);
    const safeField = sanitizePart(formikField);
    const safeBase = sanitizePart(path.basename(String(fileName), ext));
    if (!safeFolder || !safeUser || !safeBase) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "Invalid file path components",
      });
    }
    const unique = `${safeBase}_${Date.now()}_${randomBytes(4).toString("hex")}${ext}`;
    const key = safeField
      ? `${safeFolder}/${safeField}/${safeUser}/${unique}`
      : `${safeFolder}/${safeUser}/${unique}`;

    const created = await s3Client.send(
      new CreateMultipartUploadCommand({
        Bucket: S3_BUCKET,
        Key: key,
        ContentType: fileType,
      }),
    );
    if (!created.UploadId) throw new Error("S3 returned no UploadId");

    const session: Session = {
      key,
      size: bytes,
      fileType,
      partSize: PART_SIZE,
      partCount: Math.ceil(bytes / PART_SIZE),
      createdAt: Date.now(),
    };
    await getRedisClient().set(
      sessionKey(req, created.UploadId),
      JSON.stringify(session),
      "EX",
      SESSION_TTL_SECONDS,
    );
    logger.info("resumable upload started", {
      parts: session.partCount,
      bytes,
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Upload started",
      data: {
        uploadId: created.UploadId,
        partSize: session.partSize,
        partCount: session.partCount,
        expiresAt: session.createdAt + SESSION_TTL_SECONDS * 1000,
      },
    });
  } catch (error: unknown) {
    logger.error("multipart start error:", { error });
    return handleError(res, error);
  }
}

export async function getPartUploadUrl(req: AuthRequest, res: Response) {
  try {
    const { uploadId, partNumber } = req.body ?? {};
    const session = await loadSession(req, uploadId);
    if (!session) return notFound(res);
    const n = Number(partNumber);
    if (!Number.isInteger(n) || n < 1 || n > session.partCount) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "Invalid part number",
      });
    }
    const url = await getSignedUrl(
      s3Client,
      new UploadPartCommand({
        Bucket: S3_BUCKET,
        Key: session.key,
        UploadId: uploadId,
        PartNumber: n,
      }),
      { expiresIn: PART_URL_TTL_SECONDS },
    );
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Part URL generated",
      data: { url, partNumber: n },
    });
  } catch (error: unknown) {
    logger.error("multipart part-url error:", { error });
    return handleError(res, error);
  }
}

export async function listUploadedParts(req: AuthRequest, res: Response) {
  try {
    const uploadId = String(req.params.uploadId);
    const session = await loadSession(req, uploadId);
    if (!session) return notFound(res);
    const parts = await confirmedParts(session.key, uploadId);
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Uploaded parts",
      data: {
        parts: parts.map(({ partNumber, size }) => ({ partNumber, size })),
        partCount: session.partCount,
        partSize: session.partSize,
        size: session.size,
      },
    });
  } catch (error: unknown) {
    logger.error("multipart list-parts error:", { error });
    return handleError(res, error);
  }
}

export async function completeMultipartUpload(req: AuthRequest, res: Response) {
  try {
    const { uploadId } = req.body ?? {};
    const session = await loadSession(req, uploadId);
    if (!session) return notFound(res);
    const parts = await confirmedParts(session.key, uploadId);
    // Every part present exactly once, in order, adding up to the declared
    // size: anything else is an incomplete or tampered upload.
    const contiguous =
      parts.length === session.partCount &&
      parts.every((p, i) => p.partNumber === i + 1);
    const total = parts.reduce((sum, p) => sum + p.size, 0);
    if (!contiguous || total !== session.size) {
      return apiResponse(res, RESPONSE_STATUS.CONFLICT, {
        message: "Upload is incomplete. Resume it to send the missing parts.",
        data: {
          parts: parts.map(({ partNumber, size }) => ({ partNumber, size })),
        },
      });
    }
    await s3Client.send(
      new CompleteMultipartUploadCommand({
        Bucket: S3_BUCKET,
        Key: session.key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: parts.map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
        },
      }),
    );
    await getRedisClient().del(sessionKey(req, uploadId));
    logger.info("resumable upload completed", { bytes: session.size });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Upload complete",
      data: { key: session.key, fileUrl: s3FileUrl(session.key) },
    });
  } catch (error: unknown) {
    logger.error("multipart complete error:", { error });
    return handleError(res, error);
  }
}

export async function abortMultipartUpload(req: AuthRequest, res: Response) {
  try {
    const { uploadId } = req.body ?? {};
    const session = await loadSession(req, uploadId);
    if (!session) return notFound(res);
    await s3Client.send(
      new AbortMultipartUploadCommand({
        Bucket: S3_BUCKET,
        Key: session.key,
        UploadId: uploadId,
      }),
    );
    await getRedisClient().del(sessionKey(req, uploadId));
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Upload discarded",
    });
  } catch (error: unknown) {
    logger.error("multipart abort error:", { error });
    return handleError(res, error);
  }
}
