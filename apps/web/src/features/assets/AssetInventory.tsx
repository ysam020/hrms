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
import { Calendar } from "primereact/calendar";
import DataList from "@web/shared/components/DataList";
import useServerPagination from "@web/shared/hooks/useServerPagination";
import apiClient from "@web/core/http/axiosConfig";
import ErrorFallback from "@web/shared/components/ErrorFallback";
import { ErrorBoundary } from "react-error-boundary";
import { AlertContext } from "@web/app/providers/AlertContext";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import { UserContext } from "@web/app/providers/UserContext";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Button from "@web/shared/components/Button";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Grid from "@mui/material/Grid";
import Autocomplete from "@mui/material/Autocomplete";
import CircularProgress from "@mui/material/CircularProgress";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import UndoIcon from "@mui/icons-material/Undo";
import BlockIcon from "@mui/icons-material/Block";
import AddIcon from "@mui/icons-material/Add";
import RestoreIcon from "@mui/icons-material/Restore";
import { API_ENDPOINTS } from "@web/shared/constants";
import hasPermission from "@web/shared/utils/permissions/hasPermission";
import useAssetCategoryOptions from "./useAssetCategoryOptions";

const STATUS_CFG: Record<string, { color: string; bg: string }> = {
  available: { color: "#059669", bg: "rgba(5,150,105,0.15)" },
  assigned: { color: "#6366f1", bg: "rgba(99,102,241,0.15)" },
  maintenance: { color: "#d97706", bg: "rgba(217,119,6,0.15)" },
  retired: { color: "#64748b", bg: "rgba(100,116,139,0.15)" },
};

