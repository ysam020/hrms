import { useEffect, useState } from "react";
import Typography from "@mui/material/Typography";
import apiClient from "@web/core/http/axiosConfig";
import { API_ENDPOINTS } from "@web/shared/constants";

const ogCache = new Map();

export function LinkPreview({ url }) {
  const cleanUrl = url.replace(/[)>\].,'";]+$/, ""); // strip trailing punctuation
  const [og, setOg] = useState(
    ogCache.has(cleanUrl) ? ogCache.get(cleanUrl) : undefined,
  );

  useEffect(() => {
    if (ogCache.has(cleanUrl)) return;
    let cancelled = false;
    apiClient
      .get(API_ENDPOINTS.OG_PREVIEW(cleanUrl))
      .then((res) => {
        if (cancelled) return;
        const data = res.data.data;
        const result = data.title || data.image ? data : null;
        ogCache.set(cleanUrl, result);
        setOg(result);
      })
      .catch(() => {
        if (!cancelled) {
          ogCache.set(cleanUrl, null);
          setOg(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [cleanUrl]);

  if (og === undefined) return null; // still loading — don't show spinner inside bubble
  if (!og) return null;

  return (
    <a
      href={cleanUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="chat-link-preview"
    >
      {og.image && (
        <img
          src={og.image}
          alt=""
          className="chat-link-preview-img"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      )}
      <div className="chat-link-preview-body">
        {og.siteName && (
          <Typography variant="caption" className="chat-link-preview-site">
            {og.siteName}
          </Typography>
        )}
        {og.title && (
          <Typography variant="caption" className="chat-link-preview-title">
            {og.title}
          </Typography>
        )}
        {og.description && (
          <Typography variant="caption" className="chat-link-preview-desc">
            {og.description}
          </Typography>
        )}
      </div>
    </a>
  );
}
