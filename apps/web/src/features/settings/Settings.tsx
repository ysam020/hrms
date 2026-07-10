import {
  useContext,
  useEffect,
  useState,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import Box from "@mui/material/Box";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import { useLocation, useNavigate } from "react-router-dom";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import { UserContext } from "@web/app/providers/UserContext";
import CompanyInfo from "@web/features/company-info/CompanyInfo";
import OrgSettings from "@web/features/settings/OrgSettings";
import ShiftsSettings from "@web/features/settings/shifts/ShiftsSettings";
import ExitPolicySettings from "@web/features/settings/exit-policy/ExitPolicySettings";
import RecruitmentPipelineSettings from "@web/features/settings/recruitment-pipeline/RecruitmentPipelineSettings";
import PayrollComponentsSettings from "@web/features/settings/payroll-components/PayrollComponentsSettings";
import Subscription from "@web/features/subscription/Subscription";

// ─── Tab definitions ──────────────────────────────────────────────────────────

interface SettingsTab {
  label: string;
  slug: string;
  component: ReactNode;
}

const BASE_TABS: SettingsTab[] = [
  {
    label: "Company Info",
    slug: "company-info",
    component: <CompanyInfo />,
  },
  {
    label: "Organisation Settings",
    slug: "org-settings",
    component: <OrgSettings />,
  },
  {
    label: "Shifts",
    slug: "shifts",
    component: <ShiftsSettings />,
  },
  {
    label: "Exit Policy",
    slug: "exit-policy",
    component: <ExitPolicySettings />,
  },
  {
    label: "Recruitment Pipeline",
    slug: "recruitment-pipeline",
    component: <RecruitmentPipelineSettings />,
  },
  {
    label: "Payroll Components",
    slug: "payroll-components",
    component: <PayrollComponentsSettings />,
  },
];

const SUBSCRIPTION_TAB: SettingsTab = {
  label: "Subscription",
  slug: "subscription",
  component: <Subscription />,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const LS_KEY = "settings_tab";

function slugToIndex(slug: string | null, tabs: SettingsTab[]): number {
  if (!slug) return 0;
  const idx = tabs.findIndex((t) => t.slug === slug);
  return idx === -1 ? 0 : idx;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function Settings() {
  const { theme } = useContext(ThemeContext);
  const { user } = useContext(UserContext);
  const location = useLocation();
  const navigate = useNavigate();

  // Owners and admins can always manage the subscription for their org.
  // Superusers and explicit permission holders can also access it.
  const hasSubscriptionAccess =
    user?.isSuperUser ||
    ["owner", "admin"].includes(user?.tenantRole ?? "") ||
    user?.permissions?.some((p: string) => p.startsWith("Subscription:"));

  const tabs: SettingsTab[] = hasSubscriptionAccess
    ? [...BASE_TABS, SUBSCRIPTION_TAB]
    : BASE_TABS;

  // Derive active tab from ?tab= query param; fall back to localStorage
  const getInitialTab = (): number => {
    const params = new URLSearchParams(location.search);
    const slug = params.get("tab");
    if (slug) return slugToIndex(slug, tabs);
    const saved = localStorage.getItem(LS_KEY);
    return slugToIndex(saved, tabs);
  };

  const [activeTab, setActiveTab] = useState(getInitialTab);

  // Sync when URL changes (back/forward navigation)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const slug = params.get("tab");
    if (slug) {
      setActiveTab(slugToIndex(slug, tabs));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  const handleTabChange = (_: SyntheticEvent, newValue: number) => {
    const slug = tabs[newValue].slug;
    setActiveTab(newValue);
    localStorage.setItem(LS_KEY, slug);
    navigate(slug === "company-info" ? "/settings" : `/settings?tab=${slug}`, {
      replace: true,
    });
  };

  const bgColor = theme === "light" ? "#F9FAFB" : "#111B21";

  return (
    <Box sx={{ width: "100%" }}>
      {/* ── Sticky tab bar — matches TabsPanel across the app ── */}
      <Box
        sx={{
          borderBottom: 1,
          borderColor: "divider",
          position: "sticky",
          top: 0,
          zIndex: 10,
          backgroundColor: bgColor,
        }}
      >
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          aria-label="Settings tabs"
          variant="scrollable"
          scrollButtons="auto"
        >
          {tabs.map((t) => (
            <Tab key={t.slug} label={t.label} />
          ))}
        </Tabs>
      </Box>

      {/* ── Tab content — no extra padding wrapper so child components keep their own spacing ── */}
      {tabs.map((t, i) =>
        activeTab === i ? (
          <Box key={t.slug} role="tabpanel" aria-labelledby={`tab-${t.slug}`}>
            {t.component}
          </Box>
        ) : null,
      )}
    </Box>
  );
}
