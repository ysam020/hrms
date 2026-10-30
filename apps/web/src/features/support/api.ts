import axios from "axios";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import { apiClient, unwrap } from "@next/lib/api";
import { ATTACHMENT_TYPES, LIMITS } from "./config";

// The tenant app and the Praesto console use the same flows on different
// endpoint families.
export type Side = "tenant" | "platform";

const UPLOAD = {
  tenant: {
    start: API_ENDPOINTS.SUPPORT_UPLOAD,
    complete: API_ENDPOINTS.SUPPORT_UPLOAD_COMPLETE,
    url: API_ENDPOINTS.SUPPORT_ATTACHMENT_URL,
  },
  platform: {
    start: API_ENDPOINTS.PLATFORM_SUPPORT_UPLOAD,
    complete: API_ENDPOINTS.PLATFORM_SUPPORT_UPLOAD_COMPLETE,
    url: API_ENDPOINTS.PLATFORM_SUPPORT_ATTACHMENT_URL,
  },
};

export interface UploadedFile {
  id: string;
  fileName: string;
  contentType: string;
  size: number;
}

const extOf = (name: string) => {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
};

/** A reason this file can't be attached, before any upload starts. */
export function checkFile(file: File): string | null {
  if (!ATTACHMENT_TYPES[extOf(file.name)])
    return `${file.name}: only images, PDF, TXT, LOG or CSV files can be attached.`;
  if (file.size === 0) return `${file.name} is empty.`;
  if (file.size > LIMITS.attachmentBytes)
    return `${file.name} is larger than ${LIMITS.attachmentBytes / (1024 * 1024)} MB.`;
  return null;
}

/**
 * Upload one file: get a signed URL, PUT straight to storage, then have the
 * server verify the bytes. Resolves only once the file is attachable.
 */
export async function uploadFile(
  side: Side,
  file: File,
): Promise<UploadedFile> {
  const contentType = ATTACHMENT_TYPES[extOf(file.name)];
  const { attachmentId, uploadUrl } = unwrap<{
    attachmentId: string;
    uploadUrl: string;
  }>(
    await apiClient.post(UPLOAD[side].start, {
      fileName: file.name,
      contentType,
      size: file.size,
    }),
  );
  // Plain axios: the signed URL must not carry the app's auth headers.
  await axios.put(uploadUrl, file, {
    headers: { "Content-Type": contentType },
  });
  const verified = unwrap<{ id: string; contentType: string; size: number }>(
    await apiClient.post(UPLOAD[side].complete(attachmentId)),
  );
  return {
    id: verified.id,
    fileName: file.name,
    contentType: verified.contentType,
    size: verified.size,
  };
}

/** A short-lived signed link, fetched only when someone opens the file. */
export async function attachmentUrl(side: Side, id: string): Promise<string> {
  return unwrap<{ url: string }>(await apiClient.get(UPLOAD[side].url(id))).url;
}

export const fileSize = (n: number) =>
  n < 1024
    ? `${n} B`
    : n < 1024 * 1024
      ? `${Math.round(n / 1024)} KB`
      : `${(n / (1024 * 1024)).toFixed(1)} MB`;
