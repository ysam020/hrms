import {
  useState,
  useEffect,
  useContext,
  cloneElement,
  type ReactElement,
} from "react";
import Container from "@mui/material/Container";
import Paper from "@mui/material/Paper";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Divider from "@mui/material/Divider";
import Button from "@web/shared/components/Button";
import TextField from "@mui/material/TextField";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import SlideUpTransition from "@web/shared/components/SlideUpTransition";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Alert from "@mui/material/Alert";
import BusinessIcon from "@mui/icons-material/Business";
import PhoneIcon from "@mui/icons-material/Phone";
import EmailIcon from "@mui/icons-material/Email";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import LanguageIcon from "@mui/icons-material/Language";
import EditIcon from "@mui/icons-material/Edit";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import apiClient from "@web/core/http/axiosConfig";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import { UserContext } from "@web/app/providers/UserContext";
import { AlertContext } from "@web/app/providers/AlertContext";

interface OrgProfile {
  name: string;
  helpPhone: string | null;
  helpEmail: string | null;
  officeAddress: string | null;
  website: string | null;
}

function InfoRow({
  icon,
  label,
  value,
  href,
}: {
  icon: ReactElement;
  label: string;
  value: string | null | undefined;
  href?: string;
}) {
  if (!value) return null;
  return (
    <Box sx={{ display: "flex", gap: 1.5, alignItems: "flex-start", py: 1.5 }}>
      <Box sx={{ mt: 0.25, flexShrink: 0, display: "flex" }}>
        {cloneElement(icon, {
          sx: { fontSize: 18, color: "primary.main" },
        } as any)}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary" display="block">
          {label}
        </Typography>
        {href ? (
          <Typography
            variant="body2"
            component="a"
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            sx={{
              color: "primary.main",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 0.5,
              "&:hover": { textDecoration: "underline" },
            }}
          >
            {value}
            <OpenInNewIcon sx={{ fontSize: 14 }} />
          </Typography>
        ) : (
          <Typography
            variant="body2"
            fontWeight={500}
            sx={{ wordBreak: "break-word" }}
          >
            {value}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

export default function CompanyInfo() {
  const { user } = useContext(UserContext);
  const { setAlert } = useContext(AlertContext);

  const [profile, setProfile] = useState<OrgProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editWebsite, setEditWebsite] = useState("");

  const canEdit =
    user?.isSuperUser ||
    ["owner", "admin"].includes(user?.tenantRole ?? "") ||
    user?.permissions?.some((p: string) => p.startsWith("CompanyInfo:"));

  useEffect(() => {
    apiClient
      .get(API_ENDPOINTS.ORG_PROFILE)
      .then((res) => {
        if (res.data?.success) setProfile(res.data.data.orgProfile);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const openEdit = () => {
    setEditPhone(profile?.helpPhone ?? "");
    setEditEmail(profile?.helpEmail ?? "");
    setEditAddress(profile?.officeAddress ?? "");
    setEditWebsite(profile?.website ?? "");
    setEditOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await apiClient.put(API_ENDPOINTS.ORG_PROFILE, {
        helpPhone: editPhone || null,
        helpEmail: editEmail || null,
        officeAddress: editAddress || null,
        website: editWebsite || null,
      });
      if (res.data?.success) {
        setProfile(res.data.data.orgProfile);
        setEditOpen(false);
        setAlert({
          open: true,
          message: "Organisation profile updated.",
          severity: "success",
        });
      }
    } catch (err: any) {
      setAlert({
        open: true,
        message: err.response?.data?.message || "Failed to update profile.",
        severity: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const hasAnyContact =
    profile?.helpPhone ||
    profile?.helpEmail ||
    profile?.officeAddress ||
    profile?.website;

  return (
    <Container maxWidth="sm" sx={{ py: 4 }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: 3,
        }}
      >
        <Box>
          <Typography variant="h5" fontWeight={700}>
            Company Information
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Contact details and office information for your organisation.
          </Typography>
        </Box>
        {canEdit && (
          <Button
            variant="outline"
            size="small"
            icon={<EditIcon />}
            onClick={openEdit}
          >
            Edit
          </Button>
        )}
      </Box>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress />
        </Box>
      ) : !profile ? (
        <Alert severity="error">
          Failed to load company info. Please refresh.
        </Alert>
      ) : (
        <Paper elevation={2} sx={{ p: 3 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2 }}>
            <BusinessIcon color="primary" />
            <Typography variant="h6" fontWeight={700}>
              {profile.name}
            </Typography>
          </Box>

          {hasAnyContact ? (
            <>
              <Divider sx={{ mb: 1 }} />
              <InfoRow
                icon={<PhoneIcon />}
                label="Help contact"
                value={profile.helpPhone}
                href={
                  profile.helpPhone ? `tel:${profile.helpPhone}` : undefined
                }
              />
              <InfoRow
                icon={<EmailIcon />}
                label="Help email"
                value={profile.helpEmail}
                href={
                  profile.helpEmail ? `mailto:${profile.helpEmail}` : undefined
                }
              />
              <InfoRow
                icon={<LocationOnIcon />}
                label="Office address"
                value={profile.officeAddress}
              />
              <InfoRow
                icon={<LanguageIcon />}
                label="Website"
                value={profile.website}
                href={profile.website ?? undefined}
              />
            </>
          ) : (
            <Box sx={{ py: 3, textAlign: "center" }}>
              <Typography variant="body2" color="text.secondary">
                {canEdit
                  ? "No contact details added yet. Click Edit to add them."
                  : "Contact details have not been added yet. Please check with your administrator."}
              </Typography>
            </Box>
          )}
        </Paper>
      )}

      <Dialog
        open={editOpen}
        onClose={() => !saving && setEditOpen(false)}
        maxWidth="xs"
        fullWidth
        slots={{ transition: SlideUpTransition }}
        transitionDuration={{ enter: 280, exit: 200 }}
        aria-labelledby="edit-org-dialog-title"
      >
        <DialogTitle id="edit-org-dialog-title">
          Edit Organisation Profile
        </DialogTitle>
        <DialogContent
          sx={{ pt: 2, display: "flex", flexDirection: "column", gap: 2 }}
        >
          <TextField
            label="Help phone number"
            fullWidth
            value={editPhone}
            onChange={(e) => setEditPhone(e.target.value)}
            placeholder="+91 98765 43210"
            size="small"
          />
          <TextField
            label="Help email address"
            fullWidth
            type="email"
            value={editEmail}
            onChange={(e) => setEditEmail(e.target.value)}
            placeholder="hr@yourcompany.com"
            size="small"
          />
          <TextField
            label="Office address"
            fullWidth
            multiline
            rows={2}
            value={editAddress}
            onChange={(e) => setEditAddress(e.target.value)}
            placeholder="123 Main Street, Mumbai, Maharashtra 400001"
            size="small"
          />
          <TextField
            label="Website"
            fullWidth
            value={editWebsite}
            onChange={(e) => setEditWebsite(e.target.value)}
            placeholder="https://yourcompany.com"
            size="small"
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            variant="ghost"
            size="small"
            onClick={() => setEditOpen(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="small"
            onClick={handleSave}
            disabled={saving}
            loading={saving}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
