import { memo, useCallback, useContext, useEffect, useState } from "react";
import apiClient from "@web/core/http/axiosConfig";
import { AlertContext } from "@web/app/providers/AlertContext";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import Button from "@web/shared/components/Button";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import CircularProgress from "@mui/material/CircularProgress";
import Grid from "@mui/material/Grid";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Alert from "@mui/material/Alert";
import Switch from "@mui/material/Switch";
import FormGroup from "@mui/material/FormGroup";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import RefreshIcon from "@mui/icons-material/Refresh";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { API_ENDPOINTS } from "@web/shared/constants";

const WEBHOOK_EVENTS = [
  "employee.created",
  "employee.updated",
  "leave.approved",
  "leave.rejected",
  "attendance.marked",
  "payroll.run.created",
  "payroll.run.approved",
  "payroll.run.disbursed",
  "asset.assigned",
  "asset.returned",
  "wfh.approved",
  "ticket.created",
  "ticket.resolved",
];

function WebhookEndpoints() {
  const { setAlert } = useContext(AlertContext);
  const { theme } = useContext(ThemeContext);
  const isDark = theme === "dark";

  const [endpoints, setEndpoints] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [openCreate, setOpenCreate] = useState(false);
  const [form, setForm] = useState({ url: "", events: [] as string[] });
  const [submitting, setSubmitting] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    endpointId: string;
    httpStatus: number;
    success: boolean;
    error?: string;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient(API_ENDPOINTS.WEBHOOK_ENDPOINTS);
      setEndpoints(res.data.data || []);
    } catch {
      setAlert({
        open: true,
        message: "Failed to load webhook endpoints",
        severity: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [setAlert]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = useCallback(async () => {
    setSubmitting(true);
    try {
      const res = await apiClient.post(
        API_ENDPOINTS.CREATE_WEBHOOK_ENDPOINT,
        form,
      );
      setNewSecret(res.data.data?.secret ?? null);
      load();
    } catch (err) {
      setAlert({
        open: true,
        message: err?.response?.data?.message || "Failed to create endpoint",
        severity: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }, [form, load, setAlert]);

  const handleDelete = useCallback(
    async (id: string) => {
      if (!confirm("Delete this webhook endpoint and all delivery history?"))
        return;
      try {
        await apiClient.delete(API_ENDPOINTS.DELETE_WEBHOOK_ENDPOINT(id));
        load();
        setAlert({
          open: true,
          message: "Endpoint deleted",
          severity: "success",
        });
      } catch (err) {
        setAlert({
          open: true,
          message: err?.response?.data?.message || "Delete failed",
          severity: "error",
        });
      }
    },
    [load, setAlert],
  );

  const handleToggleActive = useCallback(
    async (id: string, isActive: boolean) => {
      try {
        await apiClient.patch(API_ENDPOINTS.UPDATE_WEBHOOK_ENDPOINT(id), {
          isActive: !isActive,
        });
        load();
      } catch (err) {
        setAlert({ open: true, message: "Update failed", severity: "error" });
      }
    },
    [load, setAlert],
  );

  const handleRotate = useCallback(
    async (id: string) => {
      try {
        const res = await apiClient.patch(
          API_ENDPOINTS.UPDATE_WEBHOOK_ENDPOINT(id),
          { rotate: true },
        );
        setNewSecret(res.data.data?.secret ?? null);
      } catch (err) {
        setAlert({
          open: true,
          message: "Failed to rotate secret",
          severity: "error",
        });
      }
    },
    [setAlert],
  );

  const handleTest = useCallback(
    async (endpointId: string) => {
      try {
        const res = await apiClient.post(API_ENDPOINTS.TEST_WEBHOOK_ENDPOINT, {
          endpointId,
        });
        setTestResult({ endpointId, ...res.data.data });
      } catch (err) {
        setAlert({ open: true, message: "Test failed", severity: "error" });
      }
    },
    [setAlert],
  );

  const toggleEvent = (event: string) => {
    setForm((f) => ({
      ...f,
      events: f.events.includes(event)
        ? f.events.filter((e) => e !== event)
        : [...f.events, event],
    }));
  };

  const borderColor = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";

  return (
    <Box>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 2,
        }}
      >
        <Typography variant="body2" color="text.secondary">
          Receive real-time events from HRMS. Max 10 endpoints per tenant.
        </Typography>
        <Button
          size="small"
          icon={<AddIcon />}
          variant="primary"
          onClick={() => setOpenCreate(true)}
          style={{
            borderRadius: "8px",
            textTransform: "none",
            fontSize: "0.8rem",
          }}
        >
          Add Endpoint
        </Button>
      </Box>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
          <CircularProgress size={28} />
        </Box>
      ) : endpoints.length === 0 ? (
        <Paper
          elevation={0}
          sx={{
            p: 4,
            textAlign: "center",
            borderRadius: "12px",
            border: `1px solid ${borderColor}`,
          }}
        >
          <Typography color="text.secondary">
            No webhook endpoints registered yet.
          </Typography>
        </Paper>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {endpoints.map((ep) => (
            <Paper
              key={ep.id}
              elevation={0}
              sx={{
                p: 2.5,
                borderRadius: "12px",
                border: `1px solid ${borderColor}`,
                opacity: ep.isActive ? 1 : 0.6,
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  flexWrap: "wrap",
                  gap: 1,
                }}
              >
                <Box sx={{ flexGrow: 1 }}>
                  <Typography
                    variant="body2"
                    fontWeight={600}
                    sx={{ fontFamily: "monospace", wordBreak: "break-all" }}
                  >
                    {ep.url}
                  </Typography>
                  <Box
                    sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 1 }}
                  >
                    {ep.events?.map((ev: string) => (
                      <Chip
                        key={ev}
                        label={ev}
                        size="small"
                        variant="outlined"
                        sx={{
                          height: 20,
                          fontSize: "0.65rem",
                          "& .MuiChip-label": { px: 1 },
                        }}
                      />
                    ))}
                  </Box>
                  {testResult?.endpointId === ep.id && testResult && (
                    <Alert
                      severity={testResult.success ? "success" : "error"}
                      sx={{ mt: 1, py: 0, fontSize: "0.75rem" }}
                    >
                      {testResult.success
                        ? `✓ HTTP ${testResult.httpStatus}`
                        : `✗ ${testResult.error || `HTTP ${testResult.httpStatus}`}`}
                    </Alert>
                  )}
                </Box>
                <Box
                  sx={{
                    display: "flex",
                    gap: 0.5,
                    alignItems: "center",
                    flexShrink: 0,
                  }}
                >
                  <Tooltip
                    title={
                      ep.isActive
                        ? "Active — click to disable"
                        : "Inactive — click to enable"
                    }
                  >
                    <Switch
                      size="small"
                      checked={ep.isActive}
                      onChange={() => handleToggleActive(ep.id, ep.isActive)}
                    />
                  </Tooltip>
                  <Tooltip title="Send test ping">
                    <IconButton
                      size="small"
                      sx={{
                        width: 28,
                        height: 28,
                        borderRadius: "6px",
                        color: "#059669",
                        backgroundColor: "rgba(5,150,105,0.12)",
                      }}
                      onClick={() => handleTest(ep.id)}
                    >
                      <PlayArrowIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Rotate secret">
                    <IconButton
                      size="small"
                      sx={{
                        width: 28,
                        height: 28,
                        borderRadius: "6px",
                        color: "#d97706",
                        backgroundColor: "rgba(217,119,6,0.12)",
                      }}
                      onClick={() => handleRotate(ep.id)}
                    >
                      <RefreshIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete endpoint">
                    <IconButton
                      size="small"
                      sx={{
                        width: 28,
                        height: 28,
                        borderRadius: "6px",
                        color: "#dc2626",
                        backgroundColor: "rgba(220,38,38,0.12)",
                      }}
                      onClick={() => handleDelete(ep.id)}
                    >
                      <DeleteIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Box>
            </Paper>
          ))}
        </Box>
      )}

      {/* Create Endpoint Dialog */}
      <Dialog
        open={openCreate}
        onClose={() => {
          if (!newSecret) setOpenCreate(false);
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Register Webhook Endpoint</DialogTitle>
        <DialogContent sx={{ pt: "16px !important" }}>
          {newSecret ? (
            <Box>
              <Alert severity="warning" sx={{ mb: 2 }}>
                <strong>
                  Store this secret securely — it will not be shown again.
                </strong>
              </Alert>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  p: 1.5,
                  borderRadius: "8px",
                  backgroundColor: isDark
                    ? "rgba(0,0,0,0.3)"
                    : "rgba(0,0,0,0.04)",
                  fontFamily: "monospace",
                  fontSize: "0.8rem",
                  wordBreak: "break-all",
                }}
              >
                <Typography
                  variant="body2"
                  sx={{
                    fontFamily: "monospace",
                    flexGrow: 1,
                    fontSize: "0.78rem",
                  }}
                >
                  {newSecret}
                </Typography>
                <Tooltip title="Copy">
                  <IconButton
                    size="small"
                    onClick={() => {
                      navigator.clipboard.writeText(newSecret);
                      setAlert({
                        open: true,
                        message: "Secret copied",
                        severity: "success",
                      });
                    }}
                  >
                    <ContentCopyIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              </Box>
            </Box>
          ) : (
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  label="Endpoint URL"
                  size="small"
                  fullWidth
                  placeholder="https://yourapp.com/webhooks/hrms"
                  value={form.url}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, url: e.target.value }))
                  }
                />
              </Grid>
              <Grid item xs={12}>
                <Typography variant="body2" fontWeight={600} gutterBottom>
                  Events to subscribe
                </Typography>
                <FormGroup
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 0,
                  }}
                >
                  {WEBHOOK_EVENTS.map((ev) => (
                    <FormControlLabel
                      key={ev}
                      control={
                        <Checkbox
                          size="small"
                          checked={form.events.includes(ev)}
                          onChange={() => toggleEvent(ev)}
                        />
                      }
                      label={<Typography variant="caption">{ev}</Typography>}
                    />
                  ))}
                </FormGroup>
              </Grid>
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          {newSecret ? (
            <Button
              variant="primary"
              size="small"
              icon={<CheckCircleIcon />}
              onClick={() => {
                setNewSecret(null);
                setOpenCreate(false);
                setForm({ url: "", events: [] });
              }}
              style={{ borderRadius: "8px", textTransform: "none" }}
            >
              Done — I've saved the secret
            </Button>
          ) : (
            <>
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
                disabled={submitting || !form.url || form.events.length === 0}
                style={{ borderRadius: "8px", textTransform: "none" }}
              >
                {submitting ? "Creating…" : "Create Endpoint"}
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default memo(WebhookEndpoints);
