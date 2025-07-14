import React, { useContext, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import "../../styles/sidebar.scss";
import { Avatar, IconButton, ListItemButton, Tooltip } from "@mui/material";
import { UserContext } from "../../contexts/UserContext";
import SpaceDashboardIcon from "@mui/icons-material/SpaceDashboard";
import ViewModuleIcon from "@mui/icons-material/ViewModule";
import LiveHelpIcon from "@mui/icons-material/LiveHelp";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import SettingsIcon from "@mui/icons-material/Settings";
import EqualizerIcon from "@mui/icons-material/Equalizer";

function Sidebar() {
  const navigate = useNavigate();
  const { user } = useContext(UserContext);
  const handleNavigation = (path) => {
    navigate(path);
  };

  // Memoized navItems array
  const navItems = useMemo(() => {
    return [
      { title: "Dashboard", icon: <SpaceDashboardIcon />, path: "/" },
      { title: "Calendar", icon: <CalendarMonthIcon />, path: "/calendar" },
      { title: "Modules", icon: <ViewModuleIcon />, path: "/modules" },
      { title: "Permissions", icon: <SettingsIcon />, path: "/permissions" },
      { title: "Analytics", icon: <EqualizerIcon />, path: "/analytics" },
      { title: "Help", icon: <LiveHelpIcon />, path: "/help" },
    ];
  }, []);

  return (
    <div className="sidebar">
      <Tooltip
        title={`Welcome ${user.fullName}`}
        enterDelay={0}
        placement="right"
      >
        <IconButton
          onClick={() => handleNavigation("/profile")}
          className="avatar-button"
        >
          <Avatar src={user.employee_photo} alt="Employee Photo" />
        </IconButton>
      </Tooltip>

      {navItems.map((item, index) => (
        <Tooltip title={item.title} placement="right" key={index}>
          <ListItemButton
            className={`appbar-links ${item.title}`}
            aria-label="list-item"
            onClick={() => handleNavigation(item.path)}
          >
            <IconButton aria-label="icon">{item.icon}</IconButton>
          </ListItemButton>
        </Tooltip>
      ))}
    </div>
  );
}

export default React.memo(Sidebar);
