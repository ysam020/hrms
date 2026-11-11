import { useEffect, useState } from "react";
import { apiClient } from "@next/lib/api";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";

// Uploads (employee photos, KYC documents) live in a private bucket, so a
// stored URL can't be loaded directly: it 403s, and the CSP blocks hosts it
// doesn't list. They are opened through a short-lived signed URL from the
// API, which also checks that the viewer may see the file (owner, or HR in
// the same organisation). Only the uploads buckets qualify; public buckets
// such as the product-demo one are loaded as they are.
const UPLOADS_BUCKET_URL =
  /^https:\/\/praesto(?:-\d{12})?\.s3\.[a-z0-9-]+\.amazonaws\.com\//i;

export function isStoredFileUrl(url: string): boolean {
  return UPLOADS_BUCKET_URL.test(url) && !/[?&]X-Amz-Signature=/i.test(url);
}

// Signed URLs last 5 minutes; reuse one for a little less than that.
const REUSE_MS = 4 * 60 * 1000;
const cache = new Map<string, { at: number; url: Promise<string | null> }>();

/** A signed URL for a stored file, or null when it can't be viewed. */
export function signedFileUrl(
  url: string,
  now: number = Date.now(),
): Promise<string | null> {
  const hit = cache.get(url);
  if (hit && now - hit.at < REUSE_MS) return hit.url;
  const signed = apiClient
    .post(API_ENDPOINTS.UPLOAD_VIEW_URL, { fileUrl: url })
    .then((r: any) => (r?.data?.data?.url as string | undefined) ?? null)
    .catch(() => null);
  cache.set(url, { at: now, url: signed });
  return signed;
}

export function clearSignedFileUrlCache(): void {
  cache.clear();
}

/**
 * The URL to put in an <img>: unchanged for ordinary URLs; for a stored file,
 * undefined while its signed URL is being fetched, then the signed URL, or
 * null when it can't be viewed (no access, or the file is gone).
 */
export function useStoredImage(src?: string | null): string | null | undefined {
  const stored = !!src && isStoredFileUrl(src);
  const [signed, setSigned] = useState<{
    for: string;
    url: string | null;
  } | null>(null);
  useEffect(() => {
    if (!stored || !src) return;
    let live = true;
    void signedFileUrl(src).then((url) => {
      if (live) setSigned({ for: src, url });
    });
    return () => {
      live = false;
    };
  }, [src, stored]);
  if (!src) return null;
  if (!stored) return src;
  return signed?.for === src ? signed.url : undefined;
}
