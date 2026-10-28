import { useState, useCallback, useEffect } from "react";
import {
  getPaginationCache,
  setPaginationCache,
  invalidatePaginationCache,
} from "@web/core/db";

function useServerPagination(
  fetchFunction: (...args: any[]) => any,
  options: Record<string, any> = {},
) {
  const {
    initialPageSize = 10,
    initialPage = 0,
    deps = [], // Dependencies that should trigger a refetch
    onError = console.error,
    /**
     * cacheKey – when provided, pages are cached in IndexedDB with a 2-min TTL.
     * The key should uniquely identify the data source (e.g. "employees" or
     * "job-applications"). Provide null/undefined to disable caching (default).
     */
    cacheKey = null,
  } = options;

  // State management
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [pagination, setPagination] = useState({
    pageIndex: initialPage,
    pageSize: initialPageSize,
  });
  const [error, setError] = useState(null);

  // Calculate derived values
  const totalPages = Math.ceil(totalCount / pagination.pageSize);
  const hasNextPage = pagination.pageIndex < totalPages - 1;
  const hasPrevPage = pagination.pageIndex > 0;

  const buildCacheKey = useCallback(
    (paginationState) =>
      cacheKey
        ? `${cacheKey}:p${paginationState.pageIndex}:s${paginationState.pageSize}`
        : null,
    [cacheKey],
  );

  // Fetch data function
  const fetchData = useCallback(
    async (paginationState = pagination) => {
      setLoading(true);
      setError(null);

      const pageKey = buildCacheKey(paginationState);

      try {
        // Show cached page instantly (stale-while-revalidate)
        if (pageKey) {
          const cached = await getPaginationCache(pageKey);
          if (cached) {
            setData(cached.data);
            setTotalCount(cached.totalCount);
            setLoading(false); // keep refreshing in background
          }
        }

        const result = await fetchFunction({
          page: paginationState.pageIndex + 1,
          limit: paginationState.pageSize,
          skip: paginationState.pageIndex * paginationState.pageSize,
        });

        if (result?.data) {
          setData(result.data);
          const total = result.totalCount || result.total_count || 0;
          setTotalCount(total);
          if (pageKey) {
            setPaginationCache(pageKey, result.data, total).catch(
              console.error,
            );
          }
        } else if (Array.isArray(result)) {
          setData(result);
          setTotalCount(result.length);
        } else {
          setData([]);
          setTotalCount(0);
        }
      } catch (err) {
        if (err?.code === "ERR_CANCELED" || err?.name === "CanceledError") {
          setLoading(false);
          return;
        }
        setError(err);
        setData([]);
        setTotalCount(0);
        onError(err);
      } finally {
        setLoading(false);
      }
    },
    [fetchFunction, pagination, onError, buildCacheKey],
  );

  // Invalidate cache for this resource (call after mutations)
  const invalidateCache = useCallback(() => {
    if (cacheKey) invalidatePaginationCache(cacheKey).catch(console.error);
  }, [cacheKey]);

  // Handle pagination changes
  const handlePaginationChange = useCallback(
    (updater) => {
      const newPagination =
        typeof updater === "function" ? updater(pagination) : updater;
      setPagination(newPagination);

      // Fetch data with new pagination
      fetchData(newPagination);
    },
    [pagination, fetchData],
  );

  // Handle page size changes
  const handlePageSizeChange = useCallback(
    (newPageSize) => {
      const newPagination = { pageIndex: 0, pageSize: newPageSize };
      setPagination(newPagination);
      fetchData(newPagination);
    },
    [fetchData],
  );

  // Go to specific page
  const goToPage = useCallback(
    (pageIndex) => {
      if (pageIndex >= 0 && pageIndex < totalPages) {
        const newPagination = { ...pagination, pageIndex };
        setPagination(newPagination);
        fetchData(newPagination);
      }
    },
    [pagination, totalPages, fetchData],
  );

  // Go to next page
  const nextPage = useCallback(() => {
    if (hasNextPage) {
      goToPage(pagination.pageIndex + 1);
    }
  }, [hasNextPage, pagination.pageIndex, goToPage]);

  // Go to previous page
  const prevPage = useCallback(() => {
    if (hasPrevPage) {
      goToPage(pagination.pageIndex - 1);
    }
  }, [hasPrevPage, pagination.pageIndex, goToPage]);

  // Refresh current page
  const refresh = useCallback(() => {
    fetchData(pagination);
  }, [fetchData, pagination]);

  // Reset to first page
  const resetPagination = useCallback(() => {
    const newPagination = { pageIndex: 0, pageSize: pagination.pageSize };
    setPagination(newPagination);
    fetchData(newPagination);
  }, [pagination.pageSize, fetchData]);

  // Initial fetch and dependency-based refetching
  useEffect(() => {
    fetchData();
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    // Data
    data,
    loading,
    error,
    totalCount,

    // Pagination state
    pagination,
    totalPages,
    hasNextPage,
    hasPrevPage,
    currentPage: pagination.pageIndex + 1,
    pageSize: pagination.pageSize,

    // Actions
    handlePaginationChange,
    handlePageSizeChange,
    goToPage,
    nextPage,
    prevPage,
    refresh,
    resetPagination,

    // Manual controls
    setPagination,
    setData,
    setTotalCount,
    invalidateCache,
  };
}

export default useServerPagination;
