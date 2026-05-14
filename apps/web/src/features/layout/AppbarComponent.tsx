import React, { useContext, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import AppBar from "@mui/material/AppBar";
import IconButton from "@mui/material/IconButton";
import MenuIcon from "@mui/icons-material/Menu";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import Toolbar from "@mui/material/Toolbar";
import Drawer from "@mui/material/Drawer";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Badge from "@mui/material/Badge";
import Divider from "@mui/material/Divider";
import Box from "@mui/material/Box";
import { NotificationContext } from "@web/app/providers/NotificationContext";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import { UserContext } from "@web/app/providers/UserContext";
import Tooltip from "@mui/material/Tooltip";
import LogoDark from "@web/assets/data/LogoDark";
import LogoLight from "@web/assets/data/LogoLight";
import { useDashboardEdit } from "@web/app/providers/DashboardEditContext";

const drawerWidth = 60;

function AppbarComponent({
  showSidebar,
  setMobileOpen,
  mobileOpen,
  setRun,
  setOpenNotificationDrawer,
  setOpenActivityDrawer,
  handleOpen,
}) {
  const { notifications } = useContext(NotificationContext);
  const { theme, toggleTheme } = useContext(ThemeContext);
  const { handleLogout } = useContext(UserContext);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { editMode, toggleEditMode, resetFn } = useDashboardEdit();
  const { pathname } = useLocation();
  const isDashboard = pathname === "/";
  const notificationCount = useMemo(
    () => notifications?.length || 0,
    [notifications],
  );

  const actionItems = [
    {
      title: "Search",
      iconClass: "pi-search",
      onClick: handleOpen,
      badge: false,
    },
    {
      title: "Audit Logs",
      iconClass: "pi-book",
      onClick: () => setOpenActivityDrawer(true),
      badge: false,
    },
    {
      title: theme === "light" ? "Dark mode" : "Light mode",
      iconClass: theme === "light" ? "pi-moon" : "pi-sun",
      onClick: toggleTheme,
      badge: false,
    },
    {
      title: "Notifications",
      iconClass: "pi-bell",
      onClick: () => setOpenNotificationDrawer(true),
      badge: true,
      badgeCount: notificationCount,
    },
    {
      title: "Run tour",
      iconClass: "pi-play-circle",
      onClick: () => setRun(true),
      badge: false,
    },
    {
      title: "Logout",
      iconClass: "pi-sign-out",
      onClick: handleLogout,
      badge: false,
      danger: true,
    },
  ];

  const handleMobileMenuItemClick = (item) => {
    item.onClick();
    setMobileMenuOpen(false);
  };

  return (
    <>
      <AppBar
        sx={{
          width: {
            lg: showSidebar ? `calc(100% - ${drawerWidth}px)` : "100%",
          },
          ml: { lg: `${drawerWidth}px` },
          backgroundColor:
            theme === "light" ? "#f9fafb !important" : "#111b21 !important",
          boxShadow: "none !important",
          backgroundImage: "none !important",
        }}
      >
        <Toolbar>
          <IconButton
            aria-label="Open navigation menu"
            edge="start"
            onClick={() => setMobileOpen(!mobileOpen)}
            sx={{
              mr: 2,
              display: { lg: "none" },
              color: theme === "light" ? "#1f2937" : "#f9fafb",
              "&:hover": {
                background:
                  theme === "light"
                    ? "rgba(0, 0, 0, 0.06)"
                    : "rgba(255, 255, 255, 0.08)",
              },
            }}
          >
            <MenuIcon />
          </IconButton>

          <Box
            sx={{
              display: "flex",
              width: "100%",
              alignItems: "center",
              gap: "32px",
              justifyContent: "center",
            }}
          >
            <Box sx={{ flex: 1 }}>
              <Box
                sx={{ width: 200, height: 60 }}
                role="img"
                aria-label="Praesto logo"
              >
                {theme === "light" ? (
                  <LogoDark
                    style={{
                      display: "block",
                      transition: "opacity 0.3s ease",
                      filter: "drop-shadow(0 1px 2px rgba(0, 0, 0, 0.1))",
                      maxWidth: 200,
                      height: 60,
                    }}
                  />
                ) : (
                  <LogoLight
                    style={{
                      display: "block",
                      transition: "opacity 0.3s ease",
                      filter: "drop-shadow(0 1px 2px rgba(0, 0, 0, 0.1))",
                      maxWidth: 200,
                      height: 60,
                    }}
                  />
                )}
              </Box>
            </Box>

            {/* Desktop action items - hidden on small screens */}
            <Box
              sx={{
                display: { xs: "none", md: "flex" },
                alignItems: "center",
                gap: "6px",
              }}
              role="toolbar"
              aria-label="Main actions"
            >
              {/* Customize button — dashboard only */}
              {isDashboard && (
                <>
                  {editMode && resetFn && (
                    <Tooltip
                      title="Reset to default layout"
                      placement="bottom"
                      arrow
                    >
                      <Box
                        component="button"
                        onClick={resetFn}
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: "40px",
                          height: "44px",
                          borderRadius: "10px",
                          cursor: "pointer",
                          border: "none",
                          background: "transparent",
                          "&:hover": {
                            background:
                              theme === "light"
                                ? "rgba(0,0,0,0.06)"
                                : "rgba(255,255,255,0.08)",
                          },
                        }}
                      >
                        <i
                          className="pi pi-refresh"
                          style={{
                            fontSize: 14,
                            color: theme === "light" ? "#1f2937" : "#f3f4f6",
                          }}
                        />
                      </Box>
                    </Tooltip>
                  )}
                  <Tooltip
                    title={editMode ? "Done customizing" : "Customize layout"}
                    placement="bottom"
                    arrow
                  >
                    <Box
                      component="button"
                      onClick={toggleEditMode}
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "40px",
                        height: "44px",
                        borderRadius: "10px",
                        cursor: "pointer",
                        border: "none",
                        background: "transparent",
                        "&:hover": {
                          background:
                            theme === "light"
                              ? "rgba(0,0,0,0.06)"
                              : "rgba(255,255,255,0.08)",
                        },
                      }}
                    >
                      <i
                        className={editMode ? "pi pi-check" : "pi pi-sliders-h"}
                        style={{
                          fontSize: "16px",
                          color: theme === "light" ? "#1f2937" : "#f3f4f6",
                          transition: "all 0.2s ease",
                        }}
                      />
                    </Box>
                  </Tooltip>
                </>
              )}

              {actionItems.map((item, idx) => {
                const isHovered = hoveredIndex === idx;

                return (
                  <Tooltip
                    key={idx}
                    title={item.title}
                    placement="bottom"
                    arrow
                  >
                    <Box
                      component="button"
                      aria-label={item.title}
                      onMouseEnter={() => setHoveredIndex(idx)}
                      onMouseLeave={() => setHoveredIndex(null)}
                      onClick={item.onClick}
                      sx={{
                        position: "relative",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "40px",
                        height: "44px",
                        borderRadius: "14px",
                        cursor: "pointer",
                        border: "none",
                        transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                        background: isHovered
                          ? theme === "light"
                            ? item.danger
                              ? "linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(220, 38, 38, 0.12) 100%)"
                              : "linear-gradient(135deg, rgba(0, 0, 0, 0.05) 0%, rgba(0, 0, 0, 0.08) 100%)"
                            : item.danger
                              ? "linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(220, 38, 38, 0.18) 100%)"
                              : "linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.12) 100%)"
                          : "transparent",
                        boxShadow: isHovered
                          ? theme === "light"
                            ? "0 4px 12px rgba(0, 0, 0, 0.08)"
                            : "0 4px 12px rgba(0, 0, 0, 0.3)"
                          : "none",
                      }}
                    >
                      {item.badge && (item.badgeCount ?? 0) > 0 ? (
                        <>
                          <i
                            className={`pi ${item.iconClass}`}
                            aria-hidden="true"
                            style={{
                              fontSize: "16px",
                              color: theme === "light" ? "#1f2937" : "#f3f4f6",
                              transition: "all 0.2s ease",
                            }}
                          />
                          <Box
                            sx={{
                              position: "absolute",
                              top: "1px",
                              right: "6px",
                              minWidth: "20px",
                              height: "20px",
                              borderRadius: "10px",
                              background:
                                "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                              color: "white",
                              fontSize: "11px",
                              fontWeight: "700",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              padding: "0 5px",
                              boxShadow: "0 2px 8px rgba(239, 68, 68, 0.4)",
                              border:
                                "2px solid " +
                                (theme === "light"
                                  ? "rgba(255, 255, 255, 0.85)"
                                  : "rgba(17, 27, 33, 0.85)"),
                            }}
                            aria-label={`${
                              item.badgeCount ?? 0
                            } ${item.title.toLowerCase()}`}
                          >
                            {item.badgeCount}
                          </Box>
                        </>
                      ) : (
                        <i
                          className={`pi ${item.iconClass}`}
                          aria-hidden="true"
                          style={{
                            fontSize: "16px",
                            color:
                              item.danger && isHovered
                                ? "#ef4444"
                                : theme === "light"
                                  ? "#1f2937"
                                  : "#f3f4f6",
                            transition: "all 0.2s ease",
                          }}
                        />
                      )}
                    </Box>
                  </Tooltip>
                );
              })}
            </Box>

            {/* Mobile hamburger menu - shown only on small screens */}
            <IconButton
              aria-label={`Open menu${
                notificationCount > 0
                  ? `, ${notificationCount} unread notifications`
                  : ""
              }`}
              edge="end"
              onClick={() => setMobileMenuOpen(true)}
              sx={{
                display: { xs: "flex", md: "none" },
                color: theme === "light" ? "#1f2937" : "#f9fafb",
                "&:hover": {
                  background:
                    theme === "light"
                      ? "rgba(0, 0, 0, 0.06)"
                      : "rgba(255, 255, 255, 0.08)",
                },
              }}
            >
              <Badge badgeContent={notificationCount} color="error">
                <MoreVertIcon />
              </Badge>
            </IconButton>
          </Box>
        </Toolbar>
      </AppBar>

      {/* Mobile menu drawer */}
      <Drawer
        anchor="right"
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        sx={{
          display: { xs: "block", md: "none" },
          "& .MuiDrawer-paper": {
            width: 280,
            backgroundColor: theme === "light" ? "#ffffff" : "#1f2937",
            color: theme === "light" ? "#1f2937" : "#f9fafb",
          },
        }}
        aria-label="Mobile navigation menu"
      >
        <Divider
          sx={{ backgroundColor: theme === "light" ? "#e5e7eb" : "#374151" }}
        />
        <List>
          {actionItems.map((item, idx) => (
            <ListItem
              key={idx}
              component="button"
              onClick={() => handleMobileMenuItemClick(item)}
              sx={{
                "&:hover": {
                  backgroundColor:
                    theme === "light"
                      ? item.danger
                        ? "rgba(239, 68, 68, 0.1)"
                        : "rgba(0, 0, 0, 0.04)"
                      : item.danger
                        ? "rgba(239, 68, 68, 0.15)"
                        : "rgba(255, 255, 255, 0.08)",
                },
              }}
            >
              <ListItemIcon>
                {item.badge && (item.badgeCount ?? 0) > 0 ? (
                  <Badge badgeContent={item.badgeCount} color="error">
                    <i
                      className={`pi ${item.iconClass}`}
                      aria-hidden="true"
                      style={{
                        fontSize: "20px",
                        color: theme === "light" ? "#1f2937" : "#f3f4f6",
                      }}
                    />
                  </Badge>
                ) : (
                  <i
                    className={`pi ${item.iconClass}`}
                    aria-hidden="true"
                    style={{
                      fontSize: "20px",
                      color: item.danger
                        ? "#ef4444"
                        : theme === "light"
                          ? "#1f2937"
                          : "#f3f4f6",
                    }}
                  />
                )}
              </ListItemIcon>
              <ListItemText
                primary={item.title}
                sx={{
                  "& .MuiTypography-root": {
                    color: item.danger
                      ? "#ef4444"
                      : theme === "light"
                        ? "#1f2937"
                        : "#f9fafb",
                    fontWeight: item.danger ? 600 : 400,
                  },
                }}
              />
            </ListItem>
          ))}
        </List>
      </Drawer>
    </>
  );
}

export default React.memo(AppbarComponent);
