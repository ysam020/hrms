import EventAvailableIcon from "@mui/icons-material/EventAvailable";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import BusinessCenterIcon from "@mui/icons-material/BusinessCenter";
import CalendarViewWeekIcon from "@mui/icons-material/CalendarViewWeek";
import LogoutIcon from "@mui/icons-material/Logout";
import PaymentsIcon from "@mui/icons-material/Payments";
import AccountTreeIcon from "@mui/icons-material/AccountTree";

export type EffectiveDatePreset = "now" | "next_month" | "next_year" | "custom";

export function resolveEffectiveDate(
  preset: EffectiveDatePreset,
  custom: string,
): Date {
  const now = new Date();
  if (preset === "next_month") {
    return new Date(now.getFullYear(), now.getMonth() + 1, 1);
  }
  if (preset === "next_year") {
    return new Date(now.getFullYear() + 1, 0, 1);
  }
  if (preset === "custom" && custom) {
    return new Date(custom);
  }
  return now;
}

export function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ─── Sub-tabs ─────────────────────────────────────────────────────────────────
// slug drives deep-linking (?subtab=...) — see OnboardingModals.tsx, which
// links straight into a specific sub-tab (e.g. "Configure exit policy").

export const SUB_TABS = [
  {
    label: "Leave",
    slug: "leave",
    icon: <EventAvailableIcon fontSize="small" />,
  },
  {
    label: "Attendance",
    slug: "attendance",
    icon: <AccessTimeIcon fontSize="small" />,
  },
  {
    label: "HR Policy",
    slug: "hr-policy",
    icon: <BusinessCenterIcon fontSize="small" />,
  },
  {
    label: "Work Week",
    slug: "work-week",
    icon: <CalendarViewWeekIcon fontSize="small" />,
  },
  {
    label: "Exit Policy",
    slug: "exit-policy",
    icon: <LogoutIcon fontSize="small" />,
  },
  {
    label: "Payroll Components",
    slug: "payroll-components",
    icon: <PaymentsIcon fontSize="small" />,
  },
  {
    label: "Recruitment Pipeline",
    slug: "recruitment-pipeline",
    icon: <AccountTreeIcon fontSize="small" />,
  },
];

export const SUB_TAB_LS_KEY = "org_settings_subtab";

export function subTabSlugToIndex(slug: string | null): number {
  if (!slug) return 0;
  const idx = SUB_TABS.findIndex((t) => t.slug === slug);
  return idx === -1 ? 0 : idx;
}
