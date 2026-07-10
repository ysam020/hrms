import { useState, useMemo } from "react";
import Box from "@mui/material/Box";
import Popover from "@mui/material/Popover";
import Typography from "@mui/material/Typography";
import { useNavigate, useLocation } from "react-router-dom";

const MODULE_COLORS = {
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

// Route prefix drives both navigation and the active-module highlight — a
// path is "active" when the current location starts with it. Formerly the
// GlobalDock's module list; the dock was removed in favour of this popover.
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

function ModuleTile({
  label,
  iconClass,
  color,
  isDark,
  isActive,
  onClick,
}: {
  label: string;
  iconClass: string;
  color: string;
  isDark: boolean;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <Box
      component="button"
      onClick={onClick}
      aria-label={label}
      aria-current={isActive ? "page" : undefined}
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "6px",
        width: 76,
        padding: "8px 4px",
        border: "none",
        borderRadius: "12px",
        background: "transparent",
        cursor: "pointer",
        transition: "background 0.15s ease",
        "&:hover": {
          background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)",
        },
      }}
    >
      <Box
        sx={{
          width: 40,
          height: 40,
          borderRadius: "10px",
          bgcolor: color,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: isActive
            ? `0 0 0 2px ${isDark ? "rgba(255,255,255,0.9)" : "#fff"}, 0 0 0 3.5px ${color}, 0 2px 6px ${color}55`
            : `0 2px 6px ${color}55`,
        }}
      >
        <i
          className={`pi ${iconClass}`}
          style={{ fontSize: 18, color: "#fff" }}
        />
      </Box>
      <Typography
        component="span"
        sx={{
          fontSize: "0.7rem",
          fontWeight: isActive ? 700 : 500,
          lineHeight: 1.2,
          textAlign: "center",
          color: isActive
            ? color
            : isDark
              ? "rgba(210,210,210,0.9)"
              : "rgba(30,30,30,0.72)",
        }}
      >
        {label}
      </Typography>
    </Box>
  );
}

function AppsPopover({ theme }: { theme: "light" | "dark" }) {
  const isDark = theme === "dark";
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);

  const colors = useMemo(
    () => MODULE_COLORS[isDark ? "dark" : "light"],
    [isDark],
  );

  const handleModuleClick = (path: string) => {
    setAnchorEl(null);
    navigate(path);
  };

  return (
    <>
      <Box
        component="button"
        aria-label="Apps"
        title="Apps"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={(e) => setAnchorEl(e.currentTarget)}
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "40px",
          height: "44px",
          borderRadius: "14px",
          cursor: "pointer",
          border: "none",
          background: open
            ? theme === "light"
              ? "rgba(0, 0, 0, 0.06)"
              : "rgba(255, 255, 255, 0.1)"
            : "transparent",
          transition: "all 0.2s ease",
          "&:hover": {
            background:
              theme === "light"
                ? "rgba(0, 0, 0, 0.05)"
                : "rgba(255, 255, 255, 0.08)",
          },
        }}
      >
        <i
          className="pi pi-th-large"
          aria-hidden="true"
          style={{
            fontSize: "16px",
            color: theme === "light" ? "#1f2937" : "#f3f4f6",
          }}
        />
      </Box>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{
          paper: {
            sx: {
              mt: 1,
              p: 1.5,
              borderRadius: "16px",
              backgroundColor: isDark ? "#1c262a" : "#fff",
              boxShadow: isDark
                ? "0 8px 32px rgba(0,0,0,0.5)"
                : "0 8px 32px rgba(0,0,0,0.15)",
              maxWidth: 340,
            },
          },
        }}
      >
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: "4px",
          }}
        >
          {MODULES.map((m) => (
            <ModuleTile
              key={m.path}
              label={m.label}
              iconClass={m.iconClass}
              color={colors[m.colorKey]}
              isDark={isDark}
              isActive={pathname.startsWith(m.path)}
              onClick={() => handleModuleClick(m.path)}
            />
          ))}
        </Box>
      </Popover>
    </>
  );
}

export default AppsPopover;
