import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { AlertContext } from "@web/app/providers/AlertContext";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import useServerPagination from "@web/shared/hooks/useServerPagination";
import { TransitionLink, useSharedElement, vtName } from "@next/motion";
import {
  Avatar,
  Button,
  DataTable,
  Inspector,
  KeyValues,
  Page,
  Pagination,
  PrimaryCell,
  SearchField,
  Status,
  type Column,
} from "@next/ui";
import { apiClient, errorMessage, isCanceled } from "@next/lib/api";
import { fmtDate, personName } from "@next/lib/format";
import s from "./employees.module.css";

// Employees: Classic's data source (GET /view-all-kycs, server-paginated via
// Classic's useServerPagination) shown as a list with an inspector, so HR can
// scan people without losing their place. "Open Profile" goes to the full
// record with a shared-element transition on the person's identity.

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
      title={personName(row)}
      subtitle={row.official_email || row.email || row.username}
    />
  );
}

export default function Employees() {
  const { setAlert } = useContext(AlertContext);
  const [query, setQuery] = useState("");
  const searchRef = useRef("");
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selected, setSelected] = useState<any | null>(null);

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
      render: (r) => r.designation || "—",
    },
    {
      key: "department",
      header: "Department",
      priority: "secondary",
      stackLabel: "Dept",
      render: (r) => r.department || "—",
    },
    {
      key: "joined",
      header: "Joined",
      priority: "hidden",
      render: (r) => <span className="px-num">{fmtDate(r.joining_date)}</span>,
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
      inspector={
        <Inspector
          open={Boolean(selected)}
          onClose={() => setSelected(null)}
          id={selected?.username}
          title="Employee"
          footer={
            selected && (
              <TransitionLink to={detailPath(selected)}>
                <Button variant="primary">Open Profile</Button>
              </TransitionLink>
            )
          }
        >
          {selected && (
            <div className={s.peek}>
              <div className={s.peekHead}>
                <Avatar
                  name={personName(selected)}
                  src={selected.employee_photo}
                  size={48}
                />
                <div>
                  <p className="px-section">{personName(selected)}</p>
                  <p className="px-secondary">
                    {selected.designation || selected.username}
                  </p>
                </div>
              </div>
              <KeyValues
                items={[
                  ["Department", selected.department],
                  ["Work Email", selected.official_email || selected.email],
                  ["Phone", selected.mobile],
                  ["Joined", fmtDate(selected.joining_date)],
                  [
                    "KYC",
                    <Status
                      value={selected.kyc_approval || selected.kycStatus}
                    />,
                  ],
                ]}
              />
            </div>
          )}
        </Inspector>
      }
    >
      <div className={s.filters}>
        <SearchField
          label="Search by name, email, or username"
          value={query}
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>
      <DataTable
        label="Employees"
        columns={columns}
        rows={list.data}
        rowId={(r) => r.username}
        loading={list.loading}
        error={list.error ? errorMessage(list.error) : null}
        onRetry={list.refresh}
        onRowClick={setSelected}
        selectedId={selected?.username ?? null}
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
