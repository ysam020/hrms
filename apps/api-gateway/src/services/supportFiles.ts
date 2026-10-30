/**
 * Support attachments on the existing S3 bucket (config/s3.ts).
 *
 * Flow: the client asks for an upload URL (validated name/type/size; the
 * signed PUT pins Content-Type and Content-Length, and the key is a random
 * UUID — no user-supplied path), PUTs the file, then calls /complete. Only
 * then does the server read the object's real size and first bytes and
 * decide what it is. A file whose bytes don't match an allowed type is
 * deleted and never becomes attachable. Downloads are 5-minute signed GETs
 * issued after the same ticket/visibility checks as the conversation itself;
 * the bucket has no public read.
 */
import path from "path";
import { randomUUID } from "crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { S3_BUCKET, s3Client } from "../config/s3";
import {
  SUPPORT_ATTACHMENT_MAX_BYTES,
  SUPPORT_ATTACHMENT_TYPES,
  SUPPORT_URL_TTL_SECONDS,
} from "../config/support";

const SNIFF_BYTES = 4096;

export function validateUploadRequest(input: {
  fileName: string;
  contentType: string;
  size: number;
}): { ok: true; ext: string } | { ok: false; reason: string } {
  const ext = path.extname(input.fileName).toLowerCase();
  const type = SUPPORT_ATTACHMENT_TYPES[input.contentType];
  if (!type || !type.extensions.includes(ext)) {
    return {
      ok: false,
      reason:
        "Only images (PNG, JPEG, GIF, WebP), PDF, TXT, LOG or CSV files can be attached.",
    };
  }
  if (!Number.isInteger(input.size) || input.size <= 0) {
    return { ok: false, reason: "The file is empty." };
  }
  if (input.size > SUPPORT_ATTACHMENT_MAX_BYTES) {
    return {
      ok: false,
      reason: `Files can be up to ${SUPPORT_ATTACHMENT_MAX_BYTES / (1024 * 1024)} MB.`,
    };
  }
  return { ok: true, ext };
}

const startsWith = (b: Buffer, sig: number[], offset = 0) =>
  b.length >= offset + sig.length && sig.every((v, i) => b[offset + i] === v);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

// Binary formats that must never pass as "text" even if they decode.
const BINARY_SIGNATURES = [
  ascii("MZ"), // Windows PE
  [0x7f, 0x45, 0x4c, 0x46], // ELF
  [0xcf, 0xfa, 0xed, 0xfe], // Mach-O
  [0x50, 0x4b, 0x03, 0x04], // zip / Office
];

function looksLikeText(b: Buffer): boolean {
  if (b.length === 0) return false;
  if (BINARY_SIGNATURES.some((sig) => startsWith(b, sig))) return false;
  if (b.includes(0)) return false;
  try {
    // A multi-byte character cut at the sample boundary is not an error.
    new TextDecoder("utf-8", { fatal: true }).decode(b, { stream: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * The file's real type from its leading bytes, if it is the type the client
 * declared and an allowed one; otherwise null.
 */
export function sniffContentType(
  head: Buffer,
  declared: string,
): string | null {
  const detected = startsWith(
    head,
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  )
    ? "image/png"
    : startsWith(head, [0xff, 0xd8, 0xff])
      ? "image/jpeg"
      : startsWith(head, ascii("GIF87a")) || startsWith(head, ascii("GIF89a"))
        ? "image/gif"
        : startsWith(head, ascii("RIFF")) && startsWith(head, ascii("WEBP"), 8)
          ? "image/webp"
          : startsWith(head, ascii("%PDF-"))
            ? "application/pdf"
            : null;
  if (detected) return detected === declared ? detected : null;
  if (
    (declared === "text/plain" || declared === "text/csv") &&
    looksLikeText(head)
  ) {
    return declared;
  }
  return null;
}

export function newStorageKey(scope: string, ext: string): string {
  return `support/${scope}/${randomUUID()}${ext}`;
}

export async function presignUpload(
  key: string,
  contentType: string,
  size: number,
): Promise<string> {
  return getSignedUrl(
    s3Client,
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      ContentType: contentType,
      ContentLength: size,
    }),
    { expiresIn: SUPPORT_URL_TTL_SECONDS },
  );
}

/** Real size + leading bytes of an uploaded object, or null if missing. */
export async function inspectUpload(
  key: string,
): Promise<{ size: number; head: Buffer } | null> {
  try {
    const meta = await s3Client.send(
      new HeadObjectCommand({ Bucket: S3_BUCKET, Key: key }),
    );
    const obj = await s3Client.send(
      new GetObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        Range: `bytes=0-${SNIFF_BYTES - 1}`,
      }),
    );
    const bytes = await obj.Body!.transformToByteArray();
    return { size: Number(meta.ContentLength ?? 0), head: Buffer.from(bytes) };
  } catch (err: any) {
    if (err?.name === "NotFound" || err?.$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw err;
  }
}

export async function deleteUpload(key: string): Promise<void> {
  await s3Client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }));
}

export async function presignDownload(a: {
  storageKey: string;
  fileName: string;
  contentType: string;
}): Promise<string> {
  const inline = SUPPORT_ATTACHMENT_TYPES[a.contentType]?.inline ?? false;
  const safeName = a.fileName.replace(/["\\\r\n]/g, "_");
  return getSignedUrl(
    s3Client,
    new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: a.storageKey,
      ResponseContentType: a.contentType,
      ResponseContentDisposition: `${inline ? "inline" : "attachment"}; filename="${safeName}"`,
    }),
    { expiresIn: SUPPORT_URL_TTL_SECONDS },
  );
}
