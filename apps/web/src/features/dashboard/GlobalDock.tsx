import { useContext, useEffect, useMemo } from "react";
import Box from "@mui/material/Box";
import { motion } from "framer-motion";
import { Dock } from "primereact/dock";
import { useNavigate, useLocation } from "react-router-dom";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import { useBottomDrawer } from "@web/app/providers/BottomDrawerContext";
import "../../styles/dashboard.scss";

const DOCK_COLORS = {
  light: {
    blue: "#3b6ea5",
    green: "#2e7d52",
    teal: "#1a8880",
    purple: "#5c40a0",
    gold: "#987020",
    slate: "#4848a0",
    sienna: "#985030",
    rose: "#982848",
  },
  dark: {
    blue: "#2a5080",
    green: "#1e5c38",
    teal: "#126660",
    purple: "#442e80",
    gold: "#705418",
    slate: "#303080",
    sienna: "#703820",
    rose: "#701830",
  },
};

const DockIcon = ({
  iconClass,
  color,
  label,
  isDark,
  isActive,
}: {
  iconClass: string;
  color: string;
  label: string;
  isDark: boolean;
  isActive: boolean;
}) => (
  <Box
    sx={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "2px",
    }}
  >
    <Box
      sx={{
        width: 28,
        height: 28,
        borderRadius: "8px",
        bgcolor: color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: isActive
          ? `0 0 0 2px ${isDark ? "rgba(255,255,255,0.9)" : "#fff"}, 0 0 0 3.5px ${color}, 0 2px 6px ${color}55`
          : `0 2px 6px ${color}55`,
        cursor: "pointer",
        transition: "box-shadow 0.15s ease",
      }}
    >
      <i
        className={`pi ${iconClass}`}
        style={{ fontSize: 14, color: "#fff" }}
      />
    </Box>
    <Box
      component="span"
      sx={{
        fontSize: "0.55rem",
        fontWeight: isActive ? 700 : 600,
        lineHeight: 1,
        whiteSpace: "nowrap",
        letterSpacing: "0.01em",
        color: isActive
          ? color
          : isDark
            ? "rgba(210,210,210,0.9)"
            : "rgba(30,30,30,0.72)",
      }}
    >
      {label}
    </Box>
  </Box>
);

// Route prefix drives both navigation and the active-module highlight — a
// path is "active" when the current location starts with it.
const MODULES = [
  {
    label: "Attendance",
    path: "/attendance",
    iconClass: "pi-calendar",
    colorKey: "green",
  },
  {
    label: "Employees",
    path: "/employee-management",
    iconClass: "pi-users",
    colorKey: "blue",
  },
  {
    label: "Holidays",
    path: "/holidays",
    iconClass: "pi-sun",
    colorKey: "gold",
  },
  {
    label: "HR Activities",
    path: "/hr-activities",
    iconClass: "pi-list",
    colorKey: "slate",
  },
  {
    label: "Job Openings",
    path: "/job-openings",
    iconClass: "pi-briefcase",
    colorKey: "purple",
  },
  {
    label: "KYC Details",
    path: "/kyc",
    iconClass: "pi-id-card",
    colorKey: "sienna",
  },
  {
    label: "Resignation",
    path: "/resignation-process",
    iconClass: "pi-sign-out",
    colorKey: "rose",
  },
  // ── New modules ──────────────────────────────────────────────────────────
  {
    label: "Payroll",
    path: "/payroll",
    iconClass: "pi-wallet",
    colorKey: "green",
  },
  {
    label: "Assets",
    path: "/assets",
    iconClass: "pi-desktop",
    colorKey: "blue",
  },
  { label: "WFH", path: "/wfh", iconClass: "pi-home", colorKey: "teal" },
  {
    label: "Helpdesk",
    path: "/helpdesk",
    iconClass: "pi-headphones",
    colorKey: "gold",
  },
  {
    label: "Reports",
    path: "/reports",
    iconClass: "pi-file-export",
    colorKey: "slate",
  },
] as const;

const DOCK_ITEMS = (navigate, isDark, pathname) => {
  const c = DOCK_COLORS[isDark ? "dark" : "light"];
  return MODULES.map((m) => ({
    label: m.label,
    icon: () => (
      <DockIcon
        iconClass={m.iconClass}
        color={c[m.colorKey]}
        label={m.label}
        isDark={isDark}
        isActive={pathname.startsWith(m.path)}
      />
    ),
    command: () => navigate(m.path),
  }));
};

function GlobalDock() {
  const { theme } = useContext(ThemeContext);
  const isDark = theme === "dark";
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { setDockVisible } = useBottomDrawer();

  const dockItems = useMemo(
    () => DOCK_ITEMS(navigate, isDark, pathname),
    [navigate, isDark, pathname],
  );

  useEffect(() => {
    setDockVisible(true);
  }, [setDockVisible]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 28, delay: 0.15 }}
    >
      <Box
        className={`global-dock${isDark ? " global-dock-dark" : ""} global-dock-visible`}
      >
        <Dock model={dockItems} position="bottom" />
      </Box>
    </motion.div>
  );
}

export default GlobalDock;
