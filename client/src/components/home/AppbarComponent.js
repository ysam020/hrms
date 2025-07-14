import React, { useState, useContext, useMemo, useEffect, useRef } from "react";
import AppBar from "@mui/material/AppBar";
import IconButton from "@mui/material/IconButton";
import MenuIcon from "@mui/icons-material/Menu";
import Toolbar from "@mui/material/Toolbar";
import { useNavigate } from "react-router-dom";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import Badge from "@mui/material/Badge";
import { NotificationContext } from "../../contexts/NotificationContext";
import { ThemeContext } from "../../contexts/ThemeContext";
import { UserContext } from "../../contexts/UserContext";
import { Tooltip } from "@mui/material";

const drawerWidth = 60;

function AppbarComponent({
  showSidebar,
  setMobileOpen,
  mobileOpen,
  setRun,
  setOpenNotificationDrawer,
  setOpenActivityDrawer,
}) {
  const navigate = useNavigate();
  const { notifications } = useContext(NotificationContext);
  const { theme, toggleTheme } = useContext(ThemeContext);
  const { handleLogout } = useContext(UserContext);
  const { user, setUser } = useContext(UserContext);
  const [sessionTime, setSessionTime] = useState({
    text: "",
    color: theme === "light" ? "green" : "#9EC8B9",
  });

  const intervalRef = useRef(null);

  useEffect(() => {
    if (!user?.sessionExpiresAt) return;

    const expiry = new Date(user.sessionExpiresAt).getTime();

    const updateRemainingTime = () => {
      const now = Date.now();
      const diff = expiry - now;

      if (diff <= 0) {
        setSessionTime({ text: "Session expired", color: "f15c6d" });
        // Clear cookie
        document.cookie = "connect.sid=; Max-Age=0; path=/;";
        setUser(null);
        clearInterval(intervalRef.current);
        navigate("/");
        return;
      }

      const minutes = Math.floor((diff / 1000 / 60) % 60);
      const hours = Math.floor(diff / 1000 / 60 / 60);
      const seconds = Math.floor((diff / 1000) % 60);
      const totalMinutes = Math.floor(diff / 1000 / 60);

      const text =
        hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m ${seconds}s`;

      let color = theme === "light" ? "green" : "#9EC8B9";
      if (totalMinutes <= 10) {
        color = theme === "light" ? "#f15c6d" : "#FE9494";
      } else if (totalMinutes <= 30) {
        color = theme === "light" ? "orange" : "#FFDCCC";
      }

      setSessionTime({ text, color });
    };

    updateRemainingTime(); // Initial call
    intervalRef.current = setInterval(updateRemainingTime, 1000);

    return () => clearInterval(intervalRef.current);
    // eslint-disable-next-line
  }, [user?.sessionExpiresAt, theme]);

  const handleNotificationClick = (event) => {
    setOpenNotificationDrawer(true);
  };

  const handleLogClick = (event) => {
    setOpenActivityDrawer(true);
  };

  // Function to start the tour directly
  const startTour = () => {
    setRun(true);
  };

  const notificationCount = useMemo(
    () => notifications?.length || 0,
    [notifications]
  );

  const actionItems = [
    {
      title: "Notifications",
      backgroundColor: "#9EC8B9",
      iconClass: "pi-bell",
      iconColor: "#16563f",
      onClick: handleNotificationClick,
      badge: true,
    },
    {
      title: "Audit Logs",
      backgroundColor: "#DDE6ED",
      iconClass: "pi-book",
      iconColor: "#27374D",
      onClick: handleLogClick,
    },
    {
      title: "Toggle theme",
      backgroundColor: "#ffdccc",
      iconClass: "pi-moon",
      iconColor: "#a24c25",
      onClick: toggleTheme,
    },
    {
      title: "Run tour",
      backgroundColor: "#E5D9F2",
      iconClass: "pi-play-circle",
      iconColor: "#7c3bc2",
      onClick: startTour,
    },
    {
      title: "Logout",
      backgroundColor: "#FE9494",
      iconClass: "pi-sign-out",
      iconColor: "#851E1E",
      onClick: handleLogout,
    },
  ];

  return (
    <AppBar
      position="fixed"
      sx={{
        width: {
          lg: showSidebar ? `calc(100% - ${drawerWidth}px)` : "100%",
        },
        ml: { lg: `${drawerWidth}px` },
        backgroundColor: theme === "light" ? "#f9fafb" : "#111b21",
        boxShadow: "none",
        backgroundImage: "none !important",
      }}
    >
      <Toolbar>
        <IconButton
          aria-label="open drawer"
          edge="start"
          onClick={() => setMobileOpen(!mobileOpen)}
          sx={{ mr: 2, display: { lg: "none" } }}
        >
          <MenuIcon />
        </IconButton>

        {window.location.pathname !== "/" && (
          <IconButton
            aria-label="back"
            edge="start"
            onClick={() => navigate(-1)}
            sx={{ mr: 1 }}
          >
            <ArrowBackIcon />
          </IconButton>
        )}

        <div style={{ display: "flex", width: "100%", alignItems: "center" }}>
          <div style={{ flex: 1 }}></div>

          <span
            style={{
              color: sessionTime.color,
              fontWeight: 600,
              fontSize: "12px",
            }}
          >
            Session expiring in: {sessionTime.text}
          </span>

          {actionItems.map(
            (
              { title, backgroundColor, iconClass, iconColor, onClick, badge },
              idx
            ) => (
              <Tooltip key={idx} title={title} placement="bottom">
                {badge ? (
                  <Badge badgeContent={notificationCount} color="error">
                    <div
                      className="appbar-icon-container"
                      style={{ backgroundColor }}
                      onClick={onClick}
                    >
                      <i
                        className={`pi text-700 ${iconClass}`}
                        style={{ color: iconColor }}
                      ></i>
                    </div>
                  </Badge>
                ) : (
                  <div
                    className="appbar-icon-container"
                    style={{ backgroundColor }}
                    onClick={onClick}
                  >
                    <i
                      className={`pi text-700 ${iconClass}`}
                      style={{ color: iconColor }}
                    ></i>
                  </div>
                )}
              </Tooltip>
            )
          )}
        </div>
      </Toolbar>
    </AppBar>
  );
}

export default React.memo(AppbarComponent);
