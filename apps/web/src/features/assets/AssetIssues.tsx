import {
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import dayjs from "dayjs";
import { Dropdown } from "primereact/dropdown";
import DataList from "@web/shared/components/DataList";
import useServerPagination from "@web/shared/hooks/useServerPagination";
import apiClient from "@web/core/http/axiosConfig";
import ErrorFallback from "@web/shared/components/ErrorFallback";
import { ErrorBoundary } from "react-error-boundary";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import AddIcon from "@mui/icons-material/Add";
import FilterList from "@mui/icons-material/FilterList";
import VisibilityIcon from "@mui/icons-material/Visibility";
import { API_ENDPOINTS } from "@web/shared/constants";
import hasPermission from "@web/shared/utils/permissions/hasPermission";
import { isHrOrAbove } from "@web/shared/utils/permissions/navAccess";
import { StatusChip, PriorityLabel } from "./asset-issues/components";
import {
  ISSUE_TYPES,
  NEXT_ACTIONS,
  STATUS_OPTIONS,
} from "./asset-issues/constants";
import {
  ReportIssueDialog,
  type ReportForm,
} from "./asset-issues/ReportIssueDialog";
import {
  HrActionDialog,
  type ActionDialogState,
} from "./asset-issues/HrActionDialog";
import { ViewDetailsDialog } from "./asset-issues/ViewDetailsDialog";

const EMPTY_REPORT_FORM: ReportForm = {
  assetId: "",
  type: "malfunction",
  priority: "medium",
  title: "",
  description: "",
};

function AssetIssues() {
  const { setAlert } = useContext(AlertContext);
  const { user } = useContext(UserContext);

  const isHr =
    isHrOrAbove(user) ||
    hasPermission(
      "Assets",
      "manage",
      "-",
      user?.isSuperUser,
      user?.permissions || [],
    );

  // ── Table state ────────────────────────────────────────────────────────────
  const [globalFilter, setGlobalFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const searchRef = useRef("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Report dialog (employee) ───────────────────────────────────────────────
  const [openReport, setOpenReport] = useState(false);
  const [myAssets, setMyAssets] = useState<
    { id: string; assetCode: string; name: string }[]
  >([]);
  const [reportForm, setReportForm] = useState<ReportForm>(EMPTY_REPORT_FORM);
  const [submitting, setSubmitting] = useState(false);

  // Load assets when the report dialog opens.
  // HR: all assigned assets across tenant. Employee: only their own.
  useEffect(() => {
    if (!openReport) return;
    const url = isHr
      ? "/assets?status=assigned&limit=200"
      : "/assets?limit=100";
    apiClient
      .get(url)
      .then((res) => {
        const list: any[] = Array.isArray(res.data?.data) ? res.data.data : [];
        setMyAssets(
          list.map((a: any) => ({
            id: a.id,
            assetCode: a.assetCode,
            name: a.name,
          })),
        );
      })
      .catch(() => setMyAssets([]));
  }, [openReport, isHr]);

  // ── Action dialog (HR) ─────────────────────────────────────────────────────
  const [actionDialog, setActionDialog] = useState<ActionDialogState | null>(
    null,
  );
  const [actionNotes, setActionNotes] = useState("");
  const [actioning, setActioning] = useState(false);

  // ── View details dialog (everyone — read-only) ─────────────────────────────
  // Surfaces reviewNotes/resolverNotes, which are already returned by the
  // list/detail endpoints but were previously never shown anywhere.
  const [viewIssue, setViewIssue] = useState<any>(null);

  // ── Fetch issues ───────────────────────────────────────────────────────────
  const fetchIssues = useCallback(
    async ({ page, limit }) => {
      try {
        const search = searchRef.current;
        let params = search ? `&search=${encodeURIComponent(search)}` : "";
        if (statusFilter && statusFilter !== "All") {
          params += `&status=${statusFilter}`;
        }
        const res = await apiClient(
          API_ENDPOINTS.ASSET_ISSUES(page, limit, params),
        );
        return {
          data: res.data.data ?? [],
          totalCount: res.data.total ?? 0,
        };
      } catch (err: any) {
        if (err?.code === "ERR_CANCELED" || err?.name === "CanceledError")
          throw err;
        setAlert({
          open: true,
          message: "Failed to fetch issues",
          severity: "error",
        });
        throw err;
      }
    },
    [statusFilter, setAlert],
  );

  const {
    data,
    loading,
    totalCount,
    pagination,
    handlePaginationChange,
    handlePageSizeChange,
    refresh,
    resetPagination,
  } = useServerPagination(fetchIssues, {
    initialPageSize: 10,
    deps: [statusFilter],
  });

  const handleGlobalFilterChange = useCallback(
    (value: string) => {
      searchRef.current = value ?? "";
      setGlobalFilter(value ?? "");
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => resetPagination(), 400);
    },
    [resetPagination],
  );

  // ── Submit report ──────────────────────────────────────────────────────────
  const handleReport = useCallback(async () => {
    setSubmitting(true);
    try {
      await apiClient.post(API_ENDPOINTS.REPORT_ASSET_ISSUE, reportForm);
      refresh();
      setOpenReport(false);
      setReportForm(EMPTY_REPORT_FORM);
      setAlert({ open: true, message: "Issue reported", severity: "success" });
    } catch (err: any) {
      setAlert({
        open: true,
        message: err?.response?.data?.message || "Failed to report issue",
        severity: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }, [reportForm, refresh, setAlert]);

  // ── Submit HR action ───────────────────────────────────────────────────────
  const handleAction = useCallback(async () => {
    if (!actionDialog) return;
    setActioning(true);
    try {
      await apiClient.patch(
        API_ENDPOINTS.UPDATE_ASSET_ISSUE_STATUS(actionDialog.issueId),
        { status: actionDialog.targetStatus, notes: actionNotes || undefined },
      );
      refresh();
      setActionDialog(null);
      setActionNotes("");
      setAlert({
        open: true,
        message: `Issue marked as '${actionDialog.targetStatus}'`,
        severity: "success",
      });
    } catch (err: any) {
      setAlert({
        open: true,
        message: err?.response?.data?.message || "Action failed",
        severity: "error",
      });
    } finally {
      setActioning(false);
    }
  }, [actionDialog, actionNotes, refresh, setAlert]);

  // ── Columns ────────────────────────────────────────────────────────────────
  const columns = useMemo(
    () => [
      {
        key: "asset",
        label: "Asset",
        primary: true,
        hideLabel: true,
        render: (row: any) => (
          <Box>
            <Typography
              variant="body2"
              fontSize="0.8rem"
              fontWeight={600}
              sx={{ fontFamily: "monospace" }}
            >
              {row.asset?.assetCode ?? "—"}
            </Typography>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              {row.asset?.name ?? ""}
            </Typography>
          </Box>
        ),
      },
      {
        key: "type",
        label: "Type",
        render: (row: any) =>
          ISSUE_TYPES.find((t) => t.value === row.type)?.label ?? row.type,
      },
      {
        key: "priority",
        label: "Priority",
        render: (row: any) => <PriorityLabel priority={row.priority} />,
      },
      {
        key: "title",
        label: "Title",
        render: (row: any) => row.title,
      },
      {
        key: "status",
        label: "Status",
        hideLabel: true,
        render: (row: any) => <StatusChip status={row.status} />,
      },
      ...(isHr
        ? [
            {
              key: "reporter",
              label: "Reported By",
              render: (row: any) => row.reporter?.username ?? "—",
            },
          ]
        : []),
      {
        key: "createdAt",
        label: "Reported On",
        render: (row: any) =>
          row.createdAt ? dayjs(row.createdAt).format("DD MMM YYYY") : "—",
      },
    ],
    [isHr],
  );

  const rowActions = useCallback(
    (row: any) => {
      const viewAction = {
        icon: <VisibilityIcon sx={{ fontSize: 16 }} />,
        label: "View Details",
        onClick: () => setViewIssue(row),
      };
      if (!isHr) return [viewAction];
      const next = NEXT_ACTIONS[row.status] ?? [];
      return [
        viewAction,
        ...next.map((a) => ({
          icon: a.icon,
          label: a.label,
          onClick: () =>
            setActionDialog({
              issueId: row.id,
              targetStatus: a.status,
              label: a.label,
              currentType: row.type,
            }),
        })),
      ];
    },
    [isHr],
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <ErrorBoundary fallback={<ErrorFallback />}>
      <DataList
        ariaLabel="Asset issues"
        data={data || []}
        columns={columns}
        actions={rowActions}
        loading={loading}
        emptyMessage="No asset issues found"
        search={{
          value: globalFilter,
          onChange: handleGlobalFilterChange,
          placeholder: "Search issues…",
        }}
        toolbarActions={
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <FilterList
                sx={{ fontSize: 18, color: "text.secondary", opacity: 0.7 }}
              />
              <Box sx={{ minWidth: 130 }}>
                <Dropdown
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.value)}
                  options={STATUS_OPTIONS}
                  placeholder="Select Status"
                  className="w-full"
                  style={{ minWidth: "130px" }}
                  appendTo={() =>
                    document.querySelector("#root .App") as HTMLElement
                  }
                />
              </Box>
            </Box>
            <Tooltip title="Report Issue">
              <span>
                <IconButton
                  color="primary"
                  size="small"
                  onClick={() => setOpenReport(true)}
                  aria-label="Report asset issue"
                >
                  <AddIcon sx={{ fontSize: 20 }} />
                </IconButton>
              </span>
            </Tooltip>
          </Box>
        }
        pagination={{
          page: pagination.pageIndex,
          pageSize: pagination.pageSize,
          totalCount,
          onPageChange: (page) =>
            handlePaginationChange({ ...pagination, pageIndex: page }),
          onPageSizeChange: handlePageSizeChange,
          pageSizeOptions: [5, 10, 25, 50],
        }}
      />

      <ReportIssueDialog
        open={openReport}
        onClose={() => {
          setOpenReport(false);
          setReportForm(EMPTY_REPORT_FORM);
        }}
        form={reportForm}
        setForm={setReportForm}
        myAssets={myAssets}
        submitting={submitting}
        onSubmit={handleReport}
      />

      <HrActionDialog
        actionDialog={actionDialog}
        onClose={() => {
          setActionDialog(null);
          setActionNotes("");
        }}
        notes={actionNotes}
        setNotes={setActionNotes}
        actioning={actioning}
        onConfirm={handleAction}
      />

      <ViewDetailsDialog issue={viewIssue} onClose={() => setViewIssue(null)} />
    </ErrorBoundary>
  );
}

export default memo(AssetIssues);
