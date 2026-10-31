import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { AlertContext } from "@web/app/providers/AlertContext";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import useServerPagination from "@web/shared/hooks/useServerPagination";
import { useSharedElement, useTransitionNavigate, vtName } from "@next/motion";
import {
  Avatar,
  DataTable,
  Page,
  Pagination,
  PrimaryCell,
  SearchField,
  Status,
  type Column,
} from "@next/ui";
import { apiClient, errorMessage, isCanceled } from "@next/lib/api";
import { fmtDate, personName, readableCase } from "@next/lib/format";
import s from "./employees.module.css";

// Employees: Classic's data source (GET /view-all-kycs, server-paginated via
// Classic's useServerPagination). A row opens the full record directly, with
// a shared-element transition on the person's identity.

const detailPath = (row: any) =>
  `/employee-management/${encodeURIComponent(row.username)}`;

function NameCell({ row }: { row: any }) {
  // Only the row being opened carries the transition name.
  const style = useSharedElement(
    vtName("employee", row.username),
    detailPath(row),
  );
  return (
    <PrimaryCell
      style={style}
      leading={
        <Avatar name={personName(row)} src={row.employee_photo} size={32} />
      }
      title={readableCase(personName(row))}
      subtitle={row.official_email || row.email || row.username}
    />
  );
}

export default function Employees() {
  const { setAlert } = useContext(AlertContext);
  const [query, setQuery] = useState("");
  const searchRef = useRef("");
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate = useTransitionNavigate();

  const fetchPage = useCallback(
    async ({ page, limit }: { page: number; limit: number }) => {
      const base = API_ENDPOINTS.VIEW_ALL_KYCS(page, limit);
      const url = searchRef.current
        ? `${base}&search=${encodeURIComponent(searchRef.current)}`
        : base;
      try {
        const res = await apiClient.get(url);
        return {
          data: res.data?.data?.kycs ?? [],
          totalCount: res.data?.data?.pagination?.totalCount ?? 0,
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
    [setAlert],
  );
  const list = useServerPagination(fetchPage, { initialPageSize: 25 });

  useEffect(
    () => () => {
      if (debounce.current) clearTimeout(debounce.current);
    },
    [],
  );

  const onSearch = (v: string) => {
    setQuery(v);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      searchRef.current = v.trim();
      list.resetPagination();
    }, 300);
  };

  const columns: Column<any>[] = [
    {
      key: "name",
      header: "Name",
      priority: "primary",
      render: (r) => <NameCell row={r} />,
    },
    {
      key: "designation",
      header: "Designation",
      priority: "secondary",
      render: (r) => readableCase(r.designation) || "—",
    },
    {
      key: "department",
      header: "Department",
      priority: "secondary",
      stackLabel: "Dept",
      render: (r) => readableCase(r.department) || "—",
    },
    {
      key: "joined",
      header: "Joined",
      priority: "hidden",
      render: (r) => (
        <span className="px-num">
          {fmtDate(r.joiningDate ?? r.joining_date)}
        </span>
      ),
    },
    {
      key: "kyc",
      header: "KYC",
      priority: "trailing",
      render: (r) => <Status value={r.kyc_approval || r.kycStatus} />,
    },
  ];

  return (
    <Page
      title="Employees"
      subtitle={list.totalCount ? `${list.totalCount} people` : undefined}
    >
      <div className={s.filters}>
        <SearchField
          label="Search by name, email, or username"
          data-tour="employees-search"
          value={query}
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>
      <DataTable
        label="Employees"
        tour="employees-table"
        columns={columns}
        rows={list.data}
        rowId={(r) => r.username}
        loading={list.loading}
        error={list.error ? errorMessage(list.error) : null}
        onRetry={list.refresh}
        onRowClick={(r) => navigate(detailPath(r))}
        stickyOffset={52}
        empty={{
          icon: "people",
          title: query ? `No one matches “${query}”` : "No employees yet",
          body: query ? "Try a different name or email." : undefined,
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
    </Page>
  );
}
