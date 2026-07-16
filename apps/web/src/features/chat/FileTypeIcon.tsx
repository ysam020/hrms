import { Suspense } from "react";
import {
  InsertDriveFileIcon,
  PictureAsPdfIcon,
  TableChartIcon,
  ArticleIcon,
  VideoFileIcon,
} from "./chatIcons";

export function FileTypeIcon({
  mime,
  size = "small" as "small" | "inherit" | "large" | "medium",
}) {
  if (!mime)
    return (
      <Suspense fallback={null}>
        <InsertDriveFileIcon fontSize={size} />
      </Suspense>
    );
  if (mime === "application/pdf")
    return (
      <Suspense fallback={null}>
        <PictureAsPdfIcon fontSize={size} sx={{ color: "#e53935" }} />
      </Suspense>
    );
  if (mime.includes("sheet") || mime.includes("excel") || mime === "text/csv")
    return (
      <Suspense fallback={null}>
        <TableChartIcon fontSize={size} sx={{ color: "#2e7d32" }} />
      </Suspense>
    );
  if (mime.includes("word") || mime.includes("document"))
    return (
      <Suspense fallback={null}>
        <ArticleIcon fontSize={size} sx={{ color: "#1565c0" }} />
      </Suspense>
    );
  if (mime.startsWith("video/"))
    return (
      <Suspense fallback={null}>
        <VideoFileIcon fontSize={size} sx={{ color: "#6a1b9a" }} />
      </Suspense>
    );
  return (
    <Suspense fallback={null}>
      <InsertDriveFileIcon fontSize={size} />
    </Suspense>
  );
}
