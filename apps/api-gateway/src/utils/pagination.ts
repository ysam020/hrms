import { ParsedQs } from "qs";
import { PAGINATION_DEFAULT_LIMIT, PAGINATION_MAX_LIMIT } from "../constants";

export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: PAGINATION_DEFAULT_LIMIT,
  DEFAULT_LIMIT_LARGE: 50,
  MAX_LIMIT: PAGINATION_MAX_LIMIT,
  MAX_LIMIT_LARGE: 200,
  /** Used internally when all records must be fetched (e.g. job-title dropdown). */
  ALL_RECORDS_LIMIT: 1000,
} as const;

export interface PaginationResult {
  page: number;
  limit: number;
}

export function parsePagination(
  query: ParsedQs,
  defaultLimit: number = PAGINATION.DEFAULT_LIMIT,
  maxLimit: number = PAGINATION.MAX_LIMIT,
): PaginationResult {
  const page =
    parseInt(String(query.page || PAGINATION.DEFAULT_PAGE)) ||
    PAGINATION.DEFAULT_PAGE;
  const limit = Math.min(
    parseInt(String(query.limit || defaultLimit)) || defaultLimit,
    maxLimit,
  );
  return { page, limit };
}
