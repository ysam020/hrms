import { useContext, useEffect, useMemo } from "react";
import Box from "@mui/material/Box";
import { motion } from "framer-motion";
import { Dock } from "primereact/dock";
import { useNavigate } from "react-router-dom";
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
}: {
  iconClass: string;
  color: string;
  label: string;
  isDark: boolean;
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
        boxShadow: `0 2px 6px ${color}55`,
        cursor: "pointer",
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
        fontWeight: 600,
        lineHeight: 1,
        whiteSpace: "nowrap",
        letterSpacing: "0.01em",
        color: isDark ? "rgba(210,210,210,0.9)" : "rgba(30,30,30,0.72)",
      }}
    >
      {label}
    </Box>
  </Box>
);

const DOCK_ITEMS = (navigate, isDark) => {
  const c = DOCK_COLORS[isDark ? "dark" : "light"];
  return [
    {
      label: "Attendance",
      icon: () => (
        <DockIcon
          iconClass="pi-calendar"
          color={c.green}
          label="Attendance"
          isDark={isDark}
        />
      ),
      command: () => navigate("/attendance"),
    },
    {
      label: "Employees",
      icon: () => (
        <DockIcon
          iconClass="pi-users"
          color={c.blue}
          label="Employees"
          isDark={isDark}
        />
      ),
      command: () => navigate("/employee-management"),
    },
    {
      label: "Holidays",
      icon: () => (
        <DockIcon
          iconClass="pi-sun"
          color={c.gold}
          label="Holidays"
          isDark={isDark}
        />
      ),
      command: () => navigate("/holidays"),
    },
    {
      label: "HR Activities",
      icon: () => (
        <DockIcon
          iconClass="pi-list"
          color={c.slate}
          label="HR Activities"
          isDark={isDark}
        />
      ),
      command: () => navigate("/hr-activities"),
    },
    {
      label: "Job Openings",
      icon: () => (
        <DockIcon
          iconClass="pi-briefcase"
          color={c.purple}
          label="Job Openings"
          isDark={isDark}
        />
      ),
      command: () => navigate("/job-openings"),
    },
    {
      label: "KYC Details",
      icon: () => (
        <DockIcon
          iconClass="pi-id-card"
          color={c.sienna}
          label="KYC Details"
          isDark={isDark}
        />
      ),
      command: () => navigate("/kyc"),
    },
    {
      label: "Resignation",
      icon: () => (
        <DockIcon
          iconClass="pi-sign-out"
          color={c.rose}
          label="Resignation"
          isDark={isDark}
        />
      ),
      command: () => navigate("/resignation-process"),
    },
    // ── New modules ──────────────────────────────────────────────────────────
    {
      label: "Payroll",
      icon: () => (
        <DockIcon
          iconClass="pi-wallet"
          color={c.green}
          label="Payroll"
          isDark={isDark}
        />
      ),
      command: () => navigate("/payroll"),
    },
    {
      label: "Assets",
      icon: () => (
        <DockIcon
          iconClass="pi-desktop"
          color={c.blue}
          label="Assets"
          isDark={isDark}
        />
      ),
      command: () => navigate("/assets"),
    },
    {
      label: "WFH",
      icon: () => (
        <DockIcon
          iconClass="pi-home"
          color={c.teal}
          label="WFH"
          isDark={isDark}
        />
      ),
      command: () => navigate("/wfh"),
    },
    {
      label: "Helpdesk",
      icon: () => (
        <DockIcon
          iconClass="pi-headphones"
          color={c.gold}
          label="Helpdesk"
          isDark={isDark}
        />
      ),
      command: () => navigate("/helpdesk"),
    },
    {
      label: "Reports",
      icon: () => (
        <DockIcon
          iconClass="pi-file-export"
          color={c.slate}
          label="Reports"
          isDark={isDark}
        />
      ),
      command: () => navigate("/reports"),
    },
  ];
};

function GlobalDock() {
  const { theme } = useContext(ThemeContext);
  const isDark = theme === "dark";
  const navigate = useNavigate();
  const { setDockVisible } = useBottomDrawer();

  const dockItems = useMemo(
    () => DOCK_ITEMS(navigate, isDark),
    [navigate, isDark],
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
