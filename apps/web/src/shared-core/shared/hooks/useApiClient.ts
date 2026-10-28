import { useEffect, useRef, useMemo } from "react";
import apiClient from "@web/core/http/axiosConfig";
import type { AxiosRequestConfig, AxiosResponse } from "axios";

/**
 * Returns a component-scoped API client. All requests made through it share
 * a single AbortController that is aborted when the component unmounts,
 * preventing stale state updates and dangling requests.
 *
 * Use this wherever apiClient is called inside useEffect or async callbacks
 * triggered by effects. For fire-and-forget mutations (form submits, button
 * actions), use the bare apiClient import — those are globally tracked by
 * cancelAllPendingRequests() in axiosConfig.
 */
export function useApiClient() {
  const controllerRef = useRef(new AbortController());

  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    return () => controller.abort("component-unmounted");
  }, []);

  // Stable object — functions close over the ref, not over its .current value,
  // so they always pick up the live controller even after re-mounts.
  return useMemo(
    () => ({
      get: <T = any>(
        url: string,
        config?: AxiosRequestConfig,
      ): Promise<AxiosResponse<T>> =>
        apiClient.get<T>(url, {
          signal: controllerRef.current.signal,
          ...config,
        }),

      post: <T = any>(
        url: string,
        data?: any,
        config?: AxiosRequestConfig,
      ): Promise<AxiosResponse<T>> =>
        apiClient.post<T>(url, data, {
          signal: controllerRef.current.signal,
          ...config,
        }),

      put: <T = any>(
        url: string,
        data?: any,
        config?: AxiosRequestConfig,
      ): Promise<AxiosResponse<T>> =>
        apiClient.put<T>(url, data, {
          signal: controllerRef.current.signal,
          ...config,
        }),

      patch: <T = any>(
        url: string,
        data?: any,
        config?: AxiosRequestConfig,
      ): Promise<AxiosResponse<T>> =>
        apiClient.patch<T>(url, data, {
          signal: controllerRef.current.signal,
          ...config,
        }),

      delete: <T = any>(
        url: string,
        config?: AxiosRequestConfig,
      ): Promise<AxiosResponse<T>> =>
        apiClient.delete<T>(url, {
          signal: controllerRef.current.signal,
          ...config,
        }),
    }),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );
}
