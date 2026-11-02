import dayjs from "dayjs";
import { useCallback, useContext, useRef, useState } from "react";
import { AlertContext } from "@web/app/providers/AlertContext";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import useServerPagination from "@web/shared/hooks/useServerPagination";
import {
  Avatar,
  DataTable,
  Pagination,
  PrimaryCell,
  SearchField,
  TextInput,
  type Column,
} from "@next/ui";
import { apiClient, errorMessage, isCanceled } from "@next/lib/api";
import { useDebouncedCallback } from "@next/lib/hooks";
import { personName } from "@next/lib/format";

// ── Team attendance ─────────────────────────────────────────────────────────

export function TeamAttendance() {
  const { setAlert } = useContext(AlertContext);
  const [month, setMonth] = useState(() => dayjs().format("YYYY-MM"));
  const [query, setQuery] = useState("");
  const searchRef = useRef("");
  const fetchPage = useCallback(
    async ({ page, limit }: { page: number; limit: number }) => {
      const [y, m] = month.split("-").map(Number);
      const base = API_ENDPOINTS.GET_ALL_ATTENDANCES(y, m, page, limit);
      const url = searchRef.current
        ? `${base}&search=${encodeURIComponent(searchRef.current)}`
        : base;
      const res = await apiClient.get(url).catch((err: unknown) => {
        if (!isCanceled(err))
          setAlert({
            open: true,
            message: errorMessage(err),
            severity: "error",
          });
        throw err;
      });
      return {
        data: res.data?.data?.records ?? [],
        totalCount: res.data?.data?.pagination?.totalCount ?? 0,
      };
    },
    [month, setAlert],
  );
  const list = useServerPagination(fetchPage, {
    initialPageSize: 25,
    deps: [month],
  });
  const applySearch = useDebouncedCallback((v: string) => {
    searchRef.current = v.trim();
    list.resetPagination();
  }, 300);
  const onSearch = (v: string) => {
    setQuery(v);
    applySearch(v);
  };
  const num = (k: string) => (r: any) => (
    <span className="px-num">{r[k] ?? 0}</span>
  );
  const columns: Column<any>[] = [
    {
      key: "who",
      header: "Employee",
      priority: "primary",
      render: (r) => (
        <PrimaryCell
          leading={<Avatar name={personName(r)} size={28} />}
          title={personName(r)}
          subtitle={r.username}
        />
      ),
    },
    {
      key: "presents",
      header: "Present",
      align: "right",
      priority: "trailing",
      render: num("presents"),
    },
    {
      key: "halfDays",
      header: "Half Days",
      align: "right",
      priority: "secondary",
      stackLabel: "Half",
      render: num("halfDays"),
    },
    {
      key: "paidLeaves",
      header: "Paid Leave",
      align: "right",
      priority: "secondary",
      stackLabel: "PL",
      render: num("paidLeaves"),
    },
    {
      key: "unpaidLeaves",
      header: "Unpaid",
      align: "right",
      priority: "secondary",
      stackLabel: "LWP",
      render: num("unpaidLeaves"),
    },
    {
      key: "correctionsUsed",
      header: "Corrections",
      align: "right",
      priority: "hidden",
      render: num("correctionsUsed"),
    },
  ];
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div
        className="px-row"
        style={{ gap: 8 }}
        data-tour="attendance-team-filters"
      >
        <TextInput
          type="month"
          value={month}
          max={dayjs().format("YYYY-MM")}
          onChange={(e) => setMonth(e.target.value)}
          aria-label="Month"
          style={{ width: 180 }}
        />
        <SearchField
          label="Search people"
          value={query}
          onChange={(e) => onSearch(e.target.value)}
          toolbarWidth={240}
        />
      </div>
      <DataTable
        label="Team attendance"
        tour="attendance-team-table"
        columns={columns}
        rows={list.data}
        rowId={(r) => String(r.userId || r.username)}
        loading={list.loading}
        stickyOffset={52}
        empty={{
          icon: "people",
          title: "No attendance records for this month",
        }}
        footer={
          <Pagination
            page={list.currentPage}
            pageSize={list.pageSize}
            total={list.totalCount}
            onPage={(p) => list.goToPage(p - 1)}
          />
        }
      />
    </div>
  );
}
