import { useCallback, useMemo } from "react";
import apiClient from "@web/core/http/axiosConfig";
import useFetchData from "@web/shared/hooks/useFetchData";
import { API_ENDPOINTS } from "@web/shared/constants";
import { assetCategories as defaultAssetCategories } from "@web/assets/data/assetCategories";

/**
 * Asset category options for the "Add New Asset" dialog, backed by the
 * tenant-scoped AssetCategory table (mirrors useJobTitleOptions/Designation).
 * Starts every tenant off with the same built-in suggestions, then layers
 * in whatever that tenant has saved on top.
 */
export default function useAssetCategoryOptions() {
  const { data, refetch } = useFetchData<any[]>(
    API_ENDPOINTS.LIST_ASSET_CATEGORIES,
    "get",
    [],
    null,
    null,
  );

  const savedCategories = useMemo(
    () =>
      Array.isArray(data) ? data.map((c: any) => c.name).filter(Boolean) : [],
    [data],
  );

  const options = useMemo(() => {
    const merged = [...defaultAssetCategories, ...savedCategories];
    const seen = new Set<string>();
    const deduped: string[] = [];
    for (const category of merged) {
      const trimmed = category?.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(trimmed);
    }
    return deduped;
  }, [savedCategories]);

  // Best-effort: if this fails (race with another save, or the caller isn't
  // HR), the asset still gets created with the typed category — it just
  // won't be remembered for next time.
  const ensureAssetCategorySaved = useCallback(
    async (category: string) => {
      const trimmed = category?.trim();
      if (!trimmed) return;
      const alreadyKnown = options.some(
        (o) => o.toLowerCase() === trimmed.toLowerCase(),
      );
      if (alreadyKnown) return;
      try {
        await apiClient.post(API_ENDPOINTS.CREATE_ASSET_CATEGORY, {
          name: trimmed,
        });
        refetch();
      } catch {
        // Swallowed intentionally — see comment above.
      }
    },
    [options, refetch],
  );

  return { options, ensureAssetCategorySaved };
}
