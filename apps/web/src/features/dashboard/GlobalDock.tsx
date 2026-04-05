import React, { useContext, useState, useMemo, useEffect, useRef } from "react";
import Box from "@mui/material/Box";
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

const DockIcon = ({ iconClass, color }) => (
  <Box
    sx={{
      width: 40,
      height: 40,
      borderRadius: "11px",
      bgcolor: color,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      boxShadow: `0 2px 8px ${color}55`,
      cursor: "pointer",
    }}
  >
    <i className={`pi ${iconClass}`} style={{ fontSize: 18, color: "#fff" }} />
  </Box>
);

const DOCK_ITEMS = (navigate, isDark) => {
  const c = DOCK_COLORS[isDark ? "dark" : "light"];
  return [
    {
      label: "Employees",
      icon: () => <DockIcon iconClass="pi-users" color={c.blue} />,
      command: () => navigate("/employee-management"),
    },
    {
      label: "Attendance",
      icon: () => <DockIcon iconClass="pi-calendar" color={c.green} />,
      command: () => navigate("/attendance"),
    },
    {
      label: "Salary",
      icon: () => <DockIcon iconClass="pi-money-bill" color={c.teal} />,
      command: () => navigate("/salary-management"),
    },
    {
      label: "Job Openings",
      icon: () => <DockIcon iconClass="pi-briefcase" color={c.purple} />,
      command: () => navigate("/job-openings"),
    },
    {
      label: "Holidays",
      icon: () => <DockIcon iconClass="pi-sun" color={c.gold} />,
      command: () => navigate("/holidays"),
    },
    {
      label: "HR Activities",
      icon: () => <DockIcon iconClass="pi-list" color={c.slate} />,
      command: () => navigate("/hr-activities"),
    },
    {
      label: "KYC Details",
      icon: () => <DockIcon iconClass="pi-id-card" color={c.sienna} />,
      command: () => navigate("/kyc"),
    },
    {
      label: "Resignation",
      icon: () => <DockIcon iconClass="pi-sign-out" color={c.rose} />,
      command: () => navigate("/resignation-process"),
    },
  ];
};

// Show threshold: px from bottom to trigger show
const SHOW_THRESHOLD = 60;
// Hide threshold: px from bottom — must be above dock height to avoid flicker
const HIDE_THRESHOLD = 130;

function GlobalDock() {
  const { theme } = useContext(ThemeContext);
  const isDark = theme === "dark";
  const navigate = useNavigate();
  const { isAnyOpen: isDrawerOpen } = useBottomDrawer();

  const [visible, setVisible] = useState(false);
  const visibleRef = useRef(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dockItems = useMemo(
    () => DOCK_ITEMS(navigate, isDark),
    [navigate, isDark],
  );

  useEffect(() => {
    const handleMouseMove = (e) => {
      const distFromBottom = window.innerHeight - e.clientY;

      if (distFromBottom < SHOW_THRESHOLD) {
        if (hideTimerRef.current) {
          clearTimeout(hideTimerRef.current);
          hideTimerRef.current = null;
        }
        if (!visibleRef.current) {
          visibleRef.current = true;
          setVisible(true);
        }
      } else if (distFromBottom > HIDE_THRESHOLD && visibleRef.current) {
        if (!hideTimerRef.current) {
          hideTimerRef.current = setTimeout(() => {
            visibleRef.current = false;
            setVisible(false);
            hideTimerRef.current = null;
          }, 300);
        }
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  return (
    <Box
      className={`global-dock${isDark ? " global-dock-dark" : ""}${visible && !isDrawerOpen ? " global-dock-visible" : ""}`}
    >
      <Dock model={dockItems} position="bottom" />
    </Box>
  );
}

export default GlobalDock;
