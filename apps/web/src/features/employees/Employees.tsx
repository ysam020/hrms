import { useCallback, useContext, useRef, useState } from "react";
import { AlertContext } from "@web/app/providers/AlertContext";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import useServerPagination from "@web/shared/hooks/useServerPagination";
import type { PersonSummary } from "./EmployeeIdentity";
import {
  handOff,
  sharedPart,
  useTransitionNavigate,
  useTransitionWith,
} from "@next/motion";
import {
  DataTable,
  Page,
  Pagination,
  PrimaryCell,
  SearchField,
  Status,
  type Column,
} from "@next/ui";
import { apiClient, errorMessage, isCanceled } from "@next/lib/api";
import { useDebouncedCallback } from "@next/lib/hooks";
import { fmtDate, personName, readableCase } from "@next/lib/format";
import {
  usePresenceOf,
  useWatchPresence,
} from "@next/features/presence/PresenceProvider";
import {
  PresenceAvatar,
  PresenceSummary,
} from "@next/features/presence/PresenceIndicator";
import s from "./employees.module.css";

// Employees: Classic's data source (GET /view-all-kycs, server-paginated via
// Classic's useServerPagination). A row opens the full record directly, with
// a shared-element transition on the person's identity.

const detailPath = (row: any) =>
  `/employee-management/${encodeURIComponent(row.username)}`;

function NameCell({ row }: { row: any }) {
  // Only the row being opened (or returned to) names its avatar and name;
  // they grow into the profile's header (EmployeeIdentity).
  const on = useTransitionWith(detailPath(row));
  return (
    <PrimaryCell
      leading={
        <PresenceAvatar
          userId={row.id}
          name={personName(row)}
          src={row.employee_photo}
          size={32}
          style={sharedPart("person", row.username, "avatar", on)}
        />
      }
      title={readableCase(personName(row))}
      titleStyle={sharedPart("person", row.username, "title", on)}
      subtitle={row.official_email || row.email || row.username}
    />
  );
}

/** Live availability: status, message and end time (docs/presence.md). */
function AvailabilityCell({ row }: { row: any }) {
  return <PresenceSummary view={usePresenceOf(row.id)} />;
}

/** What the profile can show before its own request returns. */
const personPreview = (row: PersonSummary): PersonSummary => ({
  username: row.username,
  first_name: row.first_name,
  last_name: row.last_name,
  fullName: row.fullName,
  name: row.name,
  employee_photo: row.employee_photo,
  designation: row.designation,
  department: row.department,
});

export default function Employees() {
  const { setAlert } = useContext(AlertContext);
  const [query, setQuery] = useState("");
  const searchRef = useRef("");
  const navigate = useTransitionNavigate();

  const fetchPage = useCallback(
    async ({ page, limit }: { page: number; limit: number }) => {
      const base = API_ENDPOINTS.VIEW_ALL_KYCS(page, limit);
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
        data: res.data?.data?.kycs ?? [],
        totalCount: res.data?.data?.pagination?.totalCount ?? 0,
      };
    },
    [setAlert],
  );
  const list = useServerPagination(fetchPage, { initialPageSize: 25 });
  useWatchPresence(list.data.map((r: any) => r.id));

  const applySearch = useDebouncedCallback((v: string) => {
    searchRef.current = v.trim();
    list.resetPagination();
  }, 300);
  const onSearch = (v: string) => {
    setQuery(v);
    applySearch(v);
  };

  const columns: Column<any>[] = [
    {
      key: "name",
      header: "Name",
      priority: "primary",
      render: (r) => <NameCell row={r} />,
    },
    {
      key: "availability",
      header: "Availability",
      priority: "secondary",
      render: (r) => <AvailabilityCell row={r} />,
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
        onRowClick={(r) => {
          handOff("person", r.username, personPreview(r));
          navigate(detailPath(r));
        }}
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