function StatusChip({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.available;
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

function AssetInventory() {
  const { setAlert } = useContext(AlertContext);
  const { theme } = useContext(ThemeContext);
  const { user } = useContext(UserContext);
  const [openCreate, setOpenCreate] = useState(false);
  const [openAssign, setOpenAssign] = useState<{
    id: string;
    code: string;
  } | null>(null);
  const [openReturn, setOpenReturn] = useState<{
    id: string;
    code: string;
  } | null>(null);
  const [createForm, setCreateForm] = useState({
    name: "",
    assetCode: "",
    category: "Laptop",
    notes: "",
    purchaseDate: "",
    purchaseValue: "",
  });
  const [assignForm, setAssignForm] = useState({
    userId: "",
    conditionOut: "good",
    notes: "",
  });
  const [returnForm, setReturnForm] = useState({
    conditionIn: "good",
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [globalFilter, setGlobalFilter] = useState("");
  const searchRef = useRef("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Employee search for the assign dialog
  type EmpOption = { value: string; label: string };
  const [empOptions, setEmpOptions] = useState<EmpOption[]>([]);
  const [empInputValue, setEmpInputValue] = useState("");
  const [empSearching, setEmpSearching] = useState(false);
  const empDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!openAssign) return;
    if (empDebounceRef.current) clearTimeout(empDebounceRef.current);
    empDebounceRef.current = setTimeout(async () => {
      setEmpSearching(true);
      try {
        const params = empInputValue
          ? `?search=${encodeURIComponent(empInputValue)}&limit=20`
          : "?limit=20";
        const res = await apiClient.get(`/get-all-users${params}`);
        const users: any[] = Array.isArray(res.data?.data) ? res.data.data : [];
        setEmpOptions(
          users.map((u: any) => ({ value: u.id, label: u.username })),
        );
      } catch {
        setEmpOptions([]);
      } finally {
        setEmpSearching(false);
      }
    }, 300);
    return () => {
      if (empDebounceRef.current) clearTimeout(empDebounceRef.current);
    };
  }, [openAssign, empInputValue]);

  const isHr =
    ["owner", "admin", "hr"].includes(user?.tenantRole ?? "") ||
    hasPermission(
      "Assets",
      "manage",
      "-",
      user?.isSuperUser,
      user?.permissions || [],
    );

  const { options: categoryOptions, ensureAssetCategorySaved } =
    useAssetCategoryOptions();

  const fetchAssets = useCallback(
    async ({ page, limit }) => {
      try {
        const search = searchRef.current;
        const params = search ? `&search=${encodeURIComponent(search)}` : "";
        const res = await apiClient(API_ENDPOINTS.ASSETS(page, limit, params));
        return {
          data: res.data.data?.assets || res.data.data || [],
          totalCount: res.data.data?.total || 0,
        };
      } catch (err) {
        if (err?.code === "ERR_CANCELED" || err?.name === "CanceledError")
          throw err;
        setAlert({
          open: true,
          message: "Failed to fetch assets",
          severity: "error",
        });
        throw err;
      }
    },
    [setAlert],
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
  } = useServerPagination(fetchAssets, { initialPageSize: 10 });

  const handleGlobalFilterChange = useCallback(
    (value: string) => {
      searchRef.current = value ?? "";
      setGlobalFilter(value ?? "");
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => resetPagination(), 400);
    },
    [resetPagination],
  );

  const handleCreate = useCallback(async () => {
    setSubmitting(true);
    try {
      // Best-effort — see useAssetCategoryOptions for why failures are swallowed.
      void ensureAssetCategorySaved(createForm.category);
      await apiClient.post(API_ENDPOINTS.CREATE_ASSET, {
        ...createForm,
        purchaseValue: createForm.purchaseValue
          ? Number(createForm.purchaseValue)
          : undefined,
      });
      refresh();
      setOpenCreate(false);
      setCreateForm({
        name: "",
        assetCode: "",
        category: "Laptop",
        notes: "",
        purchaseDate: "",
        purchaseValue: "",
      });
      setAlert({ open: true, message: "Asset created", severity: "success" });
    } catch (err) {
      setAlert({
        open: true,
        message: err?.response?.data?.message || "Failed to create asset",
        severity: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }, [createForm, refresh, setAlert, ensureAssetCategorySaved]);

  const handleAssign = useCallback(async () => {
    if (!openAssign) return;
    setSubmitting(true);
    try {
      await apiClient.post(API_ENDPOINTS.ASSIGN_ASSET, {
        assetId: openAssign.id,
        ...assignForm,
      });
      refresh();
      setOpenAssign(null);
      setAssignForm({ userId: "", conditionOut: "good", notes: "" });
      setEmpInputValue("");
      setEmpOptions([]);
      setAlert({ open: true, message: "Asset assigned", severity: "success" });
    } catch (err) {
      setAlert({
        open: true,
        message: err?.response?.data?.message || "Failed to assign asset",
        severity: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }, [openAssign, assignForm, refresh, setAlert]);

  const handleReturn = useCallback(
    async (assetId: string) => {
      if (!openReturn) return;
      setSubmitting(true);
      try {
        await apiClient.post(API_ENDPOINTS.RETURN_ASSET, {
          assetId,
          ...returnForm,
        });
        refresh();
        setOpenReturn(null);
        setReturnForm({ conditionIn: "good", notes: "" });
        setAlert({
          open: true,
          message: "Asset returned",
          severity: "success",
        });
      } catch (err) {
        setAlert({
          open: true,
          message: err?.response?.data?.message || "Failed to return asset",
          severity: "error",
        });
      } finally {
        setSubmitting(false);
      }
    },
    [openReturn, returnForm, refresh, setAlert],
  );

  const handleRetire = useCallback(
    async (assetId: string) => {
      try {
        await apiClient.post(API_ENDPOINTS.RETIRE_ASSET(assetId));
        refresh();
        setAlert({ open: true, message: "Asset retired", severity: "success" });
      } catch (err) {
        setAlert({
          open: true,
          message: err?.response?.data?.message || "Failed to retire asset",
          severity: "error",
        });
      }
    },
    [refresh, setAlert],
  );

  // Brings a maintenance asset back into circulation once it's fixed —
  // retirement is deliberately terminal, so this excludes "retired" assets.
  const handleMarkAvailable = useCallback(
    async (assetId: string) => {
      try {
        await apiClient.patch(API_ENDPOINTS.UPDATE_ASSET(assetId), {
          status: "available",
        });
        refresh();
        setAlert({
          open: true,
          message: "Asset marked available",
          severity: "success",
        });
      } catch (err) {
        setAlert({
          open: true,
          message:
            err?.response?.data?.message || "Failed to update asset status",
          severity: "error",
        });
      }
    },
    [refresh, setAlert],
  );

  const conditionOptions = [
    { value: "good", label: "Good" },
    { value: "fair", label: "Fair" },
    { value: "damaged", label: "Damaged" },
  ];

  const columns = useMemo(
    () => [
      {
        key: "assetCode",
        label: "Asset Code",
        primary: true,
        hideLabel: true,
        render: (row: any) => (
          <Typography
            variant="body2"
            fontSize="0.8rem"
            fontWeight={600}
            sx={{ fontFamily: "monospace" }}
          >
            {row.assetCode}
          </Typography>
        ),
      },
      { key: "name", label: "Name" },
      { key: "category", label: "Category" },
      {
        key: "status",
        label: "Status",
        hideLabel: true,
        render: (row: any) => <StatusChip status={row.status} />,
      },
      {
        key: "currentHolder",
        label: "Assigned To",
        render: (row: any) => {
          const holder = row.currentHolder;
          if (!holder) return "—";
          const fullName =
            `${holder.first_name ?? ""} ${holder.last_name ?? ""}`.trim();
          return fullName || holder.username || "—";
        },
      },
    ],
    [],
  );

  const rowActions = useCallback(
    (row: any) => {
      if (!isHr) return [];
      const actions: any[] = [];
      if (row.status === "available") {
        actions.push({
          icon: <PersonAddIcon sx={{ fontSize: 16 }} />,
          label: "Assign",
          color: "primary" as const,
          onClick: () => setOpenAssign({ id: row.id, code: row.assetCode }),
        });
      }
      if (row.status === "assigned") {
        actions.push({
          icon: <UndoIcon sx={{ fontSize: 16 }} />,
          label: "Return",
          color: "warning" as const,
          onClick: () => setOpenReturn({ id: row.id, code: row.assetCode }),
        });
      }
      if (["available", "maintenance"].includes(row.status)) {
        actions.push({
          icon: <BlockIcon sx={{ fontSize: 16 }} />,
          label: "Retire",
          color: "error" as const,
          onClick: () => handleRetire(row.id),
        });
      }
      if (row.status === "maintenance") {
        actions.push({
          icon: <RestoreIcon sx={{ fontSize: 16 }} />,
          label: "Mark Available",
          color: "success" as const,
          onClick: () => handleMarkAvailable(row.id),
        });
      }
      return actions;
    },
    [isHr, handleRetire, handleMarkAvailable],
  );

  return (
    <ErrorBoundary fallback={<ErrorFallback />}>
      <DataList
        ariaLabel="Assets"
        data={data || []}
        columns={columns}
        actions={rowActions}
        loading={loading}
        emptyMessage="No assets found"
        search={{
          value: globalFilter,
          onChange: handleGlobalFilterChange,
          placeholder: "Search assets…",
        }}
        toolbarActions={
          isHr ? (
            <Tooltip title="Add Asset">
              <span>
                <IconButton
                  color="primary"
                  size="small"
                  onClick={() => setOpenCreate(true)}
                  aria-label="Add asset"
                >
                  <AddIcon sx={{ fontSize: 20 }} />
                </IconButton>
              </span>
            </Tooltip>
          ) : undefined
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

      {/* Create Asset Dialog */}
      <Dialog
        open={openCreate}
        onClose={() => setOpenCreate(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Add New Asset</DialogTitle>
        <DialogContent sx={{ pt: "16px !important" }}>
          <Grid container spacing={2}>
            <Grid item xs={6}>
              <TextField
                label="Asset Name"
                size="small"
                fullWidth
                value={createForm.name}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, name: e.target.value }))
                }
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                label="Asset Code"
                size="small"
                fullWidth
                placeholder="e.g. LPT-001"
                value={createForm.assetCode}
                onChange={(e) =>
                  setCreateForm((f) => ({
                    ...f,
                    assetCode: e.target.value.toUpperCase(),
                  }))
                }
              />
            </Grid>
            <Grid item xs={6}>
              <Autocomplete
                freeSolo
                options={categoryOptions}
                value={createForm.category}
                onChange={(_, newValue) =>
                  setCreateForm((f) => ({ ...f, category: newValue ?? "" }))
                }
                onInputChange={(_, newInputValue) =>
                  setCreateForm((f) => ({ ...f, category: newInputValue }))
                }
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Category"
                    size="small"
                    fullWidth
                    helperText="Pick an existing category or type a new one"
                  />
                )}
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                label="Purchase Cost (₹)"
                size="small"
                type="number"
                fullWidth
                value={createForm.purchaseValue}
                onChange={(e) =>
                  setCreateForm((f) => ({
                    ...f,
                    purchaseValue: e.target.value,
                  }))
                }
              />
            </Grid>
            <Grid item xs={6}>
              <Box>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: "block", mb: 0.5 }}
                >
                  Purchase Date
                </Typography>
                <Calendar
                  value={
                    createForm.purchaseDate
                      ? new Date(createForm.purchaseDate + "T00:00:00")
                      : null
                  }
                  onChange={(e) =>
                    setCreateForm((f) => ({
                      ...f,
                      purchaseDate: e.value
                        ? dayjs(e.value as Date).format("YYYY-MM-DD")
                        : "",
                    }))
                  }
                  dateFormat="dd/mm/yy"
                  maxDate={new Date()}
                  showIcon
                  showButtonBar
                  appendTo={document.body}
                  placeholder="Select date"
                  style={{ width: "100%" }}
                />
              </Box>
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Description"
                size="small"
                multiline
                rows={2}
                fullWidth
                value={createForm.notes}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, notes: e.target.value }))
                }
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button
            variant="ghost"
            onClick={() => setOpenCreate(false)}
            size="small"
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            variant="primary"
            size="small"
            disabled={submitting || !createForm.name || !createForm.assetCode}
          >
            {submitting ? "Creating…" : "Create"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Assign Dialog */}
      <Dialog
        open={!!openAssign}
        onClose={() => {
          setOpenAssign(null);
          setAssignForm({ userId: "", conditionOut: "good", notes: "" });
          setEmpInputValue("");
          setEmpOptions([]);
        }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Assign Asset {openAssign?.code}</DialogTitle>
        <DialogContent
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            pt: "16px !important",
          }}
        >
          <Autocomplete
            options={empOptions}
            getOptionLabel={(o) => o.label}
            inputValue={empInputValue}
            onInputChange={(_, v) => setEmpInputValue(v)}
            onChange={(_, selected) =>
              setAssignForm((f) => ({ ...f, userId: selected?.value ?? "" }))
            }
            loading={empSearching}
            filterOptions={(x) => x} // server already filters
            isOptionEqualToValue={(o, v) => o.value === v.value}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Employee"
                size="small"
                placeholder="Search by username…"
                InputProps={{
                  ...params.InputProps,
                  endAdornment: (
                    <>
                      {empSearching ? <CircularProgress size={16} /> : null}
                      {params.InputProps.endAdornment}
                    </>
                  ),
                }}
              />
            )}
          />
          <TextField
            select
            label="Condition Out"
            size="small"
            fullWidth
            value={assignForm.conditionOut}
            onChange={(e) =>
              setAssignForm((f) => ({ ...f, conditionOut: e.target.value }))
            }
          >
            {conditionOptions.map((c) => (
              <MenuItem key={c.value} value={c.value}>
                {c.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Notes"
            size="small"
            multiline
            rows={2}
            fullWidth
            value={assignForm.notes}
            onChange={(e) =>
              setAssignForm((f) => ({ ...f, notes: e.target.value }))
            }
          />
        </DialogContent>
        <DialogActions>
          <Button
            variant="ghost"
            onClick={() => {
              setOpenAssign(null);
              setAssignForm({ userId: "", conditionOut: "good", notes: "" });
              setEmpInputValue("");
              setEmpOptions([]);
            }}
            size="small"
          >
            Cancel
          </Button>
          <Button
            onClick={handleAssign}
            variant="primary"
            size="small"
            disabled={submitting || !assignForm.userId}
          >
            {submitting ? "Assigning…" : "Assign"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Return Dialog */}
      <Dialog
        open={!!openReturn}
        onClose={() => setOpenReturn(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Return Asset {openReturn?.code}</DialogTitle>
        <DialogContent
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            pt: "16px !important",
          }}
        >
          <TextField
            select
            label="Condition In"
            size="small"
            fullWidth
            value={returnForm.conditionIn}
            onChange={(e) =>
              setReturnForm((f) => ({ ...f, conditionIn: e.target.value }))
            }
          >
            {conditionOptions.map((c) => (
              <MenuItem key={c.value} value={c.value}>
                {c.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Notes"
            size="small"
            multiline
            rows={2}
            fullWidth
            value={returnForm.notes}
            onChange={(e) =>
              setReturnForm((f) => ({ ...f, notes: e.target.value }))
            }
          />
        </DialogContent>
        <DialogActions>
          <Button
            variant="ghost"
            onClick={() => setOpenReturn(null)}
            size="small"
          >
            Cancel
          </Button>
          <Button
            onClick={() => openReturn && handleReturn(openReturn.id)}
            variant="primary"
            size="small"
            disabled={submitting}
          >
            {submitting ? "Processing…" : "Return"}
          </Button>
        </DialogActions>
      </Dialog>
    </ErrorBoundary>
  );
}

export default memo(AssetInventory);
