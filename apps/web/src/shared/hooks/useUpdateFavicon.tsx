import { useEffect } from "react";
import {
  updateFaviconWithDot,
  updateDocumentTitle,
} from "@web/shared/utils/faviconUtils";

function useUpdateFavicon(data) {
  useEffect(() => {
    updateDocumentTitle(data.length);
    updateFaviconWithDot(data.length > 0);
  }, [data]);

  const updateFavicon = (showDot) => {
    updateFaviconWithDot(showDot);
  };

  return { updateFavicon };
}

export default useUpdateFavicon;
