import { memo, useCallback, useContext, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import apiClient from "@web/core/http/axiosConfig";
import { AlertContext } from "@web/app/providers/AlertContext";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import { UserContext } from "@web/app/providers/UserContext";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import Avatar from "@mui/material/Avatar";
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import LockIcon from "@mui/icons-material/Lock";
import { API_ENDPOINTS } from "@web/shared/constants";

const STATUS_OPTIONS = ["open", "in_progress", "resolved", "closed"];

function TicketDetail() {
  const { ticketId } = useParams<{ ticketId: string }>();
  const navigate = useNavigate();
  const { setAlert } = useContext(AlertContext);
  const { theme } = useContext(ThemeContext);
  const { user } = useContext(UserContext);
  const isDark = theme === "dark";

  const [ticket, setTicket] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [editStatus, setEditStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isHr =
    user?.role?.some((r: string) => ["owner", "admin", "hr"].includes(r)) ||
    user?.isSuperUser;

  const load = useCallback(async () => {
    if (!ticketId) return;
    setLoading(true);
    try {
      const res = await apiClient(API_ENDPOINTS.TICKET(ticketId));
      setTicket(res.data.data);
      setEditStatus(res.data.data.status);
    } catch {
      setAlert({
        open: true,
        message: "Failed to load ticket",
        severity: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [ticketId, setAlert]);

  useEffect(() => {
    load();
  }, [load]);

  const handleStatusUpdate = useCallback(async () => {
    setSubmitting(true);
    try {
      await apiClient.patch(API_ENDPOINTS.UPDATE_TICKET(ticketId!), {
        status: editStatus,
      });
      load();
      setAlert({ open: true, message: "Status updated", severity: "success" });
    } catch (err) {
      setAlert({
        open: true,
        message: err?.response?.data?.message || "Update failed",
        severity: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }, [ticketId, editStatus, load, setAlert]);

  const handleAddComment = useCallback(async () => {
    if (!comment.trim()) return;
    setSubmitting(true);
    try {
      await apiClient.post(API_ENDPOINTS.ADD_TICKET_COMMENT(ticketId!), {
        comment,
        isInternal,
      });
      setComment("");
      setIsInternal(false);
      load();
      setAlert({ open: true, message: "Comment added", severity: "success" });
    } catch (err) {
      setAlert({
        open: true,
        message: err?.response?.data?.message || "Failed to add comment",
        severity: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }, [ticketId, comment, isInternal, load, setAlert]);

  if (loading)
    return (
      <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
        <CircularProgress />
      </Box>
    );
  if (!ticket) return null;

  const borderColor = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";

  const PRIORITY_COLORS: Record<string, string> = {
    critical: "#dc2626",
    high: "#d97706",
    medium: "#3b82f6",
    low: "#64748b",
  };

  return (
    <Box sx={{ p: 2, maxWidth: 900, mx: "auto" }}>
      <Button
        startIcon={<ArrowBackIcon />}
        size="small"
        onClick={() => navigate("/helpdesk")}
        sx={{ mb: 2, textTransform: "none" }}
      >
        Back to Tickets
      </Button>

      <Paper
        elevation={0}
        sx={{
          p: 3,
          borderRadius: "12px",
          border: `1px solid ${borderColor}`,
          mb: 2,
        }}
      >
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: 1,
            mb: 2,
          }}
        >
          <Box>
            <Typography
              variant="caption"
              color="text.secondary"
              fontWeight={600}
            >
              {ticket.ticketNo}
            </Typography>
            <Typography variant="h6" fontWeight={700} sx={{ mt: 0.5 }}>
              {ticket.title}
              {ticket.slaBreached && (
                <WarningAmberIcon
                  sx={{
                    fontSize: 18,
                    color: "#dc2626",
                    ml: 1,
                    verticalAlign: "middle",
                  }}
                />
              )}
            </Typography>
          </Box>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            <Chip
              label={ticket.priority}
              size="small"
              sx={{
                backgroundColor: `${PRIORITY_COLORS[ticket.priority] ?? "#64748b"}20`,
                color: PRIORITY_COLORS[ticket.priority] ?? "#64748b",
                fontWeight: 600,
              }}
            />
            <Chip label={ticket.category} size="small" variant="outlined" />
            <Chip
              label={ticket.status.replace(/_/g, " ")}
              size="small"
              sx={{
                backgroundColor: "rgba(99,102,241,0.15)",
                color: "#6366f1",
                fontWeight: 600,
              }}
            />
          </Box>
        </Box>

        <Typography variant="body2" sx={{ mb: 2, lineHeight: 1.7 }}>
          {ticket.description}
        </Typography>

        <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Raised By
            </Typography>
            <Typography variant="body2" fontSize="0.8rem" fontWeight={500}>
              {ticket.raisedBy
                ? `${ticket.raisedBy.first_name ?? ""} ${ticket.raisedBy.last_name ?? ""}`.trim() ||
                  "—"
                : "—"}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Created
            </Typography>
            <Typography variant="body2" fontSize="0.8rem">
              {dayjs(ticket.createdAt).format("DD MMM YYYY, HH:mm")}
            </Typography>
          </Box>
          {ticket.slaDeadline && (
            <Box>
              <Typography variant="caption" color="text.secondary">
                SLA Deadline
              </Typography>
              <Typography
                variant="body2"
                fontSize="0.8rem"
                color={
                  dayjs(ticket.slaDeadline).isBefore(dayjs())
                    ? "error.main"
                    : "text.primary"
                }
              >
                {dayjs(ticket.slaDeadline).format("DD MMM YYYY, HH:mm")}
              </Typography>
            </Box>
          )}
        </Box>

        {/* HR: Update Status */}
        {isHr && (
          <Box sx={{ display: "flex", gap: 1, mt: 2, alignItems: "center" }}>
            <TextField
              select
              label="Update Status"
              size="small"
              value={editStatus}
              onChange={(e) => setEditStatus(e.target.value)}
              sx={{ minWidth: 160 }}
            >
              {STATUS_OPTIONS.map((s) => (
                <MenuItem key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </MenuItem>
              ))}
            </TextField>
            <Button
              size="small"
              variant="contained"
              onClick={handleStatusUpdate}
              disabled={submitting || editStatus === ticket.status}
              sx={{ borderRadius: "8px", textTransform: "none" }}
            >
              Update
            </Button>
          </Box>
        )}
      </Paper>

      {/* Comments */}
      <Paper
        elevation={0}
        sx={{ p: 3, borderRadius: "12px", border: `1px solid ${borderColor}` }}
      >
        <Typography variant="subtitle1" fontWeight={600} gutterBottom>
          Comments ({ticket.comments?.length ?? 0})
        </Typography>

        {ticket.comments?.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No comments yet.
          </Typography>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
            {ticket.comments?.map((c: any) => (
              <Box
                key={c.id}
                sx={{
                  display: "flex",
                  gap: 1.5,
                  backgroundColor: c.isInternal
                    ? isDark
                      ? "rgba(99,102,241,0.1)"
                      : "rgba(99,102,241,0.05)"
                    : "transparent",
                  borderRadius: "8px",
                  p: c.isInternal ? 1.5 : 0,
                  border: c.isInternal
                    ? `1px dashed ${isDark ? "rgba(99,102,241,0.3)" : "rgba(99,102,241,0.2)"}`
                    : "none",
                }}
              >
                <Avatar
                  sx={{
                    width: 32,
                    height: 32,
                    fontSize: "0.8rem",
                    bgcolor: "#6366f1",
                  }}
                >
                  {c.author?.first_name?.[0] ?? "?"}
                </Avatar>
                <Box sx={{ flexGrow: 1 }}>
                  <Box
                    sx={{
                      display: "flex",
                      gap: 1,
                      alignItems: "center",
                      mb: 0.5,
                    }}
                  >
                    <Typography variant="caption" fontWeight={600}>
                      {c.author
                        ? `${c.author.first_name} ${c.author.last_name}`
                        : "Unknown"}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {dayjs(c.createdAt).format("DD MMM, HH:mm")}
                    </Typography>
                    {c.isInternal && (
                      <Chip
                        label="Internal"
                        size="small"
                        icon={<LockIcon />}
                        sx={{
                          height: 18,
                          fontSize: "0.65rem",
                          "& .MuiChip-label": { pl: 0.5, pr: 1 },
                          "& .MuiChip-icon": { fontSize: 12 },
                        }}
                      />
                    )}
                  </Box>
                  <Typography
                    variant="body2"
                    fontSize="0.85rem"
                    sx={{ lineHeight: 1.6 }}
                  >
                    {c.comment}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Box>
        )}

        {ticket.status !== "closed" && (
          <>
            <Divider sx={{ my: 2 }} />
            <Typography variant="body2" fontWeight={600} gutterBottom>
              Add Comment
            </Typography>
            <TextField
              size="small"
              multiline
              rows={3}
              fullWidth
              placeholder="Write a comment…"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                mt: 1,
              }}
            >
              {isHr && (
                <FormControlLabel
                  control={
                    <Switch
                      size="small"
                      checked={isInternal}
                      onChange={(e) => setIsInternal(e.target.checked)}
                    />
                  }
                  label={
                    <Typography variant="caption">
                      Internal note (HR only)
                    </Typography>
                  }
                />
              )}
              <Button
                variant="contained"
                size="small"
                onClick={handleAddComment}
                disabled={submitting || !comment.trim()}
                sx={{ borderRadius: "8px", textTransform: "none", ml: "auto" }}
              >
                {submitting ? "Adding…" : "Add Comment"}
              </Button>
            </Box>
          </>
        )}
      </Paper>
    </Box>
  );
}

export default memo(TicketDetail);
