import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Button from "@web/shared/components/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Chip from "@mui/material/Chip";
import BusinessIcon from "@mui/icons-material/Business";
import apiClient from "@web/core/http/axiosConfig";

interface InviteInfo {
  email: string;
  role: string;
  tenant: { id: string; name: string; slug: string };
  expiresAt: string;
}

export default function InvitePage() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setError("Invalid invite link.");
      setLoading(false);
      return;
    }
    apiClient
      .get(`/tenants/invite/${token}`)
      .then((res) => {
        if (res.data?.success) {
          setInfo(res.data.data);
        } else {
          setError(res.data?.message || "Invite not found.");
        }
      })
      .catch(() => setError("Invite not found or has expired."))
      .finally(() => setLoading(false));
  }, [token]);

  const handleAccept = () => {
    // Redirect to Google OAuth with the invite token in the state parameter
    const serverUrl = (import.meta as any).env?.VITE_SERVER_URL || "";
    window.location.href = `${serverUrl}/api/v1/auth/google?invite=${encodeURIComponent(token!)}`;
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        p: 2,
      }}
    >
      <Paper
        elevation={8}
        sx={{ p: 4, maxWidth: 440, width: "100%", borderRadius: 3 }}
      >
        {loading ? (
          <Box sx={{ textAlign: "center", py: 4 }}>
            <CircularProgress />
          </Box>
        ) : error ? (
          <Box sx={{ textAlign: "center" }}>
            <Typography variant="h6" color="error" mb={1}>
              Invite Invalid
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {error}
            </Typography>
          </Box>
        ) : info ? (
          <>
            <Box sx={{ textAlign: "center", mb: 3 }}>
              <BusinessIcon
                sx={{ fontSize: 56, color: "primary.main", mb: 1 }}
              />
              <Typography variant="h5" fontWeight={700}>
                You're invited!
              </Typography>
            </Box>

            <Box sx={{ mb: 3 }}>
              <Typography variant="body2" color="text.secondary" mb={0.5}>
                Organisation
              </Typography>
              <Typography variant="h6" fontWeight={600}>
                {info.tenant.name}
              </Typography>
            </Box>

            <Box sx={{ mb: 3 }}>
              <Typography variant="body2" color="text.secondary" mb={0.5}>
                Invited email
              </Typography>
              <Typography>{info.email}</Typography>
            </Box>

            <Box sx={{ mb: 3 }}>
              <Typography variant="body2" color="text.secondary" mb={0.5}>
                Role
              </Typography>
              <Chip label={info.role} color="primary" variant="outlined" />
            </Box>

            <Button
              variant="primary"
              fullWidth
              size="large"
              onClick={handleAccept}
              style={{ marginTop: 8 }}
            >
              Accept with Google
            </Button>

            <Typography
              variant="caption"
              color="text.secondary"
              display="block"
              textAlign="center"
              mt={2}
            >
              You must sign in with the Google account for{" "}
              <strong>{info.email}</strong>.
              <br />
              Expires {new Date(info.expiresAt).toLocaleDateString()}.
            </Typography>
          </>
        ) : null}
      </Paper>
    </Box>
  );
}
