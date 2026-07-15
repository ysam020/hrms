/**
 * OnboardingModals
 *
 * A setup checklist shown to new tenant owners/admins as a sequence of
 * modals, one per unresolved item. Each item has "Set up now" (navigates to
 * the relevant Settings page and marks it complete) and "Skip for now"
 * (marks it skipped and moves to the next unresolved item).
 *
 * Completion state is server-side (OnboardingChecklistState, one row per
 * tenant) so a second admin logging in on another device doesn't see items
 * a colleague already resolved. A localStorage cache is kept purely to avoid
 * a loading flash on first paint — it's reconciled against the server
 * response immediately after fetch.
 *
 * This is a nudge, never a gate: every linked Settings page stays reachable
 * from the sidebar regardless of skip/complete state.
 */

import { useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import Dialog from "@mui/material/Dialog";
import SlideUpTransition from "@web/shared/components/SlideUpTransition";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@web/shared/components/Button";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Alert from "@mui/material/Alert";
import Stepper from "@mui/material/Stepper";
import Step from "@mui/material/Step";
import StepLabel from "@mui/material/StepLabel";
import ApartmentIcon from "@mui/icons-material/Apartment";
import TuneIcon from "@mui/icons-material/Tune";
import SettingsIcon from "@mui/icons-material/Settings";
import EventAvailableIcon from "@mui/icons-material/EventAvailable";
import GavelIcon from "@mui/icons-material/Gavel";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import WorkIcon from "@mui/icons-material/Work";
import PaymentsIcon from "@mui/icons-material/Payments";
import { UserContext } from "@web/app/providers/UserContext";
import { isOwnerOrAdmin } from "@web/shared/utils/permissions/navAccess";
import apiClient from "@web/core/http/axiosConfig";
import { API_ENDPOINTS } from "@web/shared/constants";

// ─── Step definitions ─────────────────────────────────────────────────────────

type ItemStatus = "completed" | "skipped";

interface OnboardingStep {
  key: string;
  shortLabel: string;
  title: string;
  description: string;
  icon: ReactNode;
  actionLabel: string;
  skipLabel: string;
  route: string;
  hint: string; // shown in the consolidated post-skip hint dialog
}

const STEPS: OnboardingStep[] = [
  {
    key: "company_info",
    shortLabel: "Company",
    title: "Set up your company profile",
    description:
      "Add your organisation's contact details — help phone, email, office address, and website — so your employees can find key info in one place.",
    icon: <ApartmentIcon sx={{ fontSize: 48, color: "primary.main" }} />,
    actionLabel: "Set up company info",
    skipLabel: "I'll do it later",
    route: "/settings",
    hint: "Company Info is under Settings in the sidebar, anytime.",
  },
  {
    key: "org_settings",
    shortLabel: "Org Settings",
    title: "Configure organisation settings",
    description:
      "Define your leave policies, attendance rules, probation & notice periods, and more. Sensible defaults are already applied — adjust only what's different for you.",
    icon: <TuneIcon sx={{ fontSize: 48, color: "primary.main" }} />,
    actionLabel: "Configure settings",
    skipLabel: "I'll do it later",
    route: "/settings?tab=org-settings",
    hint: "Organisation Settings is under Settings in the sidebar, anytime.",
  },
  {
    key: "leave_policy",
    shortLabel: "Leave",
    title: "Review your leave policy",
    description:
      "Carry-forward, encashment, comp-off, and what happens when someone applies for more leave than they have — all optional, all pre-filled with sensible defaults.",
    icon: <EventAvailableIcon sx={{ fontSize: 48, color: "primary.main" }} />,
    actionLabel: "Review leave policy",
    skipLabel: "Defaults are fine",
    route: "/settings?tab=org-settings",
    hint: "Leave policy lives under Settings → Organisation Settings, anytime.",
  },
  {
    key: "exit_policy",
    shortLabel: "Exit Policy",
    title: "Set your notice period & exit checklist",
    description:
      "Notice periods by tenure, an offboarding clearance checklist, and exit interview questions. Until configured, every resignation uses a flat 30-day notice.",
    icon: <GavelIcon sx={{ fontSize: 48, color: "primary.main" }} />,
    actionLabel: "Set up exit policy",
    skipLabel: "I'll do it later",
    route: "/settings?tab=org-settings&subtab=exit-policy",
    hint: "Exit Policy is under Settings → Organisation Settings, anytime.",
  },
  {
    key: "approvals",
    shortLabel: "Approvals",
    title: "Set up approval workflows",
    description:
      "Leave and resignation requests route to the reporting manager by default. Add multi-level approval here if your organisation needs it.",
    icon: <AccountTreeIcon sx={{ fontSize: 48, color: "primary.main" }} />,
    actionLabel: "Configure approvals",
    skipLabel: "Default is fine",
    route: "/settings?tab=approvals",
    hint: "Approval Workflow is under Settings in the sidebar, anytime.",
  },
  {
    key: "recruitment_pipeline",
    shortLabel: "Hiring",
    title: "Customize your interview pipeline",
    description:
      "A standard 3-round pipeline (screening, technical, HR) is ready to use — customize the stages if your hiring process differs.",
    icon: <WorkIcon sx={{ fontSize: 48, color: "primary.main" }} />,
    actionLabel: "Set up pipeline",
    skipLabel: "Standard pipeline is fine",
    route: "/settings?tab=org-settings&subtab=recruitment-pipeline",
    hint: "Recruitment Pipeline is under Settings → Organisation Settings, anytime.",
  },
  {
    key: "payroll_components",
    shortLabel: "Payroll",
    title: "Review payroll components",
    description:
      "Standard salary components (Basic, HRA, PF, ESI, PT) are pre-loaded — add custom components or state-wise Professional Tax slabs here.",
    icon: <PaymentsIcon sx={{ fontSize: 48, color: "primary.main" }} />,
    actionLabel: "Review payroll setup",
    skipLabel: "Defaults are fine",
    route: "/settings?tab=org-settings&subtab=payroll-components",
    hint: "Payroll Components is under Settings → Organisation Settings, anytime.",
  },
];

// ─── localStorage cache (instant paint only — server is the source of truth) ──

function cacheKey(tenantId: string) {
  return `onboarding_checklist_${tenantId}`;
}

function readCache(tenantId: string): Record<string, ItemStatus> {
  try {
    const raw = localStorage.getItem(cacheKey(tenantId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeCache(tenantId: string, itemStatus: Record<string, ItemStatus>) {
  try {
    localStorage.setItem(cacheKey(tenantId), JSON.stringify(itemStatus));
  } catch {
    /* ignore */
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function OnboardingModals() {
  const { user } = useContext(UserContext);
  const navigate = useNavigate();

  const [itemStatus, setItemStatus] = useState<Record<string, ItemStatus>>({});
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [skippedHint, setSkippedHint] = useState<string | null>(null);
  const [hintOpen, setHintOpen] = useState(false);

  const isEligible = isOwnerOrAdmin(user);

  // Instant paint from cache, then reconcile against the server.
  useEffect(() => {
    if (!user?.tenantId || !isEligible) return;
    setItemStatus(readCache(user.tenantId));

    apiClient
      .get(API_ENDPOINTS.GET_ONBOARDING_CHECKLIST)
      .then((res) => {
        const serverStatus = res.data?.data?.itemStatus ?? {};
        setItemStatus(serverStatus);
        writeCache(user.tenantId, serverStatus);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId, isEligible]);

  const unresolved = STEPS.filter((s) => !itemStatus[s.key]);

  // Auto-open exactly once per mount — re-running this on every unresolved.length
  // change would reopen the modal 1200ms after the user navigates away via
  // "Set up now", right on top of the settings page they asked to see.
  const hasAutoOpened = useRef(false);
  useEffect(() => {
    if (!loaded || !isEligible || hasAutoOpened.current) return;
    if (unresolved.length > 0) {
      hasAutoOpened.current = true;
      const id = setTimeout(() => setOpen(true), 1200);
      return () => clearTimeout(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, isEligible]);

  if (!isEligible || unresolved.length === 0) return null;

  const currentStep = unresolved[0];

  async function markStep(key: string, status: ItemStatus) {
    const next = { ...itemStatus, [key]: status };
    setItemStatus(next);
    if (user?.tenantId) writeCache(user.tenantId, next);
    try {
      await apiClient.put(API_ENDPOINTS.UPDATE_ONBOARDING_CHECKLIST_ITEM(key), {
        status,
      });
    } catch {
      // Non-critical — the item will just re-offer next session if this failed.
    }
  }

  const handleAction = async () => {
    await markStep(currentStep.key, "completed");
    setOpen(false);
    navigate(currentStep.route);
  };

  const handleSkip = async () => {
    await markStep(currentStep.key, "skipped");
    if (unresolved.length > 1) {
      // Stay open — the filtered `unresolved` list naturally advances since
      // itemStatus now excludes this step.
      return;
    }
    setOpen(false);
    setSkippedHint(currentStep.hint);
    setHintOpen(true);
  };

  return (
    <>
      {/* ── Onboarding checklist modal ── */}
      <Dialog
        open={open}
        maxWidth="sm"
        fullWidth
        disableEscapeKeyDown
        slots={{ transition: SlideUpTransition }}
        transitionDuration={{ enter: 280, exit: 200 }}
        aria-labelledby="onboarding-dialog-title"
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle id="onboarding-dialog-title" sx={{ pb: 1 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <SettingsIcon color="primary" aria-hidden="true" />
            <Typography variant="h6" fontWeight={700}>
              Welcome! Let's get you set up
            </Typography>
          </Box>
        </DialogTitle>

        <DialogContent>
          {/* Stepper — only unresolved items, so it shrinks as you go */}
          <Stepper activeStep={0} sx={{ mb: 3, overflowX: "auto" }}>
            {unresolved.map((s) => (
              <Step key={s.key}>
                <StepLabel>{s.shortLabel}</StepLabel>
              </Step>
            ))}
          </Stepper>

          {/* Step content */}
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              py: 2,
              gap: 2,
            }}
          >
            {currentStep.icon}
            <Typography variant="h6" fontWeight={600}>
              {currentStep.title}
            </Typography>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ maxWidth: 420 }}
            >
              {currentStep.description}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {STEPS.length - unresolved.length + 1} of {STEPS.length}
            </Typography>
          </Box>
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
          <Button variant="ghost" onClick={handleSkip}>
            {currentStep.skipLabel}
          </Button>
          <Box sx={{ flex: 1 }} />
          <Button variant="primary" onClick={handleAction}>
            {currentStep.actionLabel}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Post-skip hint dialog ── */}
      <Dialog
        open={hintOpen}
        maxWidth="xs"
        fullWidth
        slots={{ transition: SlideUpTransition }}
        transitionDuration={{ enter: 280, exit: 200 }}
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle>
          <Typography variant="h6" fontWeight={700}>
            No problem — you can do it later
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Alert severity="info" icon={<SettingsIcon />}>
            {skippedHint} Everything here is reachable from{" "}
            <strong>Settings</strong> in the sidebar whenever you're ready.
          </Alert>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="primary" onClick={() => setHintOpen(false)}>
            Got it
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
