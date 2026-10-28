import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { AlertContext } from "@web/app/providers/AlertContext";
import useServerPagination from "@web/shared/hooks/useServerPagination";
import { apiClient, asList, errorMessage, isCanceled, totalOf } from "./api";

/**
 * Server-paginated list over Classic's useServerPagination, with a debounced
 * search and the response-shape normalisation every list page needs.
 *   url(page, limit, search) → endpoint;  listKeys → where the rows live.
 */
export function usePagedList(
  url: (page: number, limit: number, search: string) => string,
  { deps = [] as unknown[], listKeys = [] as string[], pageSize = 25 } = {},
) {
  const { setAlert } = useContext(AlertContext);
  const [query, setQuery] = useState("");
  const searchRef = useRef("");
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchPage = useCallback(
    async ({ page, limit }: { page: number; limit: number }) => {
      const endpoint = url(page, limit, searchRef.current);
      // An empty URL means "nothing to fetch yet" (e.g. no parent selected).
      if (!endpoint) return { data: [], totalCount: 0 };
      try {
        const res = await apiClient.get(endpoint);
        const body = res.data ?? {};
        const data = body.data ?? body;
        const rows = asList(data, ...listKeys);
        return {
          data: rows,
          totalCount: totalOf(data, totalOf(body, rows.length)),
        };
      } catch (err) {
        if (!isCanceled(err))
          setAlert({
            open: true,
            message: errorMessage(err),
            severity: "error",
          });
        throw err;
      }
    },
    deps, // eslint-disable-line react-hooks/exhaustive-deps
  );
  const list = useServerPagination(fetchPage, {
    initialPageSize: pageSize,
    deps,
  });

  useEffect(
    () => () => {
      if (debounce.current) clearTimeout(debounce.current);
    },
    [],
  );

  const search = (v: string) => {
    setQuery(v);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      searchRef.current = v.trim();
      list.resetPagination();
    }, 300);
  };

  return {
    ...list,
    query,
    search,
    pageProps: {
      page: list.currentPage,
      pageSize: list.pageSize,
      total: list.totalCount,
      onPage: (p: number) => list.goToPage(p - 1),
    },
  };
}

export const searchParam = (s: string) =>
  s ? `&search=${encodeURIComponent(s)}` : "";
