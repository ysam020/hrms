import { useContext, useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Button from "@web/shared/components/Button";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import Grid from "@mui/material/Grid2";
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import VerifiedUserIcon from "@mui/icons-material/VerifiedUser";
import SaveIcon from "@mui/icons-material/Save";
import SlideUpTransition from "@web/shared/components/SlideUpTransition";
import ConfirmationDialog from "@web/shared/components/ConfirmationDialog";
import apiClient from "@web/core/http/axiosConfig";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import { API_ENDPOINTS } from "@web/shared/constants";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PipelineStage {
  order: number;
  name: string;
  interviewerRole: string;
  outcomeOptions: string[];
  isBgvStage: boolean;
  bgvVendor?: string;
}

interface PipelineTemplate {
  id: string;
  name: string;
  isDefault: boolean;
  isActive: boolean;
  stages: PipelineStage[];
}

function emptyStage(order: number): PipelineStage {
  return {
    order,
    name: "",
    interviewerRole: "",
    outcomeOptions: ["pass", "fail", "hold"],
    isBgvStage: false,
  };
}

const DEFAULT_TEMPLATE_STAGES: PipelineStage[] = [
  {
    order: 1,
    name: "Screening Call",
    interviewerRole: "HR",
    outcomeOptions: ["pass", "fail", "hold"],
    isBgvStage: false,
  },
  {
    order: 2,
    name: "Technical Round",
    interviewerRole: "Hiring Manager",
    outcomeOptions: ["pass", "fail", "hold"],
    isBgvStage: false,
  },
  {
    order: 3,
    name: "HR / Salary Discussion",
    interviewerRole: "HR",
    outcomeOptions: ["pass", "fail", "hold"],
    isBgvStage: false,
  },
];

export default function RecruitmentPipelineSettings() {
  const { setAlert } = useContext(AlertContext);
  const { user } = useContext(UserContext);
  const canEdit =
    user?.isSuperUser ||
    ["owner", "admin", "hr"].includes(user?.tenantRole ?? "") ||
    user?.permissions?.includes("Organisation:edit_organisation_settings");

  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<PipelineTemplate[]>([]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PipelineTemplate | null>(null);
  const [name, setName] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [stages, setStages] = useState<PipelineStage[]>(
    DEFAULT_TEMPLATE_STAGES,
  );
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PipelineTemplate | null>(
    null,
  );

  async function fetchAll() {
    setLoading(true);
    try {
      const res = await apiClient.get(
        API_ENDPOINTS.LIST_INTERVIEW_PIPELINE_TEMPLATES,
      );
      setTemplates(res.data?.data ?? []);
    } catch (err: any) {
      setAlert({
        open: true,
        message:
          err?.response?.data?.message ?? "Failed to load interview pipelines.",
        severity: "error",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openAdd() {
    setEditing(null);
    setName("");
    setIsDefault(templates.length === 0);
    setStages(DEFAULT_TEMPLATE_STAGES.map((s) => ({ ...s })));
    setDialogOpen(true);
  }
  function openEdit(t: PipelineTemplate) {
    setEditing(t);
    setName(t.name);
    setIsDefault(t.isDefault);
    setStages(t.stages.map((s) => ({ ...s })));
    setDialogOpen(true);
  }

  function addStage() {
    setStages((s) => [...s, emptyStage(s.length + 1)]);
  }
  function updateStage(idx: number, patch: Partial<PipelineStage>) {
    setStages((s) => s.map((st, i) => (i === idx ? { ...st, ...patch } : st)));
  }
  function removeStage(idx: number) {
    setStages((s) =>
      s.filter((_, i) => i !== idx).map((st, i) => ({ ...st, order: i + 1 })),
    );
  }

  async function save() {
    setSaving(true);
    try {
      const payload = {
        name,
        isDefault,
        stages: stages.map((s, i) => ({ ...s, order: i + 1 })),
      };
      if (editing) {
        await apiClient.put(
          API_ENDPOINTS.UPDATE_INTERVIEW_PIPELINE_TEMPLATE(editing.id),
          payload,
        );
      } else {
        await apiClient.post(
          API_ENDPOINTS.CREATE_INTERVIEW_PIPELINE_TEMPLATE,
          payload,
        );
      }
      setAlert({
        open: true,
        message: editing ? "Pipeline updated." : "Pipeline created.",
        severity: "success",
      });
      setDialogOpen(false);
      await fetchAll();
    } catch (err: any) {
      setAlert({
        open: true,
        message: err?.response?.data?.message ?? "Failed to save pipeline.",
        severity: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  async function setDefault(t: PipelineTemplate) {
    try {
      await apiClient.put(
        API_ENDPOINTS.UPDATE_INTERVIEW_PIPELINE_TEMPLATE(t.id),
        { isDefault: true },
      );
      await fetchAll();
    } catch (err: any) {
      setAlert({
        open: true,
        message: err?.response?.data?.message ?? "Failed to set default.",
        severity: "error",
      });
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await apiClient.delete(
        API_ENDPOINTS.DELETE_INTERVIEW_PIPELINE_TEMPLATE(deleteTarget.id),
      );
      setAlert({ open: true, message: "Pipeline removed.", severity: "info" });
      setDeleteTarget(null);
      await fetchAll();
    } catch (err: any) {
      setAlert({
        open: true,
        message: err?.response?.data?.message ?? "Failed to remove pipeline.",
        severity: "error",
      });
    }
  }

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  return (
    <Box>
      <Box
        sx={{
          mb: 3,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 2,
          flexWrap: "wrap",
        }}
      >
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ maxWidth: 640 }}
        >
          Define how many interview rounds a job goes through, who owns each
          one, and whether it includes a background-verification step. A
          standard 3-round pipeline is ready to use — customize it, or add more
          for roles with a different process (e.g. a single HR call for
          interns).
        </Typography>
        {canEdit && (
          <Button
            variant="primary"
            size="small"
            icon={<AddCircleOutlineIcon />}
            onClick={openAdd}
          >
            Add pipeline
          </Button>
        )}
      </Box>

      {!canEdit && (
        <Alert severity="info" sx={{ mb: 2 }}>
          You have read-only access. Contact an owner, admin, or HR to make
          changes.
        </Alert>
      )}

      {templates.length === 0 ? (
        <Alert severity="info">
          No pipelines configured yet — add your first one above.
        </Alert>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {templates.map((t) => (
            <Paper key={t.id} variant="outlined" sx={{ p: 2.5 }}>
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  flexWrap: "wrap",
                  gap: 1,
                }}
              >
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Typography variant="subtitle1" fontWeight={600}>
                    {t.name}
                  </Typography>
                  {t.isDefault && (
                    <Chip size="small" label="Default" color="primary" />
                  )}
                  {!t.isActive && <Chip size="small" label="Inactive" />}
                </Box>
                {canEdit && (
                  <Box>
                    {!t.isDefault && (
                      <Button
                        variant="ghost"
                        size="small"
                        onClick={() => setDefault(t)}
                        style={{ marginRight: 8 }}
                      >
                        Set as default
                      </Button>
                    )}
                    <Tooltip title="Edit">
                      <IconButton size="small" onClick={() => openEdit(t)}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Remove">
                      <IconButton
                        size="small"
                        onClick={() => setDeleteTarget(t)}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                )}
              </Box>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 1.5 }}>
                {t.stages
                  .slice()
                  .sort((a, b) => a.order - b.order)
                  .map((s) => (
                    <Chip
                      key={s.order}
                      size="small"
                      variant="outlined"
                      icon={
                        s.isBgvStage ? (
                          <VerifiedUserIcon fontSize="small" />
                        ) : undefined
                      }
                      label={`${s.order}. ${s.name}${s.interviewerRole ? ` (${s.interviewerRole})` : ""}`}
                    />
                  ))}
              </Box>
            </Paper>
          ))}
        </Box>
      )}

      {/* ── Template editor dialog ── */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        fullWidth
        maxWidth="md"
        TransitionComponent={SlideUpTransition}
      >
        <DialogTitle>{editing ? "Edit pipeline" : "Add pipeline"}</DialogTitle>
        <DialogContent
          sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}
        >
          <Grid container spacing={2} alignItems="center">
            <Grid size={{ xs: 12, sm: 8 }}>
              <TextField
                label="Pipeline name"
                size="small"
                fullWidth
                autoFocus
                placeholder="Engineering - Standard"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={isDefault}
                    onChange={(e) => setIsDefault(e.target.checked)}
                  />
                }
                label={
                  <Typography variant="body2">Default for new jobs</Typography>
                }
              />
            </Grid>
          </Grid>

          <Typography variant="subtitle2" sx={{ mt: 1 }}>
            Stages
          </Typography>
          {stages.map((s, i) => (
            <Paper key={i} variant="outlined" sx={{ p: 1.5 }}>
              <Grid container spacing={1.5} alignItems="center">
                <Grid size={{ xs: "auto" }}>
                  <DragIndicatorIcon fontSize="small" color="disabled" />
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField
                    label={`Stage ${i + 1} name`}
                    size="small"
                    fullWidth
                    value={s.name}
                    onChange={(e) => updateStage(i, { name: e.target.value })}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 3 }}>
                  <TextField
                    label="Interviewer role"
                    size="small"
                    fullWidth
                    placeholder="Hiring Manager"
                    value={s.interviewerRole}
                    onChange={(e) =>
                      updateStage(i, { interviewerRole: e.target.value })
                    }
                  />
                </Grid>
                <Grid size={{ xs: 8, sm: 3 }}>
                  <FormControlLabel
                    control={
                      <Switch
                        size="small"
                        checked={s.isBgvStage}
                        onChange={(e) =>
                          updateStage(i, { isBgvStage: e.target.checked })
                        }
                      />
                    }
                    label={<Typography variant="caption">BGV stage</Typography>}
                  />
                </Grid>
                <Grid size={{ xs: 4, sm: 2 }}>
                  <IconButton
                    size="small"
                    onClick={() => removeStage(i)}
                    disabled={stages.length <= 1}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Grid>
                {s.isBgvStage && (
                  <Grid size={{ xs: 12 }}>
                    <TextField
                      label="BGV vendor (optional)"
                      size="small"
                      fullWidth
                      value={s.bgvVendor ?? ""}
                      onChange={(e) =>
                        updateStage(i, { bgvVendor: e.target.value })
                      }
                    />
                  </Grid>
                )}
              </Grid>
            </Paper>
          ))}
          <Button
            variant="outline"
            size="small"
            icon={<AddCircleOutlineIcon />}
            onClick={addStage}
            style={{ alignSelf: "flex-start" }}
          >
            Add stage
          </Button>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            variant="ghost"
            size="small"
            onClick={() => setDialogOpen(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="small"
            onClick={save}
            disabled={
              saving || !name.trim() || stages.some((s) => !s.name.trim())
            }
            loading={saving}
            loadingText="Saving…"
            icon={<SaveIcon />}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmationDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Remove pipeline?"
        message={`"${deleteTarget?.name}" will no longer be selectable for new job openings.`}
        variant="danger"
      />
    </Box>
  );
}
