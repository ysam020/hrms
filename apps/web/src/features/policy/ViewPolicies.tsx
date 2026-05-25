import { memo, useCallback, useContext, useMemo, useState } from "react";
import DOMPurify from "dompurify";
import {
  MaterialReactTable,
  useMaterialReactTable,
} from "material-react-table";
import useTableConfig from "@web/shared/hooks/useTableConfig";
import useServerPagination from "@web/shared/hooks/useServerPagination";
import apiClient from "@web/core/http/axiosConfig";
import { AlertContext } from "@web/app/providers/AlertContext";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import { UserContext } from "@web/app/providers/UserContext";
import hasPermission from "@web/shared/utils/permissions/hasPermission";
import CustomModal from "@web/shared/components/Modal";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Chip from "@mui/material/Chip";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Divider from "@mui/material/Divider";
import Avatar from "@mui/material/Avatar";
import Stack from "@mui/material/Stack";
import Skeleton from "@mui/material/Skeleton";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import CircularProgress from "@mui/material/CircularProgress";
import VisibilityIcon from "@mui/icons-material/Visibility";
import DownloadIcon from "@mui/icons-material/Download";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import CloseIcon from "@mui/icons-material/Close";
import PolicyOutlinedIcon from "@mui/icons-material/PolicyOutlined";
import { Editor } from "primereact/editor";
import { API_ENDPOINTS } from "@web/shared/constants";
import ConfirmationDialog from "@web/shared/components/ConfirmationDialog";

const POLICY_TYPES = [
  "POSH Policy",
  "Advance Salary Policy",
  "Code of Conduct",
  "Leave Policy",
  "Other",
];

const POLICY_TYPE_COLORS = {
  "POSH Policy": "error",
  "Advance Salary Policy": "warning",
  "Code of Conduct": "info",
  "Leave Policy": "primary",
  Other: "default",
};

const fmt = (date) =>
  date
    ? new Date(date).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";

function MetaItem({ label, value }) {
  return (
    <Box sx={{ display: "flex", gap: 0.5 }}>
      <Typography variant="caption" color="text.disabled">
        {label}:
      </Typography>
      <Typography variant="caption" color="text.secondary" fontWeight={500}>
        {value || "—"}
      </Typography>
    </Box>
  );
}

