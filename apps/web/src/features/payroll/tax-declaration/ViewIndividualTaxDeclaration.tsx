import { memo, useContext, useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import Grid from "@mui/material/Grid2";
import Divider from "@mui/material/Divider";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import Button from "@web/shared/components/Button";
import { useParams, useSearchParams } from "react-router-dom";
import apiClient from "@web/core/http/axiosConfig";
import { AlertContext } from "@web/app/providers/AlertContext";
import { API_ENDPOINTS } from "@web/shared/constants";

const LINE_ITEM_LABELS: Record<string, string> = {
  SEC80C: "Section 80C",
  SEC80D_SELF: "Section 80D — Self/family",
  SEC80D_PARENTS: "Section 80D — Parents",
  HOME_LOAN_INTEREST: "Home loan interest (24b)",
  NPS_80CCD1B: "NPS (80CCD(1B))",
  OTHER: "Other",
};

function currentFinancialYear(): string {
  const now = new Date();
  const startYear =
    now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

function ViewIndividualTaxDeclaration() {
  const { userId } = useParams();
  const [searchParams] = useSearchParams();
  const financialYear =
    searchParams.get("financialYear") || currentFinancialYear();
  const { setAlert } = useContext(AlertContext);

  const [loading, setLoading] = useState(true);
  const [declaration, setDeclaration] = useState<any>(null);
  const [revisionDialogOpen, setRevisionDialogOpen] = useState(false);
  const [revisionStage, setRevisionStage] = useState<"declaration" | "proofs">(
    "declaration",
  );
  const [revisionNote, setRevisionNote] = useState("");
  const [acting, setActing] = useState(false);

  async function fetchDeclaration() {
    setLoading(true);
    try {
      const res = await apiClient.get(
        API_ENDPOINTS.GET_DECLARATION_FOR_REVIEW(userId!, financialYear),
      );
      setDeclaration(res.data?.data ?? null);
    } catch (err: any) {
      setAlert({
        open: true,
        message: err?.response?.data?.message ?? "Failed to load declaration.",
        severity: "error",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchDeclaration();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, financialYear]);

  async function reviewDeclaration(decision: "Declared" | "RevisionRequested") {
    setActing(true);
    try {
      await apiClient.post(API_ENDPOINTS.REVIEW_DECLARATION, {
        userId,
        financialYear,
        decision,
        revisionNotes:
          decision === "RevisionRequested"
            ? { general: revisionNote }
            : undefined,
      });
      setAlert({
        open: true,
        message:
          decision === "Declared"
            ? "Declaration approved."
            : "Revision requested.",
        severity: "success",
      });
      setRevisionDialogOpen(false);
      setRevisionNote("");
      await fetchDeclaration();
    } catch (err: any) {
      setAlert({
        open: true,
        message:
          err?.response?.data?.message ?? "Failed to review declaration.",
        severity: "error",
      });
    } finally {
      setActing(false);
    }
  }

  async function reviewProofs(decision: "Verified" | "ProofRevisionRequested") {
    setActing(true);
    try {
      await apiClient.post(API_ENDPOINTS.REVIEW_DECLARATION_PROOFS, {
        userId,
        financialYear,
        decision,
        revisionNotes:
          decision === "ProofRevisionRequested"
            ? { general: revisionNote }
            : undefined,
      });
      setAlert({
        open: true,
        message:
          decision === "Verified"
            ? "Proofs verified."
            : "Proof revision requested.",
        severity: "success",
      });
      setRevisionDialogOpen(false);
      setRevisionNote("");
      await fetchDeclaration();
    } catch (err: any) {
      setAlert({
        open: true,
        message: err?.response?.data?.message ?? "Failed to review proofs.",
        severity: "error",
      });
    } finally {
      setActing(false);
    }
  }

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  if (!declaration) {
    return (
      <Alert severity="info">
        No tax declaration found for FY {financialYear}.
      </Alert>
    );
  }

  const employeeName =
    [declaration.employee?.first_name, declaration.employee?.last_name]
      .filter(Boolean)
      .join(" ") || declaration.employee?.username;

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
        <Typography variant="h6">{employeeName}</Typography>
        <Chip
          size="small"
          label={declaration.status}
          color="primary"
          variant="outlined"
        />
        <Typography variant="body2" color="text.secondary">
          FY {financialYear}
        </Typography>
      </Box>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            HRA
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Monthly rent: ₹{declaration.monthlyRent ?? 0} •{" "}
            {declaration.isMetroCity ? "Metro city" : "Non-metro city"}
          </Typography>

          <Divider sx={{ mb: 2 }} />

          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Chapter VI-A deductions
          </Typography>
          <Grid container spacing={1}>
            {(declaration.lineItems ?? []).map((item: any) => (
              <Grid size={{ xs: 12, sm: 6 }} key={item.code}>
                <Typography variant="body2">
                  {LINE_ITEM_LABELS[item.code] ?? item.code}: ₹
                  {item.declaredAmount ?? 0} declared
                  {item.proofAmount != null
                    ? ` / ₹${item.proofAmount} proven`
                    : ""}
                </Typography>
              </Grid>
            ))}
          </Grid>

          {declaration.revisionNotes && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              {Object.entries(declaration.revisionNotes)
                .map(([field, issue]) => `${field}: ${issue}`)
                .join("; ")}
            </Alert>
          )}

          {declaration.status === "Submitted" && (
            <Box sx={{ display: "flex", gap: 1, mt: 3 }}>
              <Button
                variant="primary"
                onClick={() => reviewDeclaration("Declared")}
                disabled={acting}
              >
                Approve
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setRevisionStage("declaration");
                  setRevisionDialogOpen(true);
                }}
                disabled={acting}
              >
                Request revision
              </Button>
            </Box>
          )}

          {declaration.status === "ProofsSubmitted" && (
            <Box sx={{ display: "flex", gap: 1, mt: 3 }}>
              <Button
                variant="primary"
                onClick={() => reviewProofs("Verified")}
                disabled={acting}
              >
                Verify proofs
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setRevisionStage("proofs");
                  setRevisionDialogOpen(true);
                }}
                disabled={acting}
              >
                Request proof revision
              </Button>
            </Box>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={revisionDialogOpen}
        onClose={() => setRevisionDialogOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>
          {revisionStage === "declaration"
            ? "Request revision"
            : "Request proof revision"}
        </DialogTitle>
        <DialogContent>
          <TextField
            label="What needs to change?"
            fullWidth
            multiline
            minRows={3}
            value={revisionNote}
            onChange={(e) => setRevisionNote(e.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            variant="ghost"
            size="small"
            onClick={() => setRevisionDialogOpen(false)}
            disabled={acting}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="small"
            disabled={acting || !revisionNote.trim()}
            onClick={() =>
              revisionStage === "declaration"
                ? reviewDeclaration("RevisionRequested")
                : reviewProofs("ProofRevisionRequested")
            }
          >
            Send
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default memo(ViewIndividualTaxDeclaration);
