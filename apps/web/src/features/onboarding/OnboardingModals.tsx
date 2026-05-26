/**
 * OnboardingModals
 *
 * Shows two sequential modals to new tenant owners/admins:
 *   1. "Set up your company info"  → links to /settings
 *   2. "Configure organisation settings"    → links to /settings?tab=org-settings
 *
 * Each modal has "Set up now" and "Skip for now" actions.
 * Dismissed state is stored per-tenant in localStorage so it only
 * appears once per device.
 *
 * Trigger: rendered when the user is an owner/admin AND no
 * dismissed flag exists for their tenantId.
 */

import { useContext, useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import Dialog from "@mui/material/Dialog";
import SlideUpTransition from "@web/shared/components/SlideUpTransition";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Alert from "@mui/material/Alert";
import Stepper from "@mui/material/Stepper";
import Step from "@mui/material/Step";
import StepLabel from "@mui/material/StepLabel";
import ApartmentIcon from "@mui/icons-material/Apartment";
import TuneIcon from "@mui/icons-material/Tune";
import SettingsIcon from "@mui/icons-material/Settings";
import { UserContext } from "@web/app/providers/UserContext";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function dismissedKey(tenantId: string) {
  return `onboarding_dismissed_${tenantId}`;
}

function isOnboardingDismissed(tenantId: string): boolean {
  try {
    return localStorage.getItem(dismissedKey(tenantId)) === "true";
  } catch {
    return true; // If localStorage unavailable, don't block the user.
  }
}

function markOnboardingDismissed(tenantId: string): void {
  try {
    localStorage.setItem(dismissedKey(tenantId), "true");
  } catch {
    /* ignore */
  }
}

// ─── Step definitions ─────────────────────────────────────────────────────────

interface OnboardingStep {
  title: string;
  description: string;
  icon: ReactNode;
  actionLabel: string;
  skipLabel: string;
  route: string;
  hint: string; // shown after skipping
}

const STEPS: OnboardingStep[] = [
  {
    title: "Set up your company profile",
    description:
      "Add your organisation's contact details — help phone, email, office address, and website — so your employees can find key info in one place.",
    icon: <ApartmentIcon sx={{ fontSize: 48, color: "primary.main" }} />,
    actionLabel: "Set up company info",
    skipLabel: "I'll do it later",
    route: "/settings",
    hint: "You can add company details anytime from Settings → Company Info in the sidebar.",
  },
  {
    title: "Configure organisation settings",
    description:
      "Define your leave policies, attendance rules, probation & notice periods, and more. These settings govern how the system tracks attendance and applies leave.",
    icon: <TuneIcon sx={{ fontSize: 48, color: "primary.main" }} />,
    actionLabel: "Configure settings",
    skipLabel: "I'll do it later",
    route: "/settings?tab=org-settings",
    hint: "You can configure organisation settings anytime from Settings → Organisation Settings in the sidebar.",
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function OnboardingModals() {
  const { user } = useContext(UserContext);
  const navigate = useNavigate();

  const [stepIndex, setStepIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const [skippedHint, setSkippedHint] = useState<string | null>(null);
  const [hintOpen, setHintOpen] = useState(false);

  // Only show for owners/admins who haven't dismissed yet
  useEffect(() => {
    if (!user?.tenantId) return;

    const isEligible =
      user.isSuperUser || ["owner", "admin"].includes(user?.tenantRole ?? "");

    if (isEligible && !isOnboardingDismissed(user.tenantId)) {
      // Small delay so the dashboard loads first, feels more polished
      const id = setTimeout(() => setOpen(true), 1200);
      return () => clearTimeout(id);
    }
  }, [user?.tenantId, user?.tenantRole, user?.isSuperUser]);

  const currentStep = STEPS[stepIndex];

  const handleAction = () => {
    // Mark dismissed before navigating away
    markOnboardingDismissed(user.tenantId);
    setOpen(false);
    navigate(currentStep.route);
  };

  const handleSkip = () => {
    if (stepIndex < STEPS.length - 1) {
      // Move to next step
      setStepIndex((prev) => prev + 1);
    } else {
      // Last step skipped — done
      markOnboardingDismissed(user.tenantId);
      setOpen(false);
      // Show a brief hint about where to find these settings
      setSkippedHint(currentStep.hint);
      setHintOpen(true);
    }
  };

  // Also show a hint when skipping step 0 (we want a hint for that too)
  // Actually: show hint for the step that was skipped, but only after ALL steps are done
  // Revised: when user skips step 0, show the next step. When user skips step 1 (last), show hint.
  // The hint consolidates both skipped routes.

  return (
    <>
      {/* ── Onboarding stepper modal ── */}
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
          {/* Stepper */}
          <Stepper activeStep={stepIndex} sx={{ mb: 3 }}>
            {STEPS.map((s, i) => (
              <Step key={i}>
                <StepLabel>
                  {i === 0 ? "Company Info" : "Organisation Settings"}
                </StepLabel>
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
          </Box>
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
          <Button
            variant="text"
            color="inherit"
            onClick={handleSkip}
            sx={{ color: "text.secondary" }}
          >
            {currentStep.skipLabel}
          </Button>
          <Box sx={{ flex: 1 }} />
          <Button variant="contained" onClick={handleAction}>
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
            You can access both <strong>Company Info</strong> and{" "}
            <strong>Organisation Settings</strong> anytime from the{" "}
            <strong>Settings</strong> item in the sidebar.
          </Alert>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="contained" onClick={() => setHintOpen(false)}>
            Got it
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
