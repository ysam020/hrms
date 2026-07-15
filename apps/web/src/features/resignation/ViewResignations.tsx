import {
  memo,
  useCallback,
  useContext,
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
import { UserContext } from "@web/app/providers/UserContext";
import { AlertContext } from "@web/app/providers/AlertContext";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import ResignationDecisionDialog from "./ResignationDecisionDialog";
import ExitManagementDialog from "./ExitManagementDialog";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Person from "@mui/icons-material/Person";
import VisibilityIcon from "@mui/icons-material/Visibility";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import RemoveCircleOutlineIcon from "@mui/icons-material/RemoveCircleOutline";
import ManageAccountsIcon from "@mui/icons-material/ManageAccounts";
import FilterList from "@mui/icons-material/FilterList";
import { API_ENDPOINTS } from "@web/shared/constants";
import hasPermission from "@web/shared/utils/permissions/hasPermission";

const STATUS_OPTIONS = [
  { label: "All", value: "All" },
  { label: "Submitted", value: "Submitted" },
  { label: "Approved", value: "Approved" },
  { label: "Rejected", value: "Rejected" },
  { label: "Withdrawn", value: "Withdrawn" },
];

function ViewResignations() {
  const { user } = useContext(UserContext);
  const { setAlert } = useContext(AlertContext);
  const { theme } = useContext(ThemeContext);
  const [decisionDialog, setDecisionDialog] = useState<{
    mode: "approve" | "reject";
    id: string;
    name?: string;
  } | null>(null);
  const [exitManagement, setExitManagement] = useState<{
    id: string;
    name?: string;
    rehireEligible?: boolean | null;
    status?: string;
    submittedOn?: string;
    approvedOn?: string;
    rejectedOn?: string;
    withdrawnOn?: string;
    relievedFromDutyOn?: string;
    canManage?: boolean;
    reason?: string;
    overallJobSatisfaction?: number;
    qualityOfCommunication?: string;
    supportFromManager?: string;
    appreciationForWork?: string;
    collaborationWithinTheTeam?: string;
    overallCompanyCulture?: string;
    suggestions?: string;
  } | null>(null);
  const [statusFilter, setStatusFilter] = useState("All");
  const [globalFilter, setGlobalFilter] = useState("");
  const searchRef = useRef("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchResignations = useCallback(
    async ({ page, limit }) => {
      try {
        const search = searchRef.current;
        let url = API_ENDPOINTS.VIEW_RESIGNATIONS(page, limit);
        if (statusFilter && statusFilter !== "All") {
          url += `&status=${encodeURIComponent(statusFilter)}`;
        }
        if (search) url += `&search=${encodeURIComponent(search)}`;

        const response = await apiClient(url);

        return {
          data: response.data.data || [],
          totalCount: response.data.totalCount || 0,
        };
      } catch (error) {
        if (error?.code === "ERR_CANCELED" || error?.name === "CanceledError")
          throw error;
        setAlert({
          open: true,
          message: "Failed to fetch resignations",
          severity: "error",
        });
        throw error;
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
  } = useServerPagination(fetchResignations, {
    initialPageSize: 10,
    deps: [statusFilter],
  });

  const handleGlobalFilterChange = useCallback(
    (value) => {
      searchRef.current = value ?? "";
      setGlobalFilter(value ?? "");
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        resetPagination();
      }, 400);
    },
    [resetPagination],
  );

  const handleResignationAction = useCallback(
    async ({ id, action, successMessage }) => {
      try {
        const res = await apiClient.put(`/${action}/${id}`);
        refresh();
        setAlert({
          open: true,
          message: res.data.message || successMessage,
          severity: "success",
        });
      } catch (err) {
        setAlert({
          open: true,
          message:
            err.message === "Network Error"
              ? "Network Error, your details will be submitted when you are back online"
              : err.response?.data?.message || "Something went wrong",
          severity: "error",
        });
      }
    },
    [refresh, setAlert],
  );

  const getStatusChip = useCallback(
    (status) => {
      const statusMap = {
        Approved: {
          color: theme === "light" ? "#059669" : "#34d399",
          bg:
            theme === "light"
              ? "rgba(16, 185, 129, 0.15)"
              : "rgba(52, 211, 153, 0.2)",
          label: "Approved",
        },
        Rejected: {
          color: theme === "light" ? "#dc2626" : "#f87171",
          bg:
            theme === "light"
              ? "rgba(239, 68, 68, 0.15)"
              : "rgba(248, 113, 113, 0.2)",
          label: "Rejected",
        },
        Submitted: {
          color: theme === "light" ? "#d97706" : "#fbbf24",
          bg:
            theme === "light"
              ? "rgba(251, 191, 36, 0.15)"
              : "rgba(251, 191, 36, 0.2)",
          label: "Submitted",
        },
        Withdrawn: {
          color: theme === "light" ? "#64748b" : "#94a3b8",
          bg:
            theme === "light"
              ? "rgba(100, 116, 139, 0.15)"
              : "rgba(148, 163, 184, 0.2)",
          label: "Withdrawn",
        },
      };

      const config = statusMap[status] || statusMap.Submitted;

      return (
        <Chip
          label={config.label}
          size="small"
          sx={{
            backgroundColor: config.bg,
            color: config.color,
            fontWeight: 500,
            fontSize: "0.7rem",
            height: "22px",
            borderRadius: "4px",
            "& .MuiChip-label": {
              padding: "0 8px",
            },
          }}
        />
      );
    },
    [theme],
  );

  const columns = useMemo(
    () => [
      {
        key: "username",
        label: "Username",
        primary: true,
        hideLabel: true,
        render: (row: any) => (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Person
              sx={{ fontSize: 14, color: "text.secondary", opacity: 0.6 }}
            />
            <Typography variant="body2" fontSize="0.8rem" fontWeight={500}>
              {row.username}
            </Typography>
          </Box>
        ),
      },
      {
        key: "resignationDate",
        label: "Resignation Date",
        render: (row: any) =>
          row.resignationDate
            ? dayjs(row.resignationDate).format("DD-MM-YYYY")
            : "N/A",
      },
      {
        key: "lastWorkingDate",
        label: "Last Date",
        render: (row: any) =>
          row.lastWorkingDate
            ? dayjs(row.lastWorkingDate).format("DD-MM-YYYY")
            : "N/A",
      },
      {
        key: "status",
        label: "Status",
        hideLabel: true,
        render: (row: any) => getStatusChip(row.status),
      },
    ],
    [getStatusChip],
  );

  const actions = useCallback(
    (rowData: any) => {
      const canManageResignation =
        user?.isSuperUser ||
        ["owner", "admin"].includes(user?.tenantRole ?? "") ||
        hasPermission(
          "ResignationProcess",
          "approve_resignation",
          "team",
          user?.isSuperUser,
          user?.permissions || [],
        ) ||
        hasPermission(
          "ResignationProcess",
          "approve_resignation",
          "all",
          user?.isSuperUser,
          user?.permissions || [],
        ) ||
        hasPermission(
          "ResignationProcess",
          "reject_resignation",
          "team",
          user?.isSuperUser,
          user?.permissions || [],
        ) ||
        hasPermission(
          "ResignationProcess",
          "reject_resignation",
          "all",
          user?.isSuperUser,
          user?.permissions || [],
        );
      const canApproveReject =
        canManageResignation &&
        !["Withdrawn", "Rejected", "Approved"].includes(rowData.status) &&
        (user?.isSuperUser || rowData.userId !== user.id);
      const canWithdraw =
        rowData.status === "Submitted" &&
        (rowData.userId === user.id || user?.isSuperUser);
      const canManageExit =
        (user?.isSuperUser ||
          ["owner", "admin"].includes(user?.tenantRole ?? "") ||
          hasPermission(
            "ResignationProcess",
            "update_resignation_status",
            "team",
            user?.isSuperUser,
            user?.permissions || [],
          ) ||
          hasPermission(
            "ResignationProcess",
            "update_resignation_status",
            "all",
            user?.isSuperUser,
            user?.permissions || [],
          )) &&
        !["Withdrawn", "Rejected"].includes(rowData.status);

      return [
        {
          icon: canManageExit ? (
            <ManageAccountsIcon sx={{ fontSize: 16 }} />
          ) : (
            <VisibilityIcon sx={{ fontSize: 16 }} />
          ),
          label: canManageExit
            ? `Manage exit for ${rowData.username ?? "employee"}`
            : `View exit details for ${rowData.username ?? "employee"}`,
          color: "secondary" as const,
          onClick: () =>
            setExitManagement({
              id: rowData.id,
              name: rowData.username,
              rehireEligible: rowData.rehireEligible,
              status: rowData.status,
              submittedOn: rowData.submittedOn,
              approvedOn: rowData.approvedOn,
              rejectedOn: rowData.rejectedOn,
              withdrawnOn: rowData.withdrawnOn,
              relievedFromDutyOn: rowData.relievedFromDutyOn,
              canManage: canManageExit,
              reason: rowData.reason,
              overallJobSatisfaction: rowData.overallJobSatisfaction,
              qualityOfCommunication: rowData.qualityOfCommunication,
              supportFromManager: rowData.supportFromManager,
              appreciationForWork: rowData.appreciationForWork,
              collaborationWithinTheTeam: rowData.collaborationWithinTheTeam,
              overallCompanyCulture: rowData.overallCompanyCulture,
              suggestions: rowData.suggestions,
            }),
        },
        ...(canApproveReject
          ? [
              {
                icon: <CheckIcon sx={{ fontSize: 16 }} />,
                label: `Approve resignation for ${rowData.username ?? "employee"}`,
                color: "success" as const,
                onClick: () =>
                  setDecisionDialog({
                    mode: "approve" as const,
                    id: rowData.id,
                    name: rowData.username,
                  }),
              },
              {
                icon: <CloseIcon sx={{ fontSize: 16 }} />,
                label: `Reject resignation for ${rowData.username ?? "employee"}`,
                color: "error" as const,
                onClick: () =>
                  setDecisionDialog({
                    mode: "reject" as const,
                    id: rowData.id,
                    name: rowData.username,
                  }),
              },
            ]
          : []),
        ...(canWithdraw
          ? [
              {
                icon: <RemoveCircleOutlineIcon sx={{ fontSize: 16 }} />,
                label: `Withdraw resignation for ${rowData.username ?? "employee"}`,
                onClick: () =>
                  handleResignationAction({
                    id: rowData.id,
                    action: "withdraw-resignation",
                    successMessage: "Resignation withdrawn successfully",
                  }),
              },
            ]
          : []),
      ];
    },
    [user, handleResignationAction],
  );

  return (
    <ErrorBoundary fallback={<ErrorFallback />}>
      <DataList
        ariaLabel="Resignations"
        data={data || []}
        columns={columns}
        actions={actions}
        loading={loading}
        emptyMessage="No resignations found"
        search={{
          value: globalFilter,
          onChange: handleGlobalFilterChange,
          placeholder: "Search resignations…",
        }}
        toolbarActions={
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
        }
        pagination={{
          page: pagination.pageIndex,
          pageSize: pagination.pageSize,
          totalCount,
          onPageChange: (page) =>
            handlePaginationChange({ ...pagination, pageIndex: page }),
          onPageSizeChange: handlePageSizeChange,
          pageSizeOptions: [5, 10, 25, 50, 100],
        }}
      />

      <ResignationDecisionDialog
        open={!!decisionDialog}
        mode={decisionDialog?.mode ?? "approve"}
        resignationId={decisionDialog?.id ?? null}
        employeeName={decisionDialog?.name}
        onClose={() => setDecisionDialog(null)}
        onDone={() => {
          setDecisionDialog(null);
          refresh();
        }}
      />

      <ExitManagementDialog
        open={!!exitManagement}
        resignationId={exitManagement?.id ?? null}
        employeeName={exitManagement?.name}
        rehireEligible={exitManagement?.rehireEligible}
        status={exitManagement?.status}
        submittedOn={exitManagement?.submittedOn}
        approvedOn={exitManagement?.approvedOn}
        rejectedOn={exitManagement?.rejectedOn}
        withdrawnOn={exitManagement?.withdrawnOn}
        relievedFromDutyOn={exitManagement?.relievedFromDutyOn}
        canManage={exitManagement?.canManage}
        reason={exitManagement?.reason}
        overallJobSatisfaction={exitManagement?.overallJobSatisfaction}
        qualityOfCommunication={exitManagement?.qualityOfCommunication}
        supportFromManager={exitManagement?.supportFromManager}
        appreciationForWork={exitManagement?.appreciationForWork}
        collaborationWithinTheTeam={exitManagement?.collaborationWithinTheTeam}
        overallCompanyCulture={exitManagement?.overallCompanyCulture}
        suggestions={exitManagement?.suggestions}
        onClose={() => setExitManagement(null)}
      />
    </ErrorBoundary>
  );
}

export default memo(ViewResignations);