function PolicyViewer({ policy, onClose, theme }) {
  return (
    <CustomModal
      open={!!policy}
      handleClose={onClose}
      modalStyle={{
        width: { xs: "95%", sm: 620, md: 720 },
        overflow: "hidden",
      }}
      disablePortal
      fadeTimeout={300}
      paperProps={{
        elevation: 24,
        sx: {
          boxShadow:
            theme === "light"
              ? "0 25px 50px -12px rgba(0,0,0,0.25)"
              : "0 25px 50px -12px rgba(0,0,0,0.6)",
          border:
            theme === "light"
              ? "1px solid rgba(0,0,0,0.05)"
              : "1px solid rgba(255,255,255,0.1)",
        },
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          p: 2.5,
          pb: 2,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Avatar sx={{ width: 40, height: 40, bgcolor: "primary.main" }}>
            <PolicyOutlinedIcon fontSize="small" />
          </Avatar>
          <Box>
            <Typography
              variant="h6"
              fontWeight={600}
              sx={{ fontSize: "1.1rem", mb: 0.25 }}
            >
              {policy?.title || policy?.category}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Praesto — Office Policy
            </Typography>
          </Box>
        </Box>
        <IconButton
          onClick={onClose}
          size="small"
          sx={{
            color: "text.secondary",
            "&:hover": { bgcolor: "action.hover" },
          }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      <Divider />

      <Box
        sx={{
          maxHeight: "52vh",
          overflow: "auto",
          px: 2.5,
          py: 2,
          "& p": { my: 0.5 },
          "& h1,& h2,& h3": { mt: 1.5, mb: 0.5 },
          "& ul,& ol": { pl: 2.5 },
          fontSize: "0.9rem",
          lineHeight: 1.75,
          color: "text.primary",
        }}
        dangerouslySetInnerHTML={{
          __html: DOMPurify.sanitize(policy?.content || ""),
        }}
      />

      <Box
        sx={{
          px: 2.5,
          py: 1.25,
          borderTop: "1px solid",
          borderColor: "divider",
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 1,
        }}
      >
        <Stack direction="row" spacing={2} flexWrap="wrap">
          <MetaItem label="Created at" value={fmt(policy?.createdAt)} />
          <MetaItem label="Updated at" value={fmt(policy?.updatedAt)} />
        </Stack>
        <Typography
          variant="caption"
          color="text.disabled"
          sx={{ fontStyle: "italic" }}
        >
          Confidential
        </Typography>
      </Box>
    </CustomModal>
  );
}

function EditPolicyModal({ policy, onClose, onSaved, theme }) {
  const { setAlert } = useContext(AlertContext);
  const [policyType, setPolicyType] = useState(policy?.category || "");
  const [policyName, setPolicyName] = useState(policy?.title || "");
  const [content, setContent] = useState(policy?.content || "");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{
    policyType?: string;
    policyName?: string;
    content?: string;
  }>({});

  const validate = () => {
    const e: { policyType?: string; policyName?: string; content?: string } =
      {};
    if (!policyType) e.policyType = "Required";
    if (policyType === "Other" && !policyName.trim()) e.policyName = "Required";
    if (
      !content ||
      DOMPurify.sanitize(content, { ALLOWED_TAGS: [] }).trim().length < 10
    )
      e.content = "Content must be at least 10 characters";
    return e;
  };

  const handleSave = async () => {
    const ve = validate();
    if (Object.keys(ve).length) {
      setErrors(ve);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const payload: {
        policyType: string;
        content: string;
        policyName?: string;
      } = { policyType, content };
      if (policyType === "Other") payload.policyName = policyName.trim();
      const res = await apiClient.put(
        API_ENDPOINTS.UPDATE_POLICY(policy.id),
        payload,
      );
      setAlert({ open: true, message: res.data.message, severity: "success" });
      onSaved();
      onClose();
    } catch (err) {
      setAlert({
        open: true,
        message: err.response?.data?.message || "Failed to update policy",
        severity: "error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <CustomModal
      open={!!policy}
      handleClose={onClose}
      modalStyle={{
        width: { xs: "95%", sm: 680, md: 760 },
        overflow: "hidden",
      }}
      disablePortal
      fadeTimeout={300}
      paperProps={{
        elevation: 24,
        sx: {
          boxShadow:
            theme === "light"
              ? "0 25px 50px -12px rgba(0,0,0,0.25)"
              : "0 25px 50px -12px rgba(0,0,0,0.6)",
          border:
            theme === "light"
              ? "1px solid rgba(0,0,0,0.05)"
              : "1px solid rgba(255,255,255,0.1)",
        },
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          p: 2.5,
          pb: 2,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Avatar sx={{ width: 40, height: 40, bgcolor: "warning.main" }}>
            <EditIcon fontSize="small" />
          </Avatar>
          <Box>
            <Typography
              variant="h6"
              fontWeight={600}
              sx={{ fontSize: "1.1rem", mb: 0.25 }}
            >
              Edit Policy
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {policy?.title || policy?.category}
            </Typography>
          </Box>
        </Box>
        <IconButton
          onClick={onClose}
          size="small"
          sx={{
            color: "text.secondary",
            "&:hover": { bgcolor: "action.hover" },
          }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      <Divider />

      <Box sx={{ px: 2.5, pt: 2, pb: 1 }}>
        <Box sx={{ display: "flex", gap: 1.5, mb: 2 }}>
          <TextField
            select
            size="small"
            label="Policy Type"
            value={policyType}
            onChange={(e) => {
              setPolicyType(e.target.value);
              setPolicyName("");
            }}
            error={!!errors.policyType}
            helperText={errors.policyType}
            sx={{ flex: policyType === "Other" ? 1 : "unset", minWidth: 180 }}
          >
            {POLICY_TYPES.map((t) => (
              <MenuItem key={t} value={t}>
                {t}
              </MenuItem>
            ))}
          </TextField>
          {policyType === "Other" && (
            <TextField
              size="small"
              label="Policy Name"
              value={policyName}
              onChange={(e) => setPolicyName(e.target.value)}
              error={!!errors.policyName}
              helperText={errors.policyName}
              sx={{ flex: 1 }}
            />
          )}
        </Box>

        <Box
          sx={{
            "& .p-editor-container": { borderRadius: 1 },
            "& .p-editor-content": { minHeight: 280 },
            mb: 1,
          }}
        >
          <Editor
            value={content}
            onTextChange={(e) => setContent(e.htmlValue || "")}
            style={{ height: "280px" }}
          />
        </Box>
        {errors.content && (
          <Typography variant="caption" color="error" display="block" mb={1}>
            {errors.content}
          </Typography>
        )}
      </Box>

      <Divider />

      <Box
        sx={{
          display: "flex",
          justifyContent: "flex-end",
          gap: 1,
          px: 2.5,
          py: 1.5,
        }}
      >
        <IconButton
          size="small"
          onClick={onClose}
          sx={{ color: "text.secondary" }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
        <Box
          component="button"
          onClick={handleSave}
          disabled={submitting}
          sx={{
            px: 3,
            py: 0.75,
            bgcolor: "warning.main",
            color: "white",
            border: "none",
            borderRadius: 1,
            fontWeight: 600,
            fontSize: "0.875rem",
            cursor: submitting ? "not-allowed" : "pointer",
            opacity: submitting ? 0.7 : 1,
            display: "flex",
            alignItems: "center",
            gap: 0.75,
            "&:hover": { bgcolor: "warning.dark" },
          }}
        >
          {submitting && <CircularProgress size={14} color="inherit" />}
          {submitting ? "Saving…" : "Save Changes"}
        </Box>
      </Box>
    </CustomModal>
  );
}

function ViewPolicies({ refreshKey = 0 }) {
  const { setAlert } = useContext(AlertContext);
  const { theme } = useContext(ThemeContext);
  const { user } = useContext(UserContext);
  const [viewPolicy, setViewPolicy] = useState(null);
  const [editPolicy, setEditPolicy] = useState(null);
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; row: any }>(
    { open: false, row: null },
  );
  const [deleteLoading, setDeleteLoading] = useState(false);

  const canDelete = hasPermission(
    "Policy",
    "delete",
    "-",
    user?.isSuperUser,
    user?.permissions || [],
  );
  const canUpdate = hasPermission(
    "Policy",
    "update",
    "-",
    user?.isSuperUser,
    user?.permissions || [],
  );

  const fetchPolicies = useCallback(async ({ page, limit }) => {
    const response = await apiClient.get(
      API_ENDPOINTS.GET_POLICIES(page, limit),
    );
    const list = Array.isArray(response.data.data)
      ? response.data.data
      : response.data.data?.policies || [];
    return {
      data: list,
      totalCount: response.data.total ?? list.length,
    };
  }, []);

  const { data, totalCount, loading, pagination, setPagination, refresh } =
    useServerPagination(fetchPolicies, { deps: [refreshKey] });

  const handleDownload = async (row) => {
    try {
      const response = await apiClient.get(
        API_ENDPOINTS.DOWNLOAD_POLICY_PDF(row.id),
        { responseType: "blob" },
      );
      const url = window.URL.createObjectURL(
        new Blob([response.data], { type: "application/pdf" }),
      );
      const link = document.createElement("a");
      link.href = url;
      const name = row.title || row.category;
      link.download = `${name.replace(/\s+/g, "_")}.pdf`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch {
      setAlert({
        open: true,
        message: "Failed to download PDF",
        severity: "error",
      });
    }
  };

  const handleDeleteClick = (row) => {
    setDeleteDialog({ open: true, row });
  };

  const handleDeleteCancel = () => {
    setDeleteDialog({ open: false, row: null });
  };

  const handleDeleteConfirm = async () => {
    setDeleteLoading(true);
    try {
      const res = await apiClient.delete(
        API_ENDPOINTS.DELETE_POLICY(deleteDialog.row.id),
      );
      setAlert({ open: true, message: res.data.message, severity: "success" });
      refresh();
      setDeleteDialog({ open: false, row: null });
    } catch (err) {
      setAlert({
        open: true,
        message: err.response?.data?.message || "Failed to delete policy",
        severity: "error",
      });
    } finally {
      setDeleteLoading(false);
    }
  };

  const columns = useMemo(
    () => [
      {
        accessorKey: "category",
        header: "Policy",
        size: 220,
        Cell: ({ row }) => (
          <Box>
            <Chip
              label={row.original.category}
              color={POLICY_TYPE_COLORS[row.original.category] || "default"}
              size="small"
              variant="outlined"
            />
            {row.original.title && (
              <Typography
                variant="caption"
                display="block"
                color="text.secondary"
                sx={{ mt: 0.25 }}
              >
                {row.original.title}
              </Typography>
            )}
          </Box>
        ),
      },
      {
        accessorKey: "createdAt",
        header: "Created At",
        size: 130,
        Cell: ({ cell }) => fmt(cell.getValue()),
      },
      {
        accessorKey: "updatedAt",
        header: "Last Updated",
        size: 130,
        Cell: ({ cell }) => fmt(cell.getValue()),
      },
    ],
    [],
  );

  const { table: tableConfig } = useTableConfig(data || [], columns, loading);

  const table = useMaterialReactTable({
    ...tableConfig,
    columns,
    data: data || [],
    rowCount: totalCount,
    state: { pagination, isLoading: loading },
    onPaginationChange: setPagination,
    manualPagination: true,
    enableRowActions: true,
    positionActionsColumn: "last",
    renderRowActions: ({ row }) => (
      <Box display="flex" gap={0.5}>
        <Tooltip title="View">
          <IconButton size="small" onClick={() => setViewPolicy(row.original)}>
            <VisibilityIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Download PDF">
          <IconButton size="small" onClick={() => handleDownload(row.original)}>
            <DownloadIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        {canUpdate && (
          <Tooltip title="Edit">
            <IconButton
              size="small"
              color="warning"
              onClick={() => setEditPolicy(row.original)}
            >
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        {canDelete && (
          <Tooltip title="Delete">
            <IconButton
              size="small"
              color="error"
              onClick={() => handleDeleteClick(row.original)}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>
    ),
    renderTopToolbarCustomActions: () =>
      loading ? <Skeleton width={120} height={32} /> : null,
  });

  return (
    <>
      <MaterialReactTable table={table} />
      <PolicyViewer
        policy={viewPolicy}
        onClose={() => setViewPolicy(null)}
        theme={theme}
      />
      {editPolicy && (
        <EditPolicyModal
          policy={editPolicy}
          onClose={() => setEditPolicy(null)}
          onSaved={refresh}
          theme={theme}
        />
      )}
      <ConfirmationDialog
        open={deleteDialog.open}
        onClose={handleDeleteCancel}
        onConfirm={handleDeleteConfirm}
        title="Delete Policy"
        message={`Are you sure you want to delete "${deleteDialog.row?.title || deleteDialog.row?.category}"?`}
        description="This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        loading={deleteLoading}
        variant="danger"
        theme={theme}
      />
    </>
  );
}

export default memo(ViewPolicies);
