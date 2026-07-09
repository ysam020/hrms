import { useContext, useState } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Avatar from "@mui/material/Avatar";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Skeleton from "@mui/material/Skeleton";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import InboxIcon from "@mui/icons-material/Inbox";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import useFetchData from "@web/shared/hooks/useFetchData";
import apiClient from "@web/core/http/axiosConfig";
import { AlertContext } from "@web/app/providers/AlertContext";
import { API_ENDPOINTS } from "@web/shared/constants";

dayjs.extend(relativeTime);

interface PendingApprovalItem {
  instanceId: string;
  module: string;
  entityId: string;
  stepOrder: number;
  requestedBy: string;
  requestedByName: string;
  createdAt: string;
  summary: string;
  detail: Record<string, unknown>;
}

const MODULE_LABELS: Record<string, string> = {
  leave: "Leave",
  resignation: "Resignation",
  overtime: "Overtime",
  wfh: "WFH",
  salary_advance: "Salary Advance",
};

function initialsOf(name: string): string {
  return name
    .split(/[.\s]+/)
    .map((p) => p[0]?.toUpperCase())
    .filter(Boolean)
    .slice(0, 2)
    .join("");
}

/**
 * Cross-module inbox of everything awaiting the current user's decision —
 * driven by GET /approvals/pending, which resolves against the tenant's
 * configured Approval Chain (or the zero-config reporting-manager default).
 * A non-superuser reporting manager has no other page that surfaces a
 * direct report's pending leave/resignation, since the module-specific list
 * views (ViewResignations, leave applications) only show a user's own rows
 * unless they're a superuser — this page is that missing surface.
 */
function ApprovalsInbox() {
  const { setAlert } = useContext(AlertContext);
  const { data, loading, refetch } = useFetchData<PendingApprovalItem[]>(
    API_ENDPOINTS.GET_PENDING_APPROVALS,
    "get",
    [],
  );
  const items = Array.isArray(data) ? data : [];

  const [decision, setDecision] = useState<{
    instanceId: string;
    mode: "approved" | "rejected";
    summary: string;
  } | null>(null);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  const closeDialog = () => {
    setDecision(null);
    setComment("");
  };

  const submitDecision = async () => {
    if (!decision) return;
    setSaving(true);
    try {
      await apiClient.put(API_ENDPOINTS.ACT_ON_APPROVAL(decision.instanceId), {
        decision: decision.mode,
        comment: comment || undefined,
      });
      setAlert({
        open: true,
        message:
          decision.mode === "approved"
            ? "Request approved."
            : "Request rejected.",
        severity: "success",
      });
      closeDialog();
      refetch();
    } catch (err: any) {
      setAlert({
        open: true,
        message: err?.response?.data?.message ?? "Something went wrong.",
        severity: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 820, mx: "auto" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2 }}>
        <InboxIcon color="action" />
        <Typography variant="h6" fontWeight={700}>
          Pending Approvals
        </Typography>
        {!loading && items.length > 0 && (
          <Chip size="small" label={items.length} color="warning" />
        )}
      </Box>

      {loading ? (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          {[...Array(3)].map((_, i) => (
            <Paper key={i} variant="outlined" sx={{ p: 2 }}>
              <Skeleton height={20} width="60%" />
              <Skeleton height={16} width="35%" sx={{ mt: 0.5 }} />
            </Paper>
          ))}
        </Box>
      ) : items.length === 0 ? (
        <Paper
          variant="outlined"
          sx={{
            p: 4,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 1,
          }}
        >
          <CheckCircleOutlineIcon
            sx={{ fontSize: 36, color: "success.main" }}
          />
          <Typography color="text.secondary">
            Nothing waiting on you right now.
          </Typography>
        </Paper>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          {items.map((item) => (
            <Paper
              key={item.instanceId}
              variant="outlined"
              sx={{
                p: 2,
                display: "flex",
                alignItems: "flex-start",
                gap: 1.5,
              }}
            >
              <Avatar sx={{ width: 36, height: 36, fontSize: "0.85rem" }}>
                {initialsOf(item.requestedByName || "?")}
              </Avatar>

              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    mb: 0.25,
                  }}
                >
                  <Chip
                    size="small"
                    label={MODULE_LABELS[item.module] ?? item.module}
                    variant="outlined"
                    sx={{ height: 20, fontSize: "0.7rem" }}
                  />
                  {item.stepOrder > 1 && (
                    <Chip
                      size="small"
                      label={`Step ${item.stepOrder}`}
                      color="info"
                      variant="outlined"
                      sx={{ height: 20, fontSize: "0.7rem" }}
                    />
                  )}
                </Box>
                <Typography variant="body2" fontWeight={600}>
                  {item.summary}
                </Typography>
                {item.createdAt && (
                  <Typography variant="caption" color="text.secondary">
                    {dayjs(item.createdAt).fromNow()}
                  </Typography>
                )}
              </Box>

              <Box sx={{ display: "flex", gap: 0.5, flexShrink: 0 }}>
                <Tooltip title="Approve">
                  <IconButton
                    size="small"
                    color="success"
                    aria-label={`Approve ${item.summary}`}
                    onClick={() =>
                      setDecision({
                        instanceId: item.instanceId,
                        mode: "approved",
                        summary: item.summary,
                      })
                    }
                  >
                    <CheckIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Reject">
                  <IconButton
                    size="small"
                    color="error"
                    aria-label={`Reject ${item.summary}`}
                    onClick={() =>
                      setDecision({
                        instanceId: item.instanceId,
                        mode: "rejected",
                        summary: item.summary,
                      })
                    }
                  >
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
            </Paper>
          ))}
        </Box>
      )}

      <Dialog open={!!decision} onClose={closeDialog} fullWidth maxWidth="sm">
        <DialogTitle>
          {decision?.mode === "approved" ? "Approve request" : "Reject request"}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {decision?.summary}
          </Typography>
          <TextField
            label="Comment (optional)"
            size="small"
            fullWidth
            multiline
            rows={2}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={closeDialog} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color={decision?.mode === "approved" ? "primary" : "error"}
            onClick={submitDecision}
            disabled={saving}
            startIcon={
              saving ? (
                <CircularProgress size={16} color="inherit" />
              ) : undefined
            }
          >
            {saving
              ? "Saving…"
              : decision?.mode === "approved"
                ? "Approve"
                : "Reject"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default ApprovalsInbox;
