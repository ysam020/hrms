import { useEffect, useState } from "react";
import apiClient from "@web/core/http/axiosConfig";
import { API_ENDPOINTS } from "@web/shared/constants";

// The chat S3 bucket blocks all public/anonymous access, so msg.fileUrl
// (a permanent-looking S3 URL) 404s/403s if used directly — it has to be
// exchanged for a short-lived signed GET URL first. Cached module-wide (by
// messageId) so re-mounting a bubble during scroll doesn't re-fetch, and
// refreshed a little before the signed URL's actual server-side expiry.
const SIGNED_URL_TTL_MS = 15 * 60 * 1000;
const REFRESH_MARGIN_MS = 30 * 1000;
const cache = new Map<string, { url: string; expiresAt: number }>();

export function useFileViewUrl(
  messageId: string | undefined,
  hasFile: boolean,
) {
  const cached = messageId ? cache.get(messageId) : undefined;
  const [url, setUrl] = useState<string | null>(
    cached && cached.expiresAt > Date.now() ? cached.url : null,
  );

  useEffect(() => {
    if (!messageId || !hasFile) return;

    const existing = cache.get(messageId);
    if (existing && existing.expiresAt > Date.now()) {
      setUrl(existing.url);
      return;
    }

    let cancelled = false;
    apiClient
      .get(API_ENDPOINTS.GET_FILE_VIEW_URL(messageId))
      .then((res) => {
        if (cancelled) return;
        const signedUrl = res.data.data.url;
        cache.set(messageId, {
          url: signedUrl,
          expiresAt: Date.now() + SIGNED_URL_TTL_MS - REFRESH_MARGIN_MS,
        });
        setUrl(signedUrl);
      })
      .catch((err) => {
        if (!cancelled) console.error("Failed to load chat file:", err);
      });

    return () => {
      cancelled = true;
    };
  }, [messageId, hasFile]);

  return url;
}
