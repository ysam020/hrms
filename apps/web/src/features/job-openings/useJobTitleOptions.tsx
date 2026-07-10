import { useCallback, useMemo } from "react";
import apiClient from "@web/core/http/axiosConfig";
import useFetchData from "@web/shared/hooks/useFetchData";
import { API_ENDPOINTS } from "@web/shared/constants";
import { jobTitles as defaultJobTitles } from "@web/assets/data/jobTitles";

/**
 * Job title options for the "New/Edit Job Opening" dropdown, backed by the
 * tenant-scoped Designation table (prismaWithTenant already isolates rows
 * by tenantId, so tenant A's saved titles never show up for tenant B).
 * Starts every tenant off with the same built-in suggestions, then layers
 * in whatever that tenant has saved on top.
 */
export default function useJobTitleOptions() {
  const { data, refetch } = useFetchData<any[]>(
    API_ENDPOINTS.LIST_DESIGNATIONS,
    "get",
    [],
    null,
    null,
  );

  const savedTitles = useMemo(
    () =>
      Array.isArray(data) ? data.map((d: any) => d.name).filter(Boolean) : [],
    [data],
  );

  const options = useMemo(() => {
    const merged = [...defaultJobTitles, ...savedTitles];
    const seen = new Set<string>();
    const deduped: string[] = [];
    for (const title of merged) {
      const trimmed = title?.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(trimmed);
    }
    return deduped;
  }, [savedTitles]);

  // Best-effort: if this fails (race with another save, or the caller
  // lacks org-structure permissions), the job opening still gets created
  // with the typed title — it just won't be remembered for next time.
  const ensureJobTitleSaved = useCallback(
    async (title: string) => {
      const trimmed = title?.trim();
      if (!trimmed) return;
      const alreadyKnown = options.some(
        (o) => o.toLowerCase() === trimmed.toLowerCase(),
      );
      if (alreadyKnown) return;
      try {
        await apiClient.post(API_ENDPOINTS.CREATE_DESIGNATION, {
          name: trimmed,
        });
        refetch();
      } catch {
        // Swallowed intentionally — see comment above.
      }
    },
    [options, refetch],
  );

  return { options, ensureJobTitleSaved };
}
