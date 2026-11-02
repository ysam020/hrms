import dayjs from "dayjs";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import useServerPagination from "@web/shared/hooks/useServerPagination";
import {
  Avatar,
  Button,
  ConfirmDialog,
  DataTable,
  Pagination,
  PrimaryCell,
  SearchField,
  SegmentedControl,
  Status,
  Switch,
  inlineCheckClass,
  type Column,
} from "@next/ui";
import { errorMessage, isCanceled } from "@next/lib/api";
import {
  bulkUpdateLeaveStatus,
  listLeaveApplications,
  updateLeaveStatus,
} from "../services/leaveService";
import { canActOnLeave, canManageLeaves } from "../utils/leaveRules";
import { useDebouncedCallback, useIsCompact } from "@next/lib/hooks";
import { fmtDate, personName } from "@next/lib/format";

// ── Leave applications ──────────────────────────────────────────────────────

const STATUSES = [
  "All",
  "Pending",
  "Approved",
  "Rejected",
  "Cancelled",
] as const;

/** Applies one decision to one or many requests; returns the toast to show. */
async function decide(ids: string[], verb: "approve" | "reject" | "cancel") {
  if (ids.length === 1) {
    const res = await updateLeaveStatus(ids[0], verb);
    return {
      message: res.message || "Leave updated.",
      severity: "success" as const,
    };
  }
  const res = await bulkUpdateLeaveStatus(ids, verb);
  const failed = res.failed;
  const ok = res.succeeded;
  return {
    message: failed.length
      ? `${ok.length} updated, ${failed.length} failed.`
      : res.message || `${ok.length} updated.`,
    severity: failed.length ? ("warning" as const) : ("success" as const),
  };
}

