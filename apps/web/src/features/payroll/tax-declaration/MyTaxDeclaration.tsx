import { memo, useContext, useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import Grid from "@mui/material/Grid2";
import Divider from "@mui/material/Divider";
import Button from "@web/shared/components/Button";
import { numField } from "@web/shared/components/numField";
import apiClient from "@web/core/http/axiosConfig";
import { AlertContext } from "@web/app/providers/AlertContext";
import { API_ENDPOINTS } from "@web/shared/constants";

const LINE_ITEM_DEFS = [
  {
    code: "SEC80C",
    label: "Section 80C — PF, ELSS, life insurance, PPF, etc.",
    cap: 150000,
  },
  {
    code: "SEC80D_SELF",
    label: "Section 80D — Health insurance (self/family)",
    cap: 25000,
  },
  {
    code: "SEC80D_PARENTS",
    label: "Section 80D — Health insurance (parents)",
    cap: 25000,
  },
  {
    code: "HOME_LOAN_INTEREST",
    label: "Home loan interest — Section 24(b)",
    cap: 200000,
  },
  { code: "NPS_80CCD1B", label: "NPS — Section 80CCD(1B)", cap: 50000 },
  { code: "OTHER", label: "Other (80G, etc.)", cap: null },
];

function currentFinancialYear(): string {
  const now = new Date();
  const startYear =
    now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

const EMPTY_LINE_ITEMS = () =>
  LINE_ITEM_DEFS.map((d) => ({ code: d.code, declaredAmount: 0 }));

type Declaration = {
  status: string | null;
  financialYear: string;
  monthlyRent?: number | null;
  isMetroCity?: boolean | null;
  lineItems?: { code: string; declaredAmount: number; proofAmount?: number }[];
  revisionNotes?: Record<string, string> | null;
};

function money(v: number | null | undefined) {
  return `₹${(v ?? 0).toLocaleString("en-IN")}`;
}

function MyTaxDeclaration() {
  const { setAlert } = useContext(AlertContext);
  const financialYear = useMemo(() => currentFinancialYear(), []);

  const [loading, setLoading] = useState(true);
  const [declaration, setDeclaration] = useState<Declaration | null>(null);
  const [monthlyRent, setMonthlyRent] = useState(0);
  const [isMetroCity, setIsMetroCity] = useState(false);
  const [lineItems, setLineItems] = useState(EMPTY_LINE_ITEMS());
  const [proofAmounts, setProofAmounts] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  async function fetchDeclaration() {
    setLoading(true);
    try {
      const res = await apiClient.get(
        API_ENDPOINTS.GET_MY_DECLARATION(financialYear),
      );
      const d: Declaration = res.data?.data ?? { status: null, financialYear };
      setDeclaration(d);
      setMonthlyRent(d.monthlyRent ?? 0);
      setIsMetroCity(!!d.isMetroCity);
      if (d.lineItems?.length) {
        setLineItems(
          LINE_ITEM_DEFS.map((def) => {
            const existing = d.lineItems!.find((i) => i.code === def.code);
            return {
              code: def.code,
              declaredAmount: existing?.declaredAmount ?? 0,
            };
          }),
        );
        const proofs: Record<string, number> = {};
        for (const i of d.lineItems!) proofs[i.code] = i.proofAmount ?? 0;
        setProofAmounts(proofs);
      }
    } catch (err: any) {
      setAlert({
        open: true,
        message:
          err?.response?.data?.message ??
          "Failed to load your tax declaration.",
        severity: "error",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchDeclaration();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function switchToOldRegime() {
    setSaving(true);
    try {
      await apiClient.post(API_ENDPOINTS.SAVE_DRAFT_DECLARATION, {
        financialYear,
        lineItems: EMPTY_LINE_ITEMS(),
      });
      await fetchDeclaration();
    } catch (err: any) {
      setAlert({
        open: true,
        message:
          err?.response?.data?.message ?? "Failed to start a declaration.",
        severity: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  async function saveDraft() {
    setSaving(true);
    try {
      await apiClient.post(API_ENDPOINTS.SAVE_DRAFT_DECLARATION, {
        financialYear,
        monthlyRent,
        isMetroCity,
        lineItems,
      });
      setAlert({ open: true, message: "Draft saved.", severity: "success" });
      await fetchDeclaration();
    } catch (err: any) {
      setAlert({
        open: true,
        message: err?.response?.data?.message ?? "Failed to save draft.",
        severity: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  async function submit() {
    setSaving(true);
    try {
      await saveDraftSilently();
      await apiClient.post(API_ENDPOINTS.SUBMIT_DECLARATION, { financialYear });
      setAlert({
        open: true,
        message: "Declaration submitted for review.",
        severity: "success",
      });
      await fetchDeclaration();
    } catch (err: any) {
      setAlert({
        open: true,
        message:
          err?.response?.data?.message ?? "Failed to submit declaration.",
        severity: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  async function saveDraftSilently() {
    await apiClient.post(API_ENDPOINTS.SAVE_DRAFT_DECLARATION, {
      financialYear,
      monthlyRent,
      isMetroCity,
      lineItems,
    });
  }

  async function submitProofs() {
    setSaving(true);
    try {
      await apiClient.post(API_ENDPOINTS.SUBMIT_DECLARATION_PROOFS, {
        financialYear,
        proofs: proofAmounts,
      });
      setAlert({
        open: true,
        message: "Proofs submitted for verification.",
        severity: "success",
      });
      await fetchDeclaration();
    } catch (err: any) {
      setAlert({
        open: true,
        message: err?.response?.data?.message ?? "Failed to submit proofs.",
        severity: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  const status = declaration?.status ?? null;
  const editable =
    status === null || status === "Draft" || status === "RevisionRequested";
  const canSubmitProofs =
    status === "Declared" || status === "ProofRevisionRequested";

  return (
    <Box>
      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="body2" color="text.secondary">
            You're on the <strong>New Regime</strong> by default for FY{" "}
            {financialYear} — no declarations needed. Opting into the{" "}
            <strong>Old Regime</strong> lets you declare 80C/80D/HRA/home-loan
            exemptions, which can lower your monthly TDS if you have them.
          </Typography>
        </CardContent>
      </Card>

      {status === null && (
        <Button variant="primary" onClick={switchToOldRegime} disabled={saving}>
          Switch to Old Regime for FY {financialYear}
        </Button>
      )}

      {status === "RevisionRequested" && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          HR requested a revision:{" "}
          {Object.entries(declaration?.revisionNotes ?? {})
            .map(([field, issue]) => `${field}: ${issue}`)
            .join("; ") || "See the fields below and resubmit."}
        </Alert>
      )}
      {status === "Submitted" && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Your declaration is submitted and awaiting HR review.
        </Alert>
      )}
      {status === "Declared" && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Your declaration was approved. Submit proofs below (typically in
          Jan-Feb) to keep the exemptions applied for the full year.
        </Alert>
      )}
      {status === "ProofRevisionRequested" && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          HR requested a revision to your proofs:{" "}
          {Object.entries(declaration?.revisionNotes ?? {})
            .map(([field, issue]) => `${field}: ${issue}`)
            .join("; ") || "See the fields below and resubmit."}
        </Alert>
      )}
      {status === "ProofsSubmitted" && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Your proofs are submitted and awaiting verification.
        </Alert>
      )}
      {status === "Verified" && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Your proofs are verified for FY {financialYear}.
        </Alert>
      )}

      {status !== null && (
        <Card variant="outlined">
          <CardContent>
            <Typography variant="subtitle2" sx={{ mb: 2 }}>
              HRA exemption
            </Typography>
            <Grid container spacing={2} sx={{ mb: 2 }}>
              <Grid size={{ xs: 6 }}>
                {numField("Monthly rent paid", monthlyRent, setMonthlyRent, {
                  min: 0,
                  suffix: "₹",
                  disabled: !editable,
                })}
              </Grid>
              <Grid size={{ xs: 6 }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={isMetroCity}
                      disabled={!editable}
                      onChange={(e) => setIsMetroCity(e.target.checked)}
                    />
                  }
                  label={
                    <Typography variant="body2">
                      Metro city (Delhi/Mumbai/Kolkata/Chennai)
                    </Typography>
                  }
                />
              </Grid>
            </Grid>

            <Divider sx={{ mb: 2 }} />

            <Typography variant="subtitle2" sx={{ mb: 2 }}>
              Chapter VI-A deductions
            </Typography>
            <Grid container spacing={2}>
              {LINE_ITEM_DEFS.map((def, i) => (
                <Grid size={{ xs: 12, sm: 6 }} key={def.code}>
                  {numField(
                    `${def.label}${def.cap ? ` (up to ₹${def.cap.toLocaleString("en-IN")})` : ""}`,
                    lineItems[i]?.declaredAmount ?? 0,
                    (v) =>
                      setLineItems((items) =>
                        items.map((it, idx) =>
                          idx === i ? { ...it, declaredAmount: v } : it,
                        ),
                      ),
                    { min: 0, suffix: "₹", disabled: !editable },
                  )}
                </Grid>
              ))}
            </Grid>

            {editable && (
              <Box sx={{ display: "flex", gap: 1, mt: 3 }}>
                <Button
                  variant="secondary"
                  onClick={saveDraft}
                  disabled={saving}
                >
                  Save draft
                </Button>
                <Button variant="primary" onClick={submit} disabled={saving}>
                  Submit for review
                </Button>
              </Box>
            )}

            {canSubmitProofs && (
              <>
                <Divider sx={{ my: 3 }} />
                <Typography variant="subtitle2" sx={{ mb: 2 }}>
                  Submit proofs
                </Typography>
                <Grid container spacing={2}>
                  {LINE_ITEM_DEFS.filter(
                    (def) =>
                      (lineItems.find((li) => li.code === def.code)
                        ?.declaredAmount ?? 0) > 0,
                  ).map((def) => (
                    <Grid size={{ xs: 12, sm: 6 }} key={def.code}>
                      {numField(
                        `${def.label} — proven amount`,
                        proofAmounts[def.code] ?? 0,
                        (v) =>
                          setProofAmounts((p) => ({ ...p, [def.code]: v })),
                        { min: 0, suffix: "₹" },
                      )}
                    </Grid>
                  ))}
                </Grid>
                <Box sx={{ mt: 3 }}>
                  <Button
                    variant="primary"
                    onClick={submitProofs}
                    disabled={saving}
                  >
                    Submit proofs
                  </Button>
                </Box>
              </>
            )}

            {status && !editable && !canSubmitProofs && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                Declared:{" "}
                {money(
                  lineItems.reduce((s, li) => s + (li.declaredAmount ?? 0), 0),
                )}{" "}
                across all sections.
              </Typography>
            )}
          </CardContent>
        </Card>
      )}
    </Box>
  );
}

export default memo(MyTaxDeclaration);
