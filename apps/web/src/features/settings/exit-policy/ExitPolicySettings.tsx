import { useContext, useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Typography from "@mui/material/Typography";
import Button from "@web/shared/components/Button";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
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
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import GavelIcon from "@mui/icons-material/Gavel";
import ChecklistIcon from "@mui/icons-material/Checklist";
import QuizIcon from "@mui/icons-material/Quiz";
import SaveIcon from "@mui/icons-material/Save";
import SlideUpTransition from "@web/shared/components/SlideUpTransition";
import ConfirmationDialog from "@web/shared/components/ConfirmationDialog";
import DataList from "@web/shared/components/DataList";
import apiClient from "@web/core/http/axiosConfig";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import { API_ENDPOINTS } from "@web/shared/constants";
import { numField } from "@web/shared/components/numField";

// ─── Types ────────────────────────────────────────────────────────────────────

interface NoticePeriodPolicy {
  id: string;
  minTenureMonths: number;
  maxTenureMonths: number | null;
  designation: string | null;
  department: string | null;
  noticePeriodDays: number;
  isProbationPolicy: boolean;
  priority: number;
}

interface ExitChecklistItemDef {
  id: string;
  label: string;
  owningRole: string;
  isRequired: boolean;
  order: number;
}

interface ExitQuestion {
  id: string;
  label: string;
  type: "rating" | "text" | "boolean";
  required: boolean;
}

const EMPTY_POLICY_FORM = {
  minTenureMonths: 0,
  maxTenureMonths: "" as number | "",
  designation: "",
  department: "",
  noticePeriodDays: 30,
  isProbationPolicy: false,
  priority: 0,
};

const EMPTY_CHECKLIST_FORM = {
  label: "",
  owningRole: "IT" as string,
  isRequired: true,
  order: 0,
};

function newQuestionId() {
  return `q_${Math.random().toString(36).slice(2, 10)}`;
}

export default function ExitPolicySettings() {
  const { setAlert } = useContext(AlertContext);
  const { user } = useContext(UserContext);
  const canEdit =
    user?.isSuperUser ||
    ["owner", "admin", "hr"].includes(user?.tenantRole ?? "") ||
    user?.permissions?.some((p: string) => p.startsWith("OrgSettings:"));

  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(true);

  const [policies, setPolicies] = useState<NoticePeriodPolicy[]>([]);
  const [checklistDefs, setChecklistDefs] = useState<ExitChecklistItemDef[]>(
    [],
  );
  const [questions, setQuestions] = useState<ExitQuestion[]>([]);

  const [policyDialogOpen, setPolicyDialogOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<NoticePeriodPolicy | null>(
    null,
  );
  const [policyForm, setPolicyForm] = useState(EMPTY_POLICY_FORM);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [deletePolicyTarget, setDeletePolicyTarget] =
    useState<NoticePeriodPolicy | null>(null);

  const [checklistDialogOpen, setChecklistDialogOpen] = useState(false);
  const [editingChecklistItem, setEditingChecklistItem] =
    useState<ExitChecklistItemDef | null>(null);
  const [checklistForm, setChecklistForm] = useState(EMPTY_CHECKLIST_FORM);
  const [savingChecklistItem, setSavingChecklistItem] = useState(false);
  const [deleteChecklistTarget, setDeleteChecklistTarget] =
    useState<ExitChecklistItemDef | null>(null);

  const [savingQuestions, setSavingQuestions] = useState(false);

  async function fetchPolicies() {
    const res = await apiClient.get(API_ENDPOINTS.LIST_NOTICE_PERIOD_POLICIES);
    setPolicies(res.data?.data ?? []);
  }
  async function fetchChecklist() {
    const res = await apiClient.get(API_ENDPOINTS.LIST_EXIT_CHECKLIST_DEFS);
    setChecklistDefs(res.data?.data ?? []);
  }
  async function fetchTemplate() {
    const res = await apiClient.get(API_ENDPOINTS.GET_EXIT_INTERVIEW_TEMPLATE);
    setQuestions(res.data?.data?.questions ?? []);
  }

  // Only used for the initial load — individual save/delete handlers below
  // refetch just their own tab's slice, so editing questions on one tab
  // doesn't get silently discarded by a save on another tab overwriting
  // `questions` with whatever's still in the DB.
  async function fetchAll() {
    setLoading(true);
    try {
      await Promise.all([fetchPolicies(), fetchChecklist(), fetchTemplate()]);
    } catch (err: any) {
      setAlert({
        open: true,
        message:
          err?.response?.data?.message ??
          "Failed to load exit policy settings.",
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

  // ── Notice period policy handlers ────────────────────────────────────────────

  function openAddPolicy() {
    setEditingPolicy(null);
    setPolicyForm(EMPTY_POLICY_FORM);
    setPolicyDialogOpen(true);
  }
  function openEditPolicy(p: NoticePeriodPolicy) {
    setEditingPolicy(p);
    setPolicyForm({
      minTenureMonths: p.minTenureMonths,
      maxTenureMonths: p.maxTenureMonths ?? "",
      designation: p.designation ?? "",
      department: p.department ?? "",
      noticePeriodDays: p.noticePeriodDays,
      isProbationPolicy: p.isProbationPolicy,
      priority: p.priority,
    });
    setPolicyDialogOpen(true);
  }
  async function savePolicy() {
    setSavingPolicy(true);
    try {
      const payload = {
        minTenureMonths: policyForm.minTenureMonths,
        maxTenureMonths:
          policyForm.maxTenureMonths === ""
            ? undefined
            : Number(policyForm.maxTenureMonths),
        designation: policyForm.designation || undefined,
        department: policyForm.department || undefined,
        noticePeriodDays: policyForm.noticePeriodDays,
        isProbationPolicy: policyForm.isProbationPolicy,
        priority: policyForm.priority,
      };
      if (editingPolicy) {
        await apiClient.put(
          API_ENDPOINTS.UPDATE_NOTICE_PERIOD_POLICY(editingPolicy.id),
          payload,
        );
      } else {
        await apiClient.post(
          API_ENDPOINTS.CREATE_NOTICE_PERIOD_POLICY,
          payload,
        );
      }
      setAlert({
        open: true,
        message: editingPolicy ? "Policy updated." : "Policy added.",
        severity: "success",
      });
      setPolicyDialogOpen(false);
      await fetchPolicies();
    } catch (err: any) {
      setAlert({
        open: true,
        message: err?.response?.data?.message ?? "Failed to save policy.",
        severity: "error",
      });
    } finally {
      setSavingPolicy(false);
    }
  }
  async function confirmDeletePolicy() {
    if (!deletePolicyTarget) return;
    try {
      await apiClient.delete(
        API_ENDPOINTS.DELETE_NOTICE_PERIOD_POLICY(deletePolicyTarget.id),
      );
      setAlert({ open: true, message: "Policy deleted.", severity: "info" });
      setDeletePolicyTarget(null);
      await fetchPolicies();
    } catch (err: any) {
      setAlert({
        open: true,
        message: err?.response?.data?.message ?? "Failed to delete policy.",
        severity: "error",
      });
    }
  }

  // ── Checklist handlers ───────────────────────────────────────────────────────

  function openAddChecklistItem() {
    setEditingChecklistItem(null);
    setChecklistForm({ ...EMPTY_CHECKLIST_FORM, order: checklistDefs.length });
    setChecklistDialogOpen(true);
  }
  function openEditChecklistItem(item: ExitChecklistItemDef) {
    setEditingChecklistItem(item);
    setChecklistForm({
      label: item.label,
      owningRole: item.owningRole,
      isRequired: item.isRequired,
      order: item.order,
    });
    setChecklistDialogOpen(true);
  }
  async function saveChecklistItem() {
    setSavingChecklistItem(true);
    try {
      if (editingChecklistItem) {
        await apiClient.put(
          API_ENDPOINTS.UPDATE_EXIT_CHECKLIST_DEF(editingChecklistItem.id),
          checklistForm,
        );
      } else {
        await apiClient.post(
          API_ENDPOINTS.CREATE_EXIT_CHECKLIST_DEF,
          checklistForm,
        );
      }
      setAlert({
        open: true,
        message: editingChecklistItem ? "Item updated." : "Item added.",
        severity: "success",
      });
      setChecklistDialogOpen(false);
      await fetchChecklist();
    } catch (err: any) {
      setAlert({
        open: true,
        message: err?.response?.data?.message ?? "Failed to save item.",
        severity: "error",
      });
    } finally {
      setSavingChecklistItem(false);
    }
  }
  async function confirmDeleteChecklistItem() {
    if (!deleteChecklistTarget) return;
    try {
      await apiClient.delete(
        API_ENDPOINTS.DELETE_EXIT_CHECKLIST_DEF(deleteChecklistTarget.id),
      );
      setAlert({ open: true, message: "Item removed.", severity: "info" });
      setDeleteChecklistTarget(null);
      await fetchChecklist();
    } catch (err: any) {
      setAlert({
        open: true,
        message: err?.response?.data?.message ?? "Failed to remove item.",
        severity: "error",
      });
    }
  }

  // ── Exit interview question handlers ─────────────────────────────────────────

  function addQuestion() {
    setQuestions((qs) => [
      ...qs,
      { id: newQuestionId(), label: "", type: "text", required: false },
    ]);
  }
  function updateQuestion(id: string, patch: Partial<ExitQuestion>) {
    setQuestions((qs) => qs.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  }
  function removeQuestion(id: string) {
    setQuestions((qs) => qs.filter((q) => q.id !== id));
  }
  async function saveQuestions() {
    setSavingQuestions(true);
    try {
      await apiClient.put(API_ENDPOINTS.UPDATE_EXIT_INTERVIEW_TEMPLATE, {
        questions,
      });
      setAlert({
        open: true,
        message: "Exit interview questions saved.",
        severity: "success",
      });
    } catch (err: any) {
      setAlert({
        open: true,
        message: err?.response?.data?.message ?? "Failed to save questions.",
        severity: "error",
      });
    } finally {
      setSavingQuestions(false);
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
      <Box sx={{ mb: 3 }}>
        <Typography variant="body2" color="text.secondary">
          Notice period bands by tenure, the offboarding clearance checklist,
          and the exit interview questions employees see when they leave.
          Nothing configured here yet? Every resignation defaults to 30 days'
          notice and a standard exit survey.
        </Typography>
      </Box>

      {!canEdit && (
        <Alert severity="info" sx={{ mb: 2 }}>
          You have read-only access. Contact an owner, admin, or HR to make
          changes.
        </Alert>
      )}

      <Paper variant="outlined" sx={{ mb: 3 }}>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          sx={{ borderBottom: 1, borderColor: "divider", px: 1 }}
        >
          <Tab
            icon={<GavelIcon fontSize="small" />}
            iconPosition="start"
            label={`Notice Period (${policies.length})`}
          />
          <Tab
            icon={<ChecklistIcon fontSize="small" />}
            iconPosition="start"
            label={`Checklist (${checklistDefs.length})`}
          />
          <Tab
            icon={<QuizIcon fontSize="small" />}
            iconPosition="start"
            label={`Exit Interview (${questions.length})`}
          />
        </Tabs>

        {/* ── Notice Period Bands ── */}
        {tab === 0 && (
          <Box sx={{ p: 3 }}>
            <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 2 }}>
              {canEdit && (
                <Button
                  variant="primary"
                  size="small"
                  icon={<AddCircleOutlineIcon />}
                  onClick={openAddPolicy}
                >
                  Add band
                </Button>
              )}
            </Box>
            {policies.length === 0 ? (
              <Alert severity="info">
                No tenure bands yet — every resignation defaults to 30 days'
                notice. Add a band below with tenure/designation/department left
                blank to set a different default for everyone, or add specific
                bands to override it for particular groups.
              </Alert>
            ) : (
              <DataList
                ariaLabel="Notice period bands"
                variant="rows"
                data={policies}
                getRowId={(p: any) => p.id}
                actions={(p: any) =>
                  canEdit
                    ? [
                        {
                          icon: <EditIcon fontSize="small" />,
                          label: "Edit",
                          onClick: () => openEditPolicy(p),
                        },
                        {
                          icon: <DeleteIcon fontSize="small" />,
                          label: "Delete",
                          onClick: () => setDeletePolicyTarget(p),
                        },
                      ]
                    : []
                }
                columns={[
                  {
                    key: "appliesTo",
                    label: "Applies to",
                    primary: true,
                    render: (p: any) =>
                      p.designation || p.department
                        ? [p.designation, p.department]
                            .filter(Boolean)
                            .join(" · ")
                        : "Everyone",
                  },
                  {
                    key: "tenure",
                    label: "Tenure",
                    render: (p: any) =>
                      `${p.minTenureMonths}${p.maxTenureMonths != null ? `–${p.maxTenureMonths}` : "+"} months`,
                  },
                  {
                    key: "notice",
                    label: "Notice",
                    render: (p: any) => `${p.noticePeriodDays} days`,
                  },
                  {
                    key: "type",
                    label: "Type",
                    render: (p: any) =>
                      p.isProbationPolicy && (
                        <Chip
                          size="small"
                          label="Probation"
                          color="primary"
                          variant="outlined"
                        />
                      ),
                  },
                ]}
              />
            )}
          </Box>
        )}

        {/* ── Exit Checklist ── */}
        {tab === 1 && (
          <Box sx={{ p: 3 }}>
            <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 2 }}>
              {canEdit && (
                <Button
                  variant="primary"
                  size="small"
                  icon={<AddCircleOutlineIcon />}
                  onClick={openAddChecklistItem}
                >
                  Add item
                </Button>
              )}
            </Box>
            {checklistDefs.length === 0 ? (
              <Alert severity="info">
                No checklist configured — the exit flow falls back to the two
                simple "Assets returned" / "FnF done" checkboxes.
              </Alert>
            ) : (
              <DataList
                ariaLabel="Exit checklist"
                variant="rows"
                data={checklistDefs.slice().sort((a, b) => a.order - b.order)}
                getRowId={(item: any) => item.id}
                actions={(item: any) =>
                  canEdit
                    ? [
                        {
                          icon: <EditIcon fontSize="small" />,
                          label: "Edit",
                          onClick: () => openEditChecklistItem(item),
                        },
                        {
                          icon: <DeleteIcon fontSize="small" />,
                          label: "Remove",
                          onClick: () => setDeleteChecklistTarget(item),
                        },
                      ]
                    : []
                }
                columns={[
                  { key: "label", label: "Item", primary: true },
                  {
                    key: "owningRole",
                    label: "Owner",
                    render: (item: any) => (
                      <Chip
                        size="small"
                        label={item.owningRole}
                        variant="outlined"
                      />
                    ),
                  },
                  {
                    key: "isRequired",
                    label: "Required",
                    render: (item: any) => (item.isRequired ? "Yes" : "No"),
                  },
                ]}
              />
            )}
          </Box>
        )}

        {/* ── Exit Interview Questions ── */}
        {tab === 2 && (
          <Box sx={{ p: 3 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Shown to employees after an approved resignation. Leave this empty
              to use the standard 4-question survey.
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {questions.map((q, i) => (
                <Paper key={q.id} variant="outlined" sx={{ p: 2 }}>
                  <Grid container spacing={2} alignItems="center">
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField
                        label={`Question ${i + 1}`}
                        size="small"
                        fullWidth
                        disabled={!canEdit}
                        value={q.label}
                        onChange={(e) =>
                          updateQuestion(q.id, { label: e.target.value })
                        }
                      />
                    </Grid>
                    <Grid size={{ xs: 6, sm: 3 }}>
                      <FormControl fullWidth size="small" disabled={!canEdit}>
                        <InputLabel>Type</InputLabel>
                        <Select
                          label="Type"
                          value={q.type}
                          onChange={(e) =>
                            updateQuestion(q.id, {
                              type: e.target.value as ExitQuestion["type"],
                            })
                          }
                        >
                          <MenuItem value="rating">Rating</MenuItem>
                          <MenuItem value="text">Text</MenuItem>
                          <MenuItem value="boolean">Yes/No</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid size={{ xs: 4, sm: 2 }}>
                      <FormControlLabel
                        control={
                          <Switch
                            size="small"
                            disabled={!canEdit}
                            checked={q.required}
                            onChange={(e) =>
                              updateQuestion(q.id, {
                                required: e.target.checked,
                              })
                            }
                          />
                        }
                        label={
                          <Typography variant="caption">Required</Typography>
                        }
                      />
                    </Grid>
                    {canEdit && (
                      <Grid size={{ xs: 2, sm: 1 }}>
                        <IconButton
                          size="small"
                          onClick={() => removeQuestion(q.id)}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Grid>
                    )}
                  </Grid>
                </Paper>
              ))}
            </Box>

            {canEdit && (
              <Box sx={{ display: "flex", gap: 2, mt: 2 }}>
                <Button
                  variant="outline"
                  size="small"
                  icon={<AddCircleOutlineIcon />}
                  onClick={addQuestion}
                >
                  Add question
                </Button>
                <Button
                  variant="primary"
                  size="small"
                  icon={<SaveIcon />}
                  loading={savingQuestions}
                  onClick={saveQuestions}
                  disabled={savingQuestions}
                >
                  Save questions
                </Button>
              </Box>
            )}
          </Box>
        )}
      </Paper>

      {/* ── Notice period policy dialog ── */}
      <Dialog
        open={policyDialogOpen}
        onClose={() => setPolicyDialogOpen(false)}
        fullWidth
        maxWidth="sm"
        TransitionComponent={SlideUpTransition}
      >
        <DialogTitle>
          {editingPolicy ? "Edit notice period band" : "Add notice period band"}
        </DialogTitle>
        <DialogContent
          sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}
        >
          <Grid container spacing={2}>
            <Grid size={{ xs: 6 }}>
              {numField(
                "Min tenure",
                policyForm.minTenureMonths,
                (v) => setPolicyForm((f) => ({ ...f, minTenureMonths: v })),
                { min: 0, suffix: "months" },
              )}
            </Grid>
            <Grid size={{ xs: 6 }}>
              {numField(
                "Max tenure",
                policyForm.maxTenureMonths === ""
                  ? 0
                  : Number(policyForm.maxTenureMonths),
                (v) => setPolicyForm((f) => ({ ...f, maxTenureMonths: v })),
                { min: 0, suffix: "months", helperText: "0 = no upper bound" },
              )}
            </Grid>
          </Grid>
          <Grid container spacing={2}>
            <Grid size={{ xs: 6 }}>
              <TextField
                label="Designation (optional)"
                size="small"
                fullWidth
                value={policyForm.designation}
                onChange={(e) =>
                  setPolicyForm((f) => ({ ...f, designation: e.target.value }))
                }
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                label="Department (optional)"
                size="small"
                fullWidth
                value={policyForm.department}
                onChange={(e) =>
                  setPolicyForm((f) => ({ ...f, department: e.target.value }))
                }
              />
            </Grid>
          </Grid>
          {numField(
            "Notice period",
            policyForm.noticePeriodDays,
            (v) => setPolicyForm((f) => ({ ...f, noticePeriodDays: v })),
            { min: 0, suffix: "days" },
          )}
          <FormControlLabel
            control={
              <Switch
                checked={policyForm.isProbationPolicy}
                onChange={(e) =>
                  setPolicyForm((f) => ({
                    ...f,
                    isProbationPolicy: e.target.checked,
                  }))
                }
              />
            }
            label={
              <Typography variant="body2">
                Applies only while still on probation
              </Typography>
            }
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            variant="ghost"
            size="small"
            onClick={() => setPolicyDialogOpen(false)}
            disabled={savingPolicy}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="small"
            onClick={savePolicy}
            disabled={savingPolicy || !policyForm.noticePeriodDays}
            icon={<SaveIcon />}
            loading={savingPolicy}
            loadingText="Saving…"
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Checklist item dialog ── */}
      <Dialog
        open={checklistDialogOpen}
        onClose={() => setChecklistDialogOpen(false)}
        fullWidth
        maxWidth="sm"
        TransitionComponent={SlideUpTransition}
      >
        <DialogTitle>
          {editingChecklistItem ? "Edit checklist item" : "Add checklist item"}
        </DialogTitle>
        <DialogContent
          sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}
        >
          <TextField
            label="Item"
            size="small"
            fullWidth
            autoFocus
            placeholder="e.g. Return laptop"
            value={checklistForm.label}
            onChange={(e) =>
              setChecklistForm((f) => ({ ...f, label: e.target.value }))
            }
          />
          <FormControl fullWidth size="small">
            <InputLabel>Owning role</InputLabel>
            <Select
              label="Owning role"
              value={checklistForm.owningRole}
              onChange={(e) =>
                setChecklistForm((f) => ({ ...f, owningRole: e.target.value }))
              }
            >
              <MenuItem value="IT">IT</MenuItem>
              <MenuItem value="Finance">Finance</MenuItem>
              <MenuItem value="HR">HR</MenuItem>
              <MenuItem value="Admin">Admin</MenuItem>
              <MenuItem value="Manager">Manager</MenuItem>
            </Select>
          </FormControl>
          <FormControlLabel
            control={
              <Switch
                checked={checklistForm.isRequired}
                onChange={(e) =>
                  setChecklistForm((f) => ({
                    ...f,
                    isRequired: e.target.checked,
                  }))
                }
              />
            }
            label={
              <Typography variant="body2">
                Required before exit is complete
              </Typography>
            }
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            variant="ghost"
            size="small"
            onClick={() => setChecklistDialogOpen(false)}
            disabled={savingChecklistItem}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="small"
            onClick={saveChecklistItem}
            disabled={savingChecklistItem || !checklistForm.label.trim()}
            icon={<SaveIcon />}
            loading={savingChecklistItem}
            loadingText="Saving…"
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmationDialog
        open={!!deletePolicyTarget}
        onClose={() => setDeletePolicyTarget(null)}
        onConfirm={confirmDeletePolicy}
        title="Delete notice period band?"
        message="Resignations already submitted keep their resolved notice period — this only affects future submissions."
        variant="danger"
      />
      <ConfirmationDialog
        open={!!deleteChecklistTarget}
        onClose={() => setDeleteChecklistTarget(null)}
        onConfirm={confirmDeleteChecklistItem}
        title="Remove checklist item?"
        message={`"${deleteChecklistTarget?.label}" will no longer appear on new exit checklists.`}
        variant="danger"
      />
    </Box>
  );
}
