import { useContext, useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Paper from "@mui/material/Paper";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import DataList from "@web/shared/components/DataList";
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
import PaymentsIcon from "@mui/icons-material/Payments";
import MapIcon from "@mui/icons-material/Map";
import EventRepeatIcon from "@mui/icons-material/EventRepeat";
import SaveIcon from "@mui/icons-material/Save";
import SlideUpTransition from "@web/shared/components/SlideUpTransition";
import ConfirmationDialog from "@web/shared/components/ConfirmationDialog";
import apiClient from "@web/core/http/axiosConfig";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import { API_ENDPOINTS } from "@web/shared/constants";
import { numField } from "@web/shared/components/numField";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SalaryComponent {
  id: string;
  name: string;
  code: string;
  type: "earning" | "deduction";
  isTaxable: boolean;
  calcType: "fixed" | "percent_of_basic" | "formula";
  percentValue: number | null;
  isStatutory: boolean;
  displayOrder: number;
}

interface PtSlab {
  id: string;
  state: string;
  minGross: number;
  maxGross: number | null;
  monthlyPT: number;
}

interface PayCycle {
  id: string;
  name: string;
  frequency: "monthly" | "biweekly" | "weekly";
  payDay: number;
  isDefault: boolean;
}

const EMPTY_COMPONENT_FORM = {
  name: "",
  code: "",
  type: "earning" as "earning" | "deduction",
  isTaxable: true,
  calcType: "fixed" as "fixed" | "percent_of_basic" | "formula",
  percentValue: 0,
  displayOrder: 0,
};

const EMPTY_SLAB_FORM = {
  state: "",
  minGross: 0,
  maxGross: "" as number | "",
  monthlyPT: 0,
};

const EMPTY_CYCLE_FORM = {
  name: "",
  frequency: "monthly" as PayCycle["frequency"],
  payDay: 1,
  isDefault: false,
};

export default function PayrollComponentsSettings() {
  const { setAlert } = useContext(AlertContext);
  const { user } = useContext(UserContext);
  const canEdit =
    user?.isSuperUser ||
    ["owner", "admin"].includes(user?.tenantRole ?? "") ||
    user?.permissions?.some((p: string) => p.startsWith("OrgSettings:"));

  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [components, setComponents] = useState<SalaryComponent[]>([]);
  const [slabs, setSlabs] = useState<PtSlab[]>([]);
  const [cycles, setCycles] = useState<PayCycle[]>([]);

  const [componentDialogOpen, setComponentDialogOpen] = useState(false);
  const [editingComponent, setEditingComponent] =
    useState<SalaryComponent | null>(null);
  const [componentForm, setComponentForm] = useState(EMPTY_COMPONENT_FORM);
  const [savingComponent, setSavingComponent] = useState(false);
  const [deleteComponentTarget, setDeleteComponentTarget] =
    useState<SalaryComponent | null>(null);

  const [slabDialogOpen, setSlabDialogOpen] = useState(false);
  const [editingSlab, setEditingSlab] = useState<PtSlab | null>(null);
  const [slabForm, setSlabForm] = useState(EMPTY_SLAB_FORM);
  const [savingSlab, setSavingSlab] = useState(false);
  const [deleteSlabTarget, setDeleteSlabTarget] = useState<PtSlab | null>(null);

  const [cycleDialogOpen, setCycleDialogOpen] = useState(false);
  const [editingCycle, setEditingCycle] = useState<PayCycle | null>(null);
  const [cycleForm, setCycleForm] = useState(EMPTY_CYCLE_FORM);
  const [savingCycle, setSavingCycle] = useState(false);
  const [deleteCycleTarget, setDeleteCycleTarget] = useState<PayCycle | null>(
    null,
  );

  async function fetchAll() {
    setLoading(true);
    try {
      const [componentsRes, slabsRes, cyclesRes] = await Promise.all([
        apiClient.get(API_ENDPOINTS.LIST_SALARY_COMPONENTS),
        apiClient.get(API_ENDPOINTS.LIST_PT_SLABS),
        apiClient.get(API_ENDPOINTS.LIST_PAY_CYCLES),
      ]);
      setComponents(componentsRes.data?.data ?? []);
      setSlabs(slabsRes.data?.data ?? []);
      setCycles(cyclesRes.data?.data ?? []);
    } catch (err: any) {
      setAlert({
        open: true,
        message:
          err?.response?.data?.message ?? "Failed to load payroll components.",
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

  // ── Salary component handlers ────────────────────────────────────────────────

  function openAddComponent() {
    setEditingComponent(null);
    setComponentForm(EMPTY_COMPONENT_FORM);
    setComponentDialogOpen(true);
  }
  function openEditComponent(c: SalaryComponent) {
    setEditingComponent(c);
    setComponentForm({
      name: c.name,
      code: c.code,
      type: c.type,
      isTaxable: c.isTaxable,
      calcType: c.calcType,
      percentValue: c.percentValue ?? 0,
      displayOrder: c.displayOrder,
    });
    setComponentDialogOpen(true);
  }
  async function saveComponent() {
    setSavingComponent(true);
    try {
      if (editingComponent) {
        await apiClient.put(
          API_ENDPOINTS.UPDATE_SALARY_COMPONENT(editingComponent.id),
          componentForm,
        );
      } else {
        await apiClient.post(
          API_ENDPOINTS.CREATE_SALARY_COMPONENT,
          componentForm,
        );
      }
      setAlert({
        open: true,
        message: editingComponent ? "Component updated." : "Component added.",
        severity: "success",
      });
      setComponentDialogOpen(false);
      await fetchAll();
    } catch (err: any) {
      setAlert({
        open: true,
        message: err?.response?.data?.message ?? "Failed to save component.",
        severity: "error",
      });
    } finally {
      setSavingComponent(false);
    }
  }
  async function confirmDeleteComponent() {
    if (!deleteComponentTarget) return;
    try {
      await apiClient.delete(
        API_ENDPOINTS.DELETE_SALARY_COMPONENT(deleteComponentTarget.id),
      );
      setAlert({ open: true, message: "Component removed.", severity: "info" });
      setDeleteComponentTarget(null);
      await fetchAll();
    } catch (err: any) {
      setAlert({
        open: true,
        message: err?.response?.data?.message ?? "Failed to remove component.",
        severity: "error",
      });
    }
  }

  // ── PT slab handlers ─────────────────────────────────────────────────────────

  function openAddSlab() {
    setEditingSlab(null);
    setSlabForm(EMPTY_SLAB_FORM);
    setSlabDialogOpen(true);
  }
  function openEditSlab(s: PtSlab) {
    setEditingSlab(s);
    setSlabForm({
      state: s.state,
      minGross: s.minGross,
      maxGross: s.maxGross ?? "",
      monthlyPT: s.monthlyPT,
    });
    setSlabDialogOpen(true);
  }
  async function saveSlab() {
    setSavingSlab(true);
    try {
      const payload = {
        state: slabForm.state,
        minGross: slabForm.minGross,
        maxGross:
          slabForm.maxGross === "" ? undefined : Number(slabForm.maxGross),
        monthlyPT: slabForm.monthlyPT,
      };
      if (editingSlab) {
        await apiClient.put(
          API_ENDPOINTS.UPDATE_PT_SLAB(editingSlab.id),
          payload,
        );
      } else {
        await apiClient.post(API_ENDPOINTS.CREATE_PT_SLAB, payload);
      }
      setAlert({
        open: true,
        message: editingSlab ? "Slab updated." : "Slab added.",
        severity: "success",
      });
      setSlabDialogOpen(false);
      await fetchAll();
    } catch (err: any) {
      setAlert({
        open: true,
        message: err?.response?.data?.message ?? "Failed to save slab.",
        severity: "error",
      });
    } finally {
      setSavingSlab(false);
    }
  }
  async function confirmDeleteSlab() {
    if (!deleteSlabTarget) return;
    try {
      await apiClient.delete(API_ENDPOINTS.DELETE_PT_SLAB(deleteSlabTarget.id));
      setAlert({ open: true, message: "Slab removed.", severity: "info" });
      setDeleteSlabTarget(null);
      await fetchAll();
    } catch (err: any) {
      setAlert({
        open: true,
        message: err?.response?.data?.message ?? "Failed to remove slab.",
        severity: "error",
      });
    }
  }

  // ── Pay cycle handlers ───────────────────────────────────────────────────────

  function openAddCycle() {
    setEditingCycle(null);
    setCycleForm(EMPTY_CYCLE_FORM);
    setCycleDialogOpen(true);
  }
  function openEditCycle(c: PayCycle) {
    setEditingCycle(c);
    setCycleForm({
      name: c.name,
      frequency: c.frequency,
      payDay: c.payDay,
      isDefault: c.isDefault,
    });
    setCycleDialogOpen(true);
  }
  async function saveCycle() {
    setSavingCycle(true);
    try {
      if (editingCycle) {
        await apiClient.put(
          API_ENDPOINTS.UPDATE_PAY_CYCLE(editingCycle.id),
          cycleForm,
        );
      } else {
        await apiClient.post(API_ENDPOINTS.CREATE_PAY_CYCLE, cycleForm);
      }
      setAlert({
        open: true,
        message: editingCycle ? "Pay cycle updated." : "Pay cycle added.",
        severity: "success",
      });
      setCycleDialogOpen(false);
      await fetchAll();
    } catch (err: any) {
      setAlert({
        open: true,
        message: err?.response?.data?.message ?? "Failed to save pay cycle.",
        severity: "error",
      });
    } finally {
      setSavingCycle(false);
    }
  }
  async function confirmDeleteCycle() {
    if (!deleteCycleTarget) return;
    try {
      await apiClient.delete(
        API_ENDPOINTS.DELETE_PAY_CYCLE(deleteCycleTarget.id),
      );
      setAlert({ open: true, message: "Pay cycle removed.", severity: "info" });
      setDeleteCycleTarget(null);
      await fetchAll();
    } catch (err: any) {
      setAlert({
        open: true,
        message: err?.response?.data?.message ?? "Failed to remove pay cycle.",
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
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>
          Payroll Components
        </Typography>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ maxWidth: 640 }}
        >
          Basic, HRA, Conveyance, PF, ESI, and PT are pre-configured below with
          the standard rates (PF 12% of basic, ESI 1.75% of gross, PT ₹200) —
          edit them to change how every payslip is calculated. State-wise
          Professional Tax slabs override the flat PT rate once configured.
          Additional custom components can be added here, but aren't applied
          to payroll calculations yet.
        </Typography>
      </Box>

      {!canEdit && (
        <Alert severity="info" sx={{ mb: 2 }}>
          You have read-only access. Contact an owner or admin to make changes.
        </Alert>
      )}

      <Paper variant="outlined" sx={{ mb: 3 }}>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          sx={{ borderBottom: 1, borderColor: "divider", px: 1 }}
        >
          <Tab
            icon={<PaymentsIcon fontSize="small" />}
            iconPosition="start"
            label={`Components (${components.length})`}
          />
          <Tab
            icon={<MapIcon fontSize="small" />}
            iconPosition="start"
            label={`PT Slabs (${slabs.length})`}
          />
          <Tab
            icon={<EventRepeatIcon fontSize="small" />}
            iconPosition="start"
            label={`Pay Cycles (${cycles.length})`}
          />
        </Tabs>

        {/* ── Components ── */}
        {tab === 0 && (
          <Box sx={{ p: 3 }}>
            <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 2 }}>
              {canEdit && (
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<AddCircleOutlineIcon />}
                  onClick={openAddComponent}
                >
                  Add component
                </Button>
              )}
            </Box>
            {components.length === 0 ? (
              <Alert severity="info">
                No custom components yet — every payslip uses the standard 7
                fields.
              </Alert>
            ) : (
              <DataList
                ariaLabel="Salary components"
                variant="rows"
                data={components}
                getRowId={(c) => c.id}
                columns={[
                  {
                    key: "name",
                    label: "Name",
                    render: (c) => (
                      <>
                        {c.name}
                        {c.isStatutory && (
                          <Chip
                            size="small"
                            label="Statutory"
                            sx={{ ml: 1 }}
                            variant="outlined"
                          />
                        )}
                      </>
                    ),
                  },
                  { key: "code", label: "Code" },
                  {
                    key: "type",
                    label: "Type",
                    render: (c) => (
                      <Chip
                        size="small"
                        label={c.type}
                        color={c.type === "earning" ? "success" : "default"}
                        variant="outlined"
                      />
                    ),
                  },
                  {
                    key: "calcType",
                    label: "Calculation",
                    render: (c) =>
                      c.calcType === "percent_of_basic"
                        ? `${c.percentValue ?? 0}% of basic`
                        : c.calcType,
                  },
                ]}
                actions={
                  canEdit
                    ? (c) => [
                        {
                          icon: <EditIcon fontSize="small" />,
                          label: "Edit",
                          onClick: () => openEditComponent(c),
                        },
                        ...(c.isStatutory
                          ? []
                          : [
                              {
                                icon: <DeleteIcon fontSize="small" />,
                                label: "Remove",
                                color: "error" as const,
                                onClick: () => setDeleteComponentTarget(c),
                              },
                            ]),
                      ]
                    : undefined
                }
              />
            )}
          </Box>
        )}

        {/* ── PT Slabs ── */}
        {tab === 1 && (
          <Box sx={{ p: 3 }}>
            <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 2 }}>
              {canEdit && (
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<AddCircleOutlineIcon />}
                  onClick={openAddSlab}
                >
                  Add slab
                </Button>
              )}
            </Box>
            {slabs.length === 0 ? (
              <Alert severity="info">
                No state-wise slabs configured — Professional Tax uses a flat
                approximate slab for every employee.
              </Alert>
            ) : (
              <DataList
                ariaLabel="Professional tax slabs"
                variant="rows"
                data={slabs}
                getRowId={(s) => s.id}
                columns={[
                  { key: "state", label: "State" },
                  {
                    key: "grossRange",
                    label: "Gross range",
                    render: (s) =>
                      `₹${s.minGross} – ${s.maxGross != null ? `₹${s.maxGross}` : "∞"}`,
                  },
                  {
                    key: "monthlyPT",
                    label: "Monthly PT",
                    render: (s) => `₹${s.monthlyPT}`,
                  },
                ]}
                actions={
                  canEdit
                    ? (s) => [
                        {
                          icon: <EditIcon fontSize="small" />,
                          label: "Edit",
                          onClick: () => openEditSlab(s),
                        },
                        {
                          icon: <DeleteIcon fontSize="small" />,
                          label: "Remove",
                          color: "error" as const,
                          onClick: () => setDeleteSlabTarget(s),
                        },
                      ]
                    : undefined
                }
              />
            )}
          </Box>
        )}

        {/* ── Pay Cycles ── */}
        {tab === 2 && (
          <Box sx={{ p: 3 }}>
            <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 2 }}>
              {canEdit && (
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<AddCircleOutlineIcon />}
                  onClick={openAddCycle}
                >
                  Add pay cycle
                </Button>
              )}
            </Box>
            {cycles.length === 0 ? (
              <Alert severity="info">
                No additional pay cycles — every employee is paid monthly.
              </Alert>
            ) : (
              <DataList
                ariaLabel="Pay cycles"
                variant="rows"
                data={cycles}
                getRowId={(c) => c.id}
                columns={[
                  { key: "name", label: "Name" },
                  { key: "frequency", label: "Frequency" },
                  { key: "payDay", label: "Pay day" },
                  {
                    key: "isDefault",
                    label: "Default",
                    hideLabel: true,
                    render: (c) =>
                      c.isDefault ? (
                        <Chip size="small" label="Default" color="primary" />
                      ) : null,
                  },
                ]}
                actions={
                  canEdit
                    ? (c) => [
                        {
                          icon: <EditIcon fontSize="small" />,
                          label: "Edit",
                          onClick: () => openEditCycle(c),
                        },
                        {
                          icon: <DeleteIcon fontSize="small" />,
                          label: "Remove",
                          color: "error" as const,
                          onClick: () => setDeleteCycleTarget(c),
                        },
                      ]
                    : undefined
                }
              />
            )}
          </Box>
        )}
      </Paper>

      {/* ── Component dialog ── */}
      <Dialog
        open={componentDialogOpen}
        onClose={() => setComponentDialogOpen(false)}
        fullWidth
        maxWidth="sm"
        TransitionComponent={SlideUpTransition}
      >
        <DialogTitle>
          {editingComponent ? "Edit component" : "Add component"}
        </DialogTitle>
        <DialogContent
          sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}
        >
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 7 }}>
              <TextField
                label="Name"
                size="small"
                fullWidth
                placeholder="Special Allowance"
                value={componentForm.name}
                onChange={(e) =>
                  setComponentForm((f) => ({ ...f, name: e.target.value }))
                }
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 5 }}>
              <TextField
                label="Code"
                size="small"
                fullWidth
                placeholder="SPECIAL_ALLOWANCE"
                inputProps={{ style: { textTransform: "uppercase" } }}
                value={componentForm.code}
                onChange={(e) =>
                  setComponentForm((f) => ({
                    ...f,
                    code: e.target.value.toUpperCase(),
                  }))
                }
              />
            </Grid>
          </Grid>
          <Grid container spacing={2}>
            <Grid size={{ xs: 6 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Type</InputLabel>
                <Select
                  label="Type"
                  value={componentForm.type}
                  onChange={(e) =>
                    setComponentForm((f) => ({
                      ...f,
                      type: e.target.value as "earning" | "deduction",
                    }))
                  }
                >
                  <MenuItem value="earning">Earning</MenuItem>
                  <MenuItem value="deduction">Deduction</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Calculation</InputLabel>
                <Select
                  label="Calculation"
                  value={componentForm.calcType}
                  onChange={(e) =>
                    setComponentForm((f) => ({
                      ...f,
                      calcType: e.target.value as typeof f.calcType,
                    }))
                  }
                >
                  <MenuItem value="fixed">Fixed amount</MenuItem>
                  <MenuItem value="percent_of_basic">% of basic</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
          {componentForm.calcType === "percent_of_basic" &&
            numField(
              "Percent of basic",
              componentForm.percentValue,
              (v) => setComponentForm((f) => ({ ...f, percentValue: v })),
              { min: 0, max: 100, suffix: "%" },
            )}
          <FormControlLabel
            control={
              <Switch
                checked={componentForm.isTaxable}
                onChange={(e) =>
                  setComponentForm((f) => ({
                    ...f,
                    isTaxable: e.target.checked,
                  }))
                }
              />
            }
            label={<Typography variant="body2">Taxable</Typography>}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            size="small"
            onClick={() => setComponentDialogOpen(false)}
            disabled={savingComponent}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            size="small"
            onClick={saveComponent}
            disabled={
              savingComponent ||
              !componentForm.name.trim() ||
              !componentForm.code.trim()
            }
            startIcon={
              savingComponent ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <SaveIcon />
              )
            }
          >
            {savingComponent ? "Saving…" : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── PT slab dialog ── */}
      <Dialog
        open={slabDialogOpen}
        onClose={() => setSlabDialogOpen(false)}
        fullWidth
        maxWidth="sm"
        TransitionComponent={SlideUpTransition}
      >
        <DialogTitle>
          {editingSlab ? "Edit PT slab" : "Add PT slab"}
        </DialogTitle>
        <DialogContent
          sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}
        >
          <TextField
            label="State"
            size="small"
            fullWidth
            placeholder="Karnataka"
            value={slabForm.state}
            onChange={(e) =>
              setSlabForm((f) => ({ ...f, state: e.target.value }))
            }
          />
          <Grid container spacing={2}>
            <Grid size={{ xs: 4 }}>
              {numField(
                "Min gross",
                slabForm.minGross,
                (v) => setSlabForm((f) => ({ ...f, minGross: v })),
                { min: 0, suffix: "₹" },
              )}
            </Grid>
            <Grid size={{ xs: 4 }}>
              {numField(
                "Max gross",
                slabForm.maxGross === "" ? 0 : Number(slabForm.maxGross),
                (v) => setSlabForm((f) => ({ ...f, maxGross: v })),
                { min: 0, suffix: "₹", helperText: "0 = no upper bound" },
              )}
            </Grid>
            <Grid size={{ xs: 4 }}>
              {numField(
                "Monthly PT",
                slabForm.monthlyPT,
                (v) => setSlabForm((f) => ({ ...f, monthlyPT: v })),
                { min: 0, suffix: "₹" },
              )}
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            size="small"
            onClick={() => setSlabDialogOpen(false)}
            disabled={savingSlab}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            size="small"
            onClick={saveSlab}
            disabled={savingSlab || !slabForm.state.trim()}
            startIcon={
              savingSlab ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <SaveIcon />
              )
            }
          >
            {savingSlab ? "Saving…" : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Pay cycle dialog ── */}
      <Dialog
        open={cycleDialogOpen}
        onClose={() => setCycleDialogOpen(false)}
        fullWidth
        maxWidth="sm"
        TransitionComponent={SlideUpTransition}
      >
        <DialogTitle>
          {editingCycle ? "Edit pay cycle" : "Add pay cycle"}
        </DialogTitle>
        <DialogContent
          sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}
        >
          <TextField
            label="Name"
            size="small"
            fullWidth
            placeholder="Factory Floor - Biweekly"
            value={cycleForm.name}
            onChange={(e) =>
              setCycleForm((f) => ({ ...f, name: e.target.value }))
            }
          />
          <Grid container spacing={2}>
            <Grid size={{ xs: 6 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Frequency</InputLabel>
                <Select
                  label="Frequency"
                  value={cycleForm.frequency}
                  onChange={(e) =>
                    setCycleForm((f) => ({
                      ...f,
                      frequency: e.target.value as PayCycle["frequency"],
                    }))
                  }
                >
                  <MenuItem value="monthly">Monthly</MenuItem>
                  <MenuItem value="biweekly">Bi-weekly</MenuItem>
                  <MenuItem value="weekly">Weekly</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 6 }}>
              {numField(
                "Pay day",
                cycleForm.payDay,
                (v) => setCycleForm((f) => ({ ...f, payDay: v })),
                { min: 1, max: 31 },
              )}
            </Grid>
          </Grid>
          <FormControlLabel
            control={
              <Switch
                checked={cycleForm.isDefault}
                onChange={(e) =>
                  setCycleForm((f) => ({ ...f, isDefault: e.target.checked }))
                }
              />
            }
            label={<Typography variant="body2">Default cycle</Typography>}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            size="small"
            onClick={() => setCycleDialogOpen(false)}
            disabled={savingCycle}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            size="small"
            onClick={saveCycle}
            disabled={savingCycle || !cycleForm.name.trim()}
            startIcon={
              savingCycle ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <SaveIcon />
              )
            }
          >
            {savingCycle ? "Saving…" : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmationDialog
        open={!!deleteComponentTarget}
        onClose={() => setDeleteComponentTarget(null)}
        onConfirm={confirmDeleteComponent}
        title="Remove component?"
        message={`"${deleteComponentTarget?.name}" will no longer appear on new payslips.`}
        variant="danger"
      />
      <ConfirmationDialog
        open={!!deleteSlabTarget}
        onClose={() => setDeleteSlabTarget(null)}
        onConfirm={confirmDeleteSlab}
        title="Remove slab?"
        message={`This ${deleteSlabTarget?.state} slab will no longer apply.`}
        variant="danger"
      />
      <ConfirmationDialog
        open={!!deleteCycleTarget}
        onClose={() => setDeleteCycleTarget(null)}
        onConfirm={confirmDeleteCycle}
        title="Remove pay cycle?"
        message={`"${deleteCycleTarget?.name}" will no longer be assignable.`}
        variant="danger"
      />
    </Container>
  );
}
