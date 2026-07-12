import { useState, useEffect, useCallback, useContext } from "react";
import Container from "@mui/material/Container";
import Paper from "@mui/material/Paper";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import CircularProgress from "@mui/material/CircularProgress";
import PeopleIcon from "@mui/icons-material/People";
import Button from "@web/shared/components/Button";
import apiClient from "@web/core/http/axiosConfig";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import { AlertContext } from "@web/app/providers/AlertContext";

interface JoinRequest {
  id: string;
  userId: string;
  name: string;
  email: string;
  status: string;
  createdAt: string;
}

export default function JoinRequests() {
  const { setAlert } = useContext(AlertContext);
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get(API_ENDPOINTS.JOIN_REQUESTS);
      if (res.data?.success) {
        setRequests(res.data.data.requests ?? []);
      }
    } catch {
      // non-fatal — empty state renders on failure
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleDecision = async (id: string, decision: "approve" | "reject") => {
    setActingId(id);
    try {
      const res = await apiClient.post(
        `${API_ENDPOINTS.JOIN_REQUESTS}/${id}/${decision}`,
      );
      if (res.data?.success) {
        setAlert({
          open: true,
          message:
            decision === "approve" ? "Request approved." : "Request rejected.",
          severity: "success",
        });
        setRequests((prev) => prev.filter((r) => r.id !== id));
      } else {
        setAlert({
          open: true,
          message: res.data?.message || "Failed to update request.",
          severity: "error",
        });
      }
    } catch (err: any) {
      setAlert({
        open: true,
        message: err.response?.data?.message || "Failed to update request.",
        severity: "error",
      });
    } finally {
      setActingId(null);
    }
  };

  return (
    <Container maxWidth="md" sx={{ py: 3 }}>
      <Paper sx={{ p: 3, borderRadius: 2 }}>
        <Typography variant="h6" fontWeight={700} sx={{ mb: 0.5 }}>
          Join Requests
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          People whose email domain matches your organisation can request to
          join. Approving adds them as an employee.
        </Typography>

        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress size={28} />
          </Box>
        ) : requests.length === 0 ? (
          <Box sx={{ textAlign: "center", py: 4, opacity: 0.7 }}>
            <PeopleIcon sx={{ fontSize: 36, mb: 1 }} />
            <Typography variant="body2">No pending requests.</Typography>
          </Box>
        ) : (
          <List disablePadding>
            {requests.map((r) => (
              <ListItem
                key={r.id}
                disableGutters
                sx={{
                  py: 1.5,
                  borderBottom: "1px solid var(--text-input-border)",
                  display: "flex",
                  gap: 2,
                }}
              >
                <ListItemText primary={r.name || r.email} secondary={r.email} />
                <Box sx={{ display: "flex", gap: 1, flexShrink: 0 }}>
                  <Button
                    variant="outline"
                    size="small"
                    disabled={actingId === r.id}
                    loading={actingId === r.id}
                    onClick={() => handleDecision(r.id, "reject")}
                    style={{ textTransform: "none" }}
                  >
                    Reject
                  </Button>
                  <Button
                    variant="primary"
                    size="small"
                    disabled={actingId === r.id}
                    loading={actingId === r.id}
                    onClick={() => handleDecision(r.id, "approve")}
                    style={{ textTransform: "none" }}
                  >
                    Approve
                  </Button>
                </Box>
              </ListItem>
            ))}
          </List>
        )}
      </Paper>
    </Container>
  );
}