export function LeaveApplications() {
  const { user } = useContext(UserContext);
  const { setAlert } = useContext(AlertContext);
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("Pending");
  const [futureOnly, setFutureOnly] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // On phones, rows carry no checkbox until the manager chooses Select (an
  // edit mode, as in iOS lists); wider screens keep the always-available
  // checkbox column.
  const compact = useIsCompact();
  const [selecting, setSelecting] = useState(false);
  const [action, setAction] = useState<{
    ids: string[];
    verb: "approve" | "reject" | "cancel";
    label: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  // Owners/admins, or Leave:approve at team/all scope; people can't act on
  // their own requests (superusers excepted). See utils/leaveRules.
  const canManage = canManageLeaves(user);
  const canActOn = (r: any) => canActOnLeave(user, r);

  const fetchPage = useCallback(
    async ({ page, limit }: { page: number; limit: number }) => {
      try {
        return await listLeaveApplications({
          page,
          limit,
          status,
          futureOnly,
          search: searchRef.current,
        });
      } catch (err) {
        if (!isCanceled(err))
          setAlert({
            open: true,
            message: "Leave applications couldn’t be loaded. Try again.",
            severity: "error",
          });
        throw err;
      }
    },
    [status, futureOnly, setAlert],
  );
  const list = useServerPagination(fetchPage, {
    initialPageSize: 25,
    deps: [status, futureOnly],
  });
  useEffect(() => setSelected(new Set()), [list.data]);
  useEffect(() => setSelecting(false), [status]);

  const applySearch = useDebouncedCallback((v: string) => {
    searchRef.current = v.trim();
    list.resetPagination();
  }, 300);
  const onSearch = (v: string) => {
    setQuery(v);
    applySearch(v);
  };

  const confirm = async () => {
    if (!action) return;
    setBusy(true);
    try {
      const outcome = await decide(action.ids, action.verb);
      setAlert({ open: true, ...outcome });
      if (action.ids.length > 1) setSelecting(false);
      setAction(null);
      list.refresh();
    } catch (err) {
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    }
    setBusy(false);
  };

  const rowActions = (r: any) => {
    const id = String(r.id || r._id);
    const own = r.userId === user?.id;
    return (
      <div
        className="px-row"
        style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}
        onClick={(e) => e.stopPropagation()}
      >
        {r.status === "Pending" && canActOn(r) && (
          <>
            <Button
              size="small"
              variant="tintedDanger"
              onClick={() =>
                setAction({ ids: [id], verb: "reject", label: "Reject" })
              }
            >
              Reject
            </Button>
            <Button
              size="small"
              variant="tinted"
              onClick={() =>
                setAction({ ids: [id], verb: "approve", label: "Approve" })
              }
            >
              Approve
            </Button>
          </>
        )}
        {own && ["Pending", "Approved"].includes(r.status) && (
          <Button
            size="small"
            variant="plain"
            onClick={() =>
              setAction({ ids: [id], verb: "cancel", label: "Withdraw" })
            }
          >
            Withdraw
          </Button>
        )}
      </div>
    );
  };

  const columns: Column<any>[] = [
    {
      key: "who",
      header: "Employee",
      priority: "primary",
      render: (r) => (
        <PrimaryCell
          leading={<Avatar name={personName(r)} size={28} />}
          title={personName(r)}
          subtitle={
            r.leaveType
              ? `${r.leaveType}${r.unit && r.unit !== "full_day" ? ` · ${r.unit === "half_day" ? "Half day" : "Short leave"}` : ""}`
              : undefined
          }
        />
      ),
    },
    {
      key: "dates",
      header: "Dates",
      priority: "secondary",
      render: (r) => (
        <span className="px-num">
          {fmtDate(r.from)}
          {r.to && !dayjs(r.to).isSame(r.from, "day")
            ? ` – ${fmtDate(r.to)}`
            : ""}
        </span>
      ),
    },
    {
      key: "reason",
      header: "Reason",
      priority: "secondary",
      render: (r) => <span className="px-secondary">{r.reason || "—"}</span>,
    },
    {
      key: "status",
      header: "Status",
      priority: "trailing",
      render: (r) => <Status value={r.status} />,
    },
    {
      key: "actions",
      header: <span className="px-sr-only">Actions</span>,
      align: "right",
      priority: "secondary",
      render: rowActions,
    },
  ];

  const pendingSelectable = list.data.filter(
    (r: any) => r.status === "Pending" && canActOn(r),
  );
  const canBulk =
    canManage && status === "Pending" && pendingSelectable.length > 1;
  const showSelection = canBulk && (!compact || selecting);
  const endSelecting = () => {
    setSelecting(false);
    setSelected(new Set());
  };
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="px-row" style={{ justifyContent: "space-between" }}>
        <SegmentedControl
          role="radiogroup"
          label="Status"
          tour="leave-status"
          value={status}
          onChange={setStatus}
          segments={STATUSES.map((s) => ({ value: s, label: s }))}
        />
        {compact && canBulk && (
          <Button
            size="small"
            variant="plain"
            aria-pressed={selecting}
            onClick={() => (selecting ? endSelecting() : setSelecting(true))}
          >
            {selecting ? "Done" : "Select"}
          </Button>
        )}
        <div className="px-row">
          <label className={inlineCheckClass}>
            <Switch
              checked={futureOnly}
              onChange={setFutureOnly}
              label="Upcoming only"
            />
            Upcoming only
          </label>
          <SearchField
            label="Search people"
            value={query}
            onChange={(e) => onSearch(e.target.value)}
            toolbarWidth={220}
            data-tour="leave-search"
          />
        </div>
      </div>
      <DataTable
        label="Leave applications"
        tour="leave-table"
        columns={columns}
        rows={list.data}
        rowId={(r) => String(r.id || r._id)}
        loading={list.loading}
        stickyOffset={52}
        selected={showSelection ? selected : undefined}
        onSelectedChange={setSelected}
        bulkActions={
          <>
            <Button
              size="small"
              variant="tintedDanger"
              onClick={() =>
                setAction({
                  ids: [...selected],
                  verb: "reject",
                  label: "Reject",
                })
              }
            >
              Reject
            </Button>
            <Button
              size="small"
              variant="primary"
              onClick={() =>
                setAction({
                  ids: [...selected],
                  verb: "approve",
                  label: "Approve",
                })
              }
            >
              Approve
            </Button>
          </>
        }
        empty={{
          icon: "leave",
          title:
            status === "All"
              ? "No leave applications"
              : `No ${status.toLowerCase()} applications`,
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
      <ConfirmDialog
        open={Boolean(action)}
        onClose={() => setAction(null)}
        onConfirm={confirm}
        busy={busy}
        tone={action?.verb === "approve" ? "accent" : "danger"}
        title={
          action
            ? `${action.label} ${action.ids.length > 1 ? `${action.ids.length} Applications` : "Leave"}?`
            : ""
        }
        description={
          action?.verb === "cancel"
            ? "Your leave request will be withdrawn."
            : "The employee will be notified."
        }
        confirmLabel={action?.label ?? ""}
      />
    </div>
  );
}
