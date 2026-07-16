import {
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import DataList from "@web/shared/components/DataList";
import useServerPagination from "@web/shared/hooks/useServerPagination";
import apiClient from "@web/core/http/axiosConfig";
import ErrorFallback from "@web/shared/components/ErrorFallback";
import { ErrorBoundary } from "react-error-boundary";
import ConfirmationDialog from "@web/shared/components/ConfirmationDialog";
import { AlertContext } from "@web/app/providers/AlertContext";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import { UserContext } from "@web/app/providers/UserContext";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import UndoIcon from "@mui/icons-material/Undo";
import BlockIcon from "@mui/icons-material/Block";
import AddIcon from "@mui/icons-material/Add";
import RestoreIcon from "@mui/icons-material/Restore";
import { API_ENDPOINTS } from "@web/shared/constants";
import hasPermission from "@web/shared/utils/permissions/hasPermission";
import { isHrOrAbove } from "@web/shared/utils/permissions/navAccess";
import useAssetCategoryOptions from "./useAssetCategoryOptions";
import { StatusChip } from "./asset-inventory/StatusChip";
import {
  CreateAssetDialog,
  type CreateAssetForm,
} from "./asset-inventory/CreateAssetDialog";
import {
  AssignAssetDialog,
  type AssignForm,
  type EmpOption,
} from "./asset-inventory/AssignAssetDialog";
import {
  ReturnAssetDialog,
  type ReturnForm,
} from "./asset-inventory/ReturnAssetDialog";

const EMPTY_CREATE_FORM: CreateAssetForm = {
  name: "",
  assetCode: "",
  category: "Laptop",
  notes: "",
  purchaseDate: "",
  purchaseValue: "",
};

const EMPTY_ASSIGN_FORM: AssignForm = {
  userId: "",
  conditionOut: "good",
  notes: "",
};

const EMPTY_RETURN_FORM: ReturnForm = { conditionIn: "good", notes: "" };

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
  const [createForm, setCreateForm] =
    useState<CreateAssetForm>(EMPTY_CREATE_FORM);
  const [assignForm, setAssignForm] = useState<AssignForm>(EMPTY_ASSIGN_FORM);
  const [returnForm, setReturnForm] = useState<ReturnForm>(EMPTY_RETURN_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [globalFilter, setGlobalFilter] = useState("");
  const searchRef = useRef("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [retireTarget, setRetireTarget] = useState<{
    id: string;
    code: string;
  } | null>(null);
  const [retireLoading, setRetireLoading] = useState(false);

  // Employee search for the assign dialog
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
    isHrOrAbove(user) ||
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
      setCreateForm(EMPTY_CREATE_FORM);
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
      setAssignForm(EMPTY_ASSIGN_FORM);
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
        setReturnForm(EMPTY_RETURN_FORM);
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
          onClick: () => setRetireTarget({ id: row.id, code: row.assetCode }),
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
    [isHr, handleMarkAvailable],
  );

  const handleRetireConfirm = useCallback(async () => {
    if (!retireTarget) return;
    setRetireLoading(true);
    try {
      await handleRetire(retireTarget.id);
      setRetireTarget(null);
    } finally {
      setRetireLoading(false);
    }
  }, [retireTarget, handleRetire]);

  const handleRetireCancel = useCallback(() => {
    if (retireLoading) return;
    setRetireTarget(null);
  }, [retireLoading]);

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

      <CreateAssetDialog
        open={openCreate}
        onClose={() => setOpenCreate(false)}
        form={createForm}
        setForm={setCreateForm}
        categoryOptions={categoryOptions}
        submitting={submitting}
        onSubmit={handleCreate}
      />

      <AssignAssetDialog
        open={!!openAssign}
        assetCode={openAssign?.code}
        onClose={() => {
          setOpenAssign(null);
          setAssignForm(EMPTY_ASSIGN_FORM);
          setEmpInputValue("");
          setEmpOptions([]);
        }}
        form={assignForm}
        setForm={setAssignForm}
        empOptions={empOptions}
        empInputValue={empInputValue}
        setEmpInputValue={setEmpInputValue}
        empSearching={empSearching}
        submitting={submitting}
        onSubmit={handleAssign}
      />

      <ReturnAssetDialog
        open={!!openReturn}
        assetCode={openReturn?.code}
        onClose={() => setOpenReturn(null)}
        form={returnForm}
        setForm={setReturnForm}
        submitting={submitting}
        onSubmit={() => openReturn && handleReturn(openReturn.id)}
      />

      <ConfirmationDialog
        open={!!retireTarget}
        onClose={handleRetireCancel}
        onConfirm={handleRetireConfirm}
        title="Retire Asset"
        message={`Are you sure you want to retire asset ${retireTarget?.code ?? ""}?`}
        description="This action cannot be undone."
        confirmText="Retire"
        loading={retireLoading}
        variant="danger"
      />
    </ErrorBoundary>
  );
}

export default memo(AssetInventory);
