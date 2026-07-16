import { useCallback, useContext, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Paper from "@mui/material/Paper";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Typography from "@mui/material/Typography";
import Button from "@web/shared/components/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import SaveIcon from "@mui/icons-material/Save";
import ScheduleIcon from "@mui/icons-material/Schedule";
import CancelIcon from "@mui/icons-material/Cancel";
import apiClient from "@web/core/http/axiosConfig";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import { isOwnerOrAdmin } from "@web/shared/utils/permissions/navAccess";
import { API_ENDPOINTS } from "@web/shared/constants";
import ExitPolicySettings from "@web/features/settings/exit-policy/ExitPolicySettings";
import PayrollComponentsSettings from "@web/features/settings/payroll-components/PayrollComponentsSettings";
import RecruitmentPipelineSettings from "@web/features/settings/recruitment-pipeline/RecruitmentPipelineSettings";
import { SCHEMA_DEFAULTS, type SettingsSnapshot } from "./org-settings/types";
import {
  formatDate,
  SUB_TABS,
  SUB_TAB_LS_KEY,
  subTabSlugToIndex,
} from "./org-settings/helpers";
import { TabPanel } from "./org-settings/TabPanel";
import { LeaveSection } from "./org-settings/LeaveSection";
import { AttendanceSection } from "./org-settings/AttendanceSection";
import { GeofencingSection } from "./org-settings/GeofencingSection";
import { HrSection } from "./org-settings/HrSection";
import { WorkWeekSection } from "./org-settings/WorkWeekSection";
import { SaveDialog } from "./org-settings/SaveDialog";

export default function OrgSettings() {
  const { setAlert } = useContext(AlertContext);
  const { user, setUser } = useContext(UserContext);
  const location = useLocation();
  const navigate = useNavigate();

  // Derive the initial sub-tab from ?subtab= (deep links, e.g. from
  // onboarding), falling back to whatever was last used, then "Leave".
  const getInitialSubTab = (): number => {
    const params = new URLSearchParams(location.search);
    const slug = params.get("subtab");
    if (slug) return subTabSlugToIndex(slug);
    const saved = localStorage.getItem(SUB_TAB_LS_KEY);
    return subTabSlugToIndex(saved);
  };

  const [tab, setTab] = useState(getInitialSubTab);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const [active, setActive] = useState<SettingsSnapshot>(SCHEMA_DEFAULTS);
  const [pending, setPending] = useState<SettingsSnapshot[]>([]);
  const [draft, setDraft] = useState<SettingsSnapshot>(SCHEMA_DEFAULTS);
  const [dirty, setDirty] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const canEdit =
    isOwnerOrAdmin(user) ||
    user?.permissions?.includes("Organisation:edit_organisation_settings");

  // ── Fetch ────────────────────────────────────────────────────────────────────

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient.get(API_ENDPOINTS.GET_ORG_SETTINGS);
      const data = res.data?.data ?? {};
      const activeSnap: SettingsSnapshot = {
        ...SCHEMA_DEFAULTS,
        ...(data.active ?? {}),
      };
      setActive(activeSnap);
      setDraft(activeSnap);
      setPending(
        (data.pending ?? []).map((p: any) => ({
          ...SCHEMA_DEFAULTS,
          ...p,
        })),
      );
    } catch {
      // Non-critical — silently fall back to defaults
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Sync sub-tab when the URL changes (back/forward navigation, or a new
  // deep link while already on this page).
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const slug = params.get("subtab");
    if (slug) setTab(subTabSlugToIndex(slug));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  function handleSubTabChange(_: unknown, newValue: number) {
    const slug = SUB_TABS[newValue].slug;
    setTab(newValue);
    localStorage.setItem(SUB_TAB_LS_KEY, slug);
    navigate(`/settings?tab=org-settings&subtab=${slug}`, { replace: true });
  }

  // ── Draft handling ───────────────────────────────────────────────────────────

  function handleChange(patch: Partial<SettingsSnapshot>) {
    setDraft((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  }

  // ── Save ─────────────────────────────────────────────────────────────────────

  async function handleSaveConfirm(effectiveFrom: Date, note: string) {
    setSaving(true);
    try {
      await apiClient.put(API_ENDPOINTS.UPDATE_ORG_SETTINGS, {
        settings: draft,
        effectiveFrom: effectiveFrom.toISOString(),
        note: note || undefined,
      });
      setAlert({
        open: true,
        message:
          effectiveFrom <= new Date()
            ? "Settings applied immediately."
            : `Settings scheduled for ${formatDate(effectiveFrom.toISOString())}.`,
        severity: "success",
      });
      setDialogOpen(false);
      setDirty(false);
      await fetchSettings();
      // wfhEnabled (and any other profile-bolted tenant settings) are only
      // refreshed on login/page load otherwise — without this, an immediate
      // change (e.g. disabling WFH) wouldn't be reflected in UserContext
      // until the current session's next reload, leaving stale nav/route
      // gating for everyone already logged in, including the person who
      // just made the change.
      if (effectiveFrom <= new Date()) {
        try {
          const profileRes = await apiClient.get(API_ENDPOINTS.GET_PROFILE);
          if (profileRes.data?.success) setUser(profileRes.data.data.user);
        } catch {
          // Non-critical — the setting was still saved successfully.
        }
      }
    } catch (err: any) {
      setAlert({
        open: true,
        message: err?.response?.data?.message ?? "Failed to save settings.",
        severity: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  // ── Cancel pending ───────────────────────────────────────────────────────────

  async function handleCancelPending(id: string) {
    setCancelling(id);
    try {
      await apiClient.delete(API_ENDPOINTS.CANCEL_PENDING_ORG_SETTINGS(id));
      setAlert({
        open: true,
        message: "Pending settings change cancelled.",
        severity: "info",
      });
      await fetchSettings();
    } catch (err: any) {
      setAlert({
        open: true,
        message:
          err?.response?.data?.message ?? "Failed to cancel pending change.",
        severity: "error",
      });
    } finally {
      setCancelling(null);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          mb: 3,
          flexWrap: "wrap",
          gap: 2,
        }}
      >
        <Box>
          <Typography variant="h5" fontWeight={700}>
            Organisation Settings
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Configure leave quotas, attendance rules, and HR policies.
            {active.effectiveFrom && (
              <Typography
                component="span"
                variant="body2"
                color="text.secondary"
              >
                {" "}
                Active since <strong>{formatDate(active.effectiveFrom)}</strong>
                .
              </Typography>
            )}
          </Typography>
        </Box>
        {canEdit && (
          <Button
            variant="primary"
            size="small"
            icon={<SaveIcon />}
            onClick={() => setDialogOpen(true)}
            disabled={!dirty}
          >
            Save changes
          </Button>
        )}
      </Box>

      {/* Read-only notice */}
      {!canEdit && (
        <Alert severity="info" sx={{ mb: 2 }}>
          You have read-only access. Contact an owner or admin to make changes.
        </Alert>
      )}

      {/* Pending changes banner */}
      {pending.length > 0 && (
        <Box sx={{ mb: 2, display: "flex", flexDirection: "column", gap: 1 }}>
          {pending.map((p) => (
            <Alert
              key={p.id}
              severity="warning"
              icon={<ScheduleIcon fontSize="inherit" />}
              action={
                canEdit ? (
                  <Button
                    variant="danger"
                    size="small"
                    icon={<CancelIcon fontSize="small" />}
                    loading={cancelling === p.id}
                    disabled={cancelling === p.id}
                    onClick={() => handleCancelPending(p.id!)}
                  >
                    Cancel
                  </Button>
                ) : undefined
              }
            >
              <strong>Pending change</strong> scheduled for{" "}
              <strong>{formatDate(p.effectiveFrom)}</strong>
              {p.note ? ` — ${p.note}` : ""}
            </Alert>
          ))}
        </Box>
      )}

      <Paper elevation={0} variant="outlined" sx={{ borderRadius: 2 }}>
        <Tabs
          value={tab}
          onChange={handleSubTabChange}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ px: 2, borderBottom: 1, borderColor: "divider" }}
        >
          {SUB_TABS.map((t, i) => (
            <Tab
              key={i}
              label={t.label}
              icon={t.icon}
              iconPosition="start"
              sx={{ textTransform: "none", fontWeight: 500, minHeight: 48 }}
            />
          ))}
        </Tabs>

        <Box sx={{ p: 3 }}>
          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
              <CircularProgress />
            </Box>
          ) : (
            <>
              <TabPanel value={tab} index={0}>
                <LeaveSection
                  settings={draft}
                  onChange={handleChange}
                  readOnly={!canEdit}
                />
              </TabPanel>
              <TabPanel value={tab} index={1}>
                <AttendanceSection
                  settings={draft}
                  onChange={handleChange}
                  readOnly={!canEdit}
                />
                <GeofencingSection
                  settings={draft}
                  onChange={handleChange}
                  readOnly={!canEdit}
                />
              </TabPanel>
              <TabPanel value={tab} index={2}>
                <HrSection
                  settings={draft}
                  onChange={handleChange}
                  readOnly={!canEdit}
                />
              </TabPanel>
              <TabPanel value={tab} index={3}>
                <WorkWeekSection
                  settings={draft}
                  onChange={handleChange}
                  readOnly={!canEdit}
                />
              </TabPanel>
              <TabPanel value={tab} index={4}>
                <ExitPolicySettings />
              </TabPanel>
              <TabPanel value={tab} index={5}>
                <PayrollComponentsSettings />
              </TabPanel>
              <TabPanel value={tab} index={6}>
                <RecruitmentPipelineSettings />
              </TabPanel>
            </>
          )}
        </Box>
      </Paper>

      <SaveDialog
        open={dialogOpen}
        saving={saving}
        onCancel={() => setDialogOpen(false)}
        onConfirm={handleSaveConfirm}
      />
    </Container>
  );
}
