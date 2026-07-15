import {
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import dayjs from "dayjs";
import { Calendar } from "primereact/calendar";
import DataList from "@web/shared/components/DataList";
import apiClient from "@web/core/http/axiosConfig";
import ErrorFallback from "@web/shared/components/ErrorFallback";
import { ErrorBoundary } from "react-error-boundary";
import { AlertContext } from "@web/app/providers/AlertContext";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import ConfirmationDialog from "@web/shared/components/ConfirmationDialog";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Avatar from "@mui/material/Avatar";
import AvatarGroup from "@mui/material/AvatarGroup";
import Button from "@web/shared/components/Button";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import Autocomplete from "@mui/material/Autocomplete";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import LockIcon from "@mui/icons-material/Lock";
import DeleteIcon from "@mui/icons-material/Delete";
import { API_ENDPOINTS } from "@web/shared/constants";

const STATUS_CFG: Record<string, { color: string; bg: string }> = {
  draft: { color: "#64748b", bg: "rgba(100,116,139,0.15)" },
  active: { color: "#059669", bg: "rgba(5,150,105,0.15)" },
  closed: { color: "#6366f1", bg: "rgba(99,102,241,0.15)" },
};

function StatusChip({ status }: { status: string }) {
  const cfg = STATUS_CFG[status?.toLowerCase()] ?? STATUS_CFG.draft;
  return (
    <Chip
      label={status}
      size="small"
      sx={{
        backgroundColor: cfg.bg,
        color: cfg.color,
        fontWeight: 600,
        fontSize: "0.7rem",
        height: 22,
        borderRadius: "4px",
        "& .MuiChip-label": { padding: "0 8px" },
      }}
    />
  );
}

type EmployeeOption = { id: string; label: string; photo?: string };

const emptyForm = {
  name: "",
  periodStart: null as Date | null,
  periodEnd: null as Date | null,
  ratingScale: 5,
  employees: [] as EmployeeOption[],
};

function PerformanceReviewCycles() {
  const { setAlert } = useContext(AlertContext);
  const { theme } = useContext(ThemeContext);
  const [cycles, setCycles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingCycleId, setEditingCycleId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [membersByCycle, setMembersByCycle] = useState<
    Record<string, string[]>
  >({});
  const [form, setForm] = useState(emptyForm);

  const fetchCycles = useCallback(async () => {
    setLoading(true);
    try {
      const [cyclesRes, reviewsRes] = await Promise.all([
        apiClient(API_ENDPOINTS.REVIEW_CYCLES),
        apiClient(API_ENDPOINTS.ALL_REVIEWS),
      ]);
      setCycles(cyclesRes.data.data || []);

      const byCycle: Record<string, string[]> = {};
      for (const r of reviewsRes.data.data || []) {
        (byCycle[r.cycleId] ||= []).push(r.userId);
      }
      setMembersByCycle(byCycle);
    } catch (err: any) {
      // A superseded duplicate GET (e.g. Reviews.tsx fetching the same
      // endpoint on mount, since TabsPanel mounts every tab at once) is
      // already retried transparently by the shared axios interceptor —
      // this only ever fires for a genuine cancellation (e.g. unmount) or a
      // real failure, matching the guard used elsewhere in the app (see
      // EmployeeManagement.tsx).
      if (err?.code === "ERR_CANCELED" || err?.name === "CanceledError") return;
      setAlert({
        open: true,
        message:
          err?.response?.data?.message || "Failed to fetch review cycles",
        severity: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [setAlert]);

  useEffect(() => {
    fetchCycles();
  }, [fetchCycles]);

  // Loaded once, up front — needed for the create/edit picker, resolving an
  // existing cycle's members when opening it for edit, and the per-row
  // avatar group in the list.
  useEffect(() => {
    apiClient(API_ENDPOINTS.GET_ALL_USERS())
      .then((res) => {
        const users = res.data.data || [];
        setEmployees(
          users.map((u: any) => ({
            id: u.id,
            label:
              [u.firstName, u.lastName].filter(Boolean).join(" ") || u.username,
            photo: u.employeePhoto || undefined,
          })),
        );
      })
      .catch(() => {
        /* silently ignore — the picker just stays empty */
      });
  }, []);

  const closeDialog = useCallback(() => {
    setOpen(false);
    setEditingCycleId(null);
    setForm(emptyForm);
  }, []);

  const openCreateDialog = useCallback(() => {
    setEditingCycleId(null);
    setForm(emptyForm);
    setOpen(true);
  }, []);

  const openEditDialog = useCallback(
    async (row: any) => {
      setEditingCycleId(row.id);
      setForm({
        name: row.name,
        periodStart: new Date(row.periodStart),
        periodEnd: new Date(row.periodEnd),
        ratingScale: row.ratingScale || 5,
        employees: [],
      });
      setOpen(true);
      try {
        const res = await apiClient(API_ENDPOINTS.CYCLE_REVIEWS(row.id));
        const memberIds: string[] = (res.data.data || []).map(
          (r: any) => r.userId,
        );
        const employeeById = new Map(employees.map((e) => [e.id, e]));
        setForm((f) => ({
          ...f,
          employees: memberIds.map(
            (id) => employeeById.get(id) || { id, label: id },
          ),
        }));
      } catch {
        // leave the picker empty — editing membership is still possible,
        // it'll just start unselected instead of pre-filled.
      }
    },
    [employees],
  );

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    try {
      const payload = {
        name: form.name,
        periodStart: dayjs(form.periodStart).format("YYYY-MM-DD"),
        periodEnd: dayjs(form.periodEnd).format("YYYY-MM-DD"),
        ratingScale: form.ratingScale,
        userIds: form.employees.map((e) => e.id),
      };
      if (editingCycleId) {
        await apiClient.patch(
          API_ENDPOINTS.REVIEW_CYCLE(editingCycleId),
          payload,
        );
      } else {
        await apiClient.post(API_ENDPOINTS.CREATE_REVIEW_CYCLE, payload);
      }
      closeDialog();
      fetchCycles();
      setAlert({
        open: true,
        message: editingCycleId
          ? "Review cycle updated"
          : "Review cycle created",
        severity: "success",
      });
    } catch (err: any) {
      setAlert({
        open: true,
        message:
          err?.response?.data?.message ||
          (editingCycleId
            ? "Failed to update cycle"
            : "Failed to create cycle"),
        severity: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }, [form, editingCycleId, closeDialog, fetchCycles, setAlert]);

  const [statusDialog, setStatusDialog] = useState<{
    open: boolean;
    row: any;
    action: "closed" | "deleted" | null;
  }>({ open: false, row: null, action: null });
  const [statusLoading, setStatusLoading] = useState(false);

  const handleCloseClick = useCallback((row: any) => {
    setStatusDialog({ open: true, row, action: "closed" });
  }, []);

  const handleDeleteClick = useCallback((row: any) => {
    setStatusDialog({ open: true, row, action: "deleted" });
  }, []);

  const handleStatusCancel = useCallback(() => {
    setStatusDialog({ open: false, row: null, action: null });
  }, []);

  const handleStatusConfirm = useCallback(async () => {
    if (!statusDialog.row || !statusDialog.action) return;
    setStatusLoading(true);
    try {
      await apiClient.patch(
        API_ENDPOINTS.REVIEW_CYCLE_STATUS(statusDialog.row.id),
        { status: statusDialog.action },
      );
      fetchCycles();
      setAlert({
        open: true,
        message:
          statusDialog.action === "closed"
            ? "Review cycle closed"
            : "Review cycle deleted",
        severity: "success",
      });
      setStatusDialog({ open: false, row: null, action: null });
    } catch (err: any) {
      setAlert({
        open: true,
        message:
          err?.response?.data?.message ||
          (statusDialog.action === "closed"
            ? "Failed to close cycle"
            : "Failed to delete cycle"),
        severity: "error",
      });
    } finally {
      setStatusLoading(false);
    }
  }, [statusDialog, fetchCycles, setAlert]);

  const columns = useMemo(
    () => [
      { key: "name", label: "Cycle", primary: true, hideLabel: true },
      {
        key: "periodStart",
        label: "Period",
        render: (row: any) =>
          `${dayjs(row.periodStart).format("DD MMM YYYY")} – ${dayjs(row.periodEnd).format("DD MMM YYYY")}`,
      },
      {
        key: "status",
        label: "Status",
        hideLabel: true,
        render: (row: any) => <StatusChip status={row.status} />,
      },
      {
        key: "employees",
        label: "Employees",
        render: (row: any) => {
          const memberIds = membersByCycle[row.id] || [];
          if (memberIds.length === 0) return "—";
          const employeeById = new Map(employees.map((e) => [e.id, e]));
          const members = memberIds.map(
            (id) => employeeById.get(id) || { id, label: id },
          );
          return (
            <AvatarGroup
              max={5}
              sx={{
                justifyContent: "flex-end",
                "& .MuiAvatar-root": { width: 28, height: 28, fontSize: 12 },
              }}
            >
              {members.map((m) => (
                <Tooltip key={m.id} title={m.label}>
                  <Avatar
                    alt={m.label}
                    src={m.photo}
                    sx={{ width: 28, height: 28 }}
                  />
                </Tooltip>
              ))}
            </AvatarGroup>
          );
        },
      },
      {
        key: "createdAt",
        label: "Created",
        render: (row: any) => dayjs(row.createdAt).format("DD MMM YYYY"),
      },
    ],
    [membersByCycle, employees],
  );

  const rowActions = useCallback(
    (row: any) => {
      const actions: {
        icon: JSX.Element;
        label: string;
        color: "primary" | "error";
        onClick: () => void;
      }[] = [
        {
          icon: <EditIcon sx={{ fontSize: 16 }} />,
          label: "Edit",
          color: "primary",
          onClick: () => openEditDialog(row),
        },
      ];
      if (row.status === "active") {
        actions.push({
          icon: <LockIcon sx={{ fontSize: 16 }} />,
          label: "Close",
          color: "primary" as const,
          onClick: () => handleCloseClick(row),
        });
      }
      actions.push({
        icon: <DeleteIcon sx={{ fontSize: 16 }} />,
        label: "Delete",
        color: "error" as const,
        onClick: () => handleDeleteClick(row),
      });
      return actions;
    },
    [openEditDialog, handleCloseClick, handleDeleteClick],
  );

  return (
    <ErrorBoundary fallback={<ErrorFallback />}>
      <Box sx={{ p: 2 }}>
        <DataList
          ariaLabel="Performance review cycles"
          data={cycles}
          columns={columns}
          actions={rowActions}
          loading={loading}
          emptyMessage="No review cycles found"
          toolbarActions={
            <Tooltip title="New Review Cycle">
              <span>
                <IconButton
                  color="primary"
                  size="small"
                  onClick={openCreateDialog}
                  aria-label="New review cycle"
                >
                  <AddIcon sx={{ fontSize: 20 }} />
                </IconButton>
              </span>
            </Tooltip>
          }
        />
      </Box>

      <Dialog
        open={open}
        onClose={closeDialog}
        maxWidth="sm"
        fullWidth
        disablePortal
      >
        <DialogTitle>
          {editingCycleId
            ? "Edit Performance Review Cycle"
            : "New Performance Review Cycle"}
        </DialogTitle>
        <DialogContent
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            pt: "16px !important",
          }}
        >
          <TextField
            label="Cycle Name"
            size="small"
            fullWidth
            placeholder="e.g. H1 2026 Annual Review"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <Box sx={{ display: "flex", gap: 2 }}>
            <div className="form-field-container" style={{ flex: 1 }}>
              <label
                htmlFor="periodStart"
                style={{
                  display: "block",
                  marginBottom: 4,
                  fontSize: "0.875rem",
                  fontWeight: 500,
                }}
              >
                Period Start
              </label>
              <Calendar
                inputId="periodStart"
                value={form.periodStart}
                onChange={(e) =>
                  setForm((f) => ({ ...f, periodStart: e.value as Date }))
                }
                dateFormat="dd/mm/yy"
                showIcon
                showButtonBar
                placeholder="Select date"
                appendTo={() =>
                  document.querySelector("#root .App") as HTMLElement
                }
                style={{ width: "100%" }}
              />
            </div>
            <div className="form-field-container" style={{ flex: 1 }}>
              <label
                htmlFor="periodEnd"
                style={{
                  display: "block",
                  marginBottom: 4,
                  fontSize: "0.875rem",
                  fontWeight: 500,
                }}
              >
                Period End
              </label>
              <Calendar
                inputId="periodEnd"
                value={form.periodEnd}
                onChange={(e) =>
                  setForm((f) => ({ ...f, periodEnd: e.value as Date }))
                }
                dateFormat="dd/mm/yy"
                showIcon
                showButtonBar
                minDate={form.periodStart ?? undefined}
                placeholder="Select date"
                appendTo={() =>
                  document.querySelector("#root .App") as HTMLElement
                }
                style={{ width: "100%" }}
              />
            </div>
          </Box>
          <TextField
            label="Rating Scale (1 to N)"
            type="number"
            size="small"
            fullWidth
            inputProps={{ min: 1, max: 10 }}
            value={form.ratingScale}
            onChange={(e) =>
              setForm((f) => ({ ...f, ratingScale: Number(e.target.value) }))
            }
          />
          <Autocomplete
            multiple
            size="small"
            options={employees}
            value={form.employees}
            isOptionEqualToValue={(o, v) => o.id === v.id}
            getOptionLabel={(o) => o.label}
            onChange={(_, value) =>
              setForm((f) => ({ ...f, employees: value }))
            }
            renderInput={(params) => (
              <TextField {...params} label="Employees in this cycle" />
            )}
          />
        </DialogContent>
        <DialogActions>
          <Button variant="ghost" onClick={closeDialog} size="small">
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            variant="primary"
            size="small"
            disabled={
              submitting ||
              !form.name ||
              !form.periodStart ||
              !form.periodEnd ||
              form.employees.length === 0
            }
            loading={submitting}
            loadingText={editingCycleId ? "Saving…" : "Creating…"}
          >
            {editingCycleId ? "Save" : "Create"}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmationDialog
        open={statusDialog.open}
        onClose={handleStatusCancel}
        onConfirm={handleStatusConfirm}
        title={
          statusDialog.action === "closed"
            ? "Close Review Cycle"
            : "Delete Review Cycle"
        }
        message={
          statusDialog.action === "closed"
            ? `Close "${statusDialog.row?.name}"? No further submissions will be accepted.`
            : `Delete "${statusDialog.row?.name}"?`
        }
        description={
          statusDialog.action === "deleted"
            ? "It will be removed from this list; existing reviews under it are kept."
            : undefined
        }
        confirmText={statusDialog.action === "closed" ? "Close" : "Delete"}
        cancelText="Cancel"
        loading={statusLoading}
        variant={statusDialog.action === "deleted" ? "danger" : "default"}
        theme={theme}
      />
    </ErrorBoundary>
  );
}

export default memo(PerformanceReviewCycles);
