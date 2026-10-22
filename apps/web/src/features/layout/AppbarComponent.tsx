import { memo, useContext, useMemo, useState } from "react";
import AppBar from "@mui/material/AppBar";
import IconButton from "@mui/material/IconButton";
import MenuIcon from "@mui/icons-material/Menu";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import Toolbar from "@mui/material/Toolbar";
import Drawer from "@mui/material/Drawer";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Typography from "@mui/material/Typography";
import Badge from "@mui/material/Badge";
import Divider from "@mui/material/Divider";
import Box from "@mui/material/Box";
import { NotificationContext } from "@web/app/providers/NotificationContext";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import { UserContext } from "@web/app/providers/UserContext";
import Tooltip from "@mui/material/Tooltip";
import LogoDark from "@web/assets/data/LogoDark";
import LogoLight from "@web/assets/data/LogoLight";
import AppsPopover from "@web/features/layout/AppsPopover";
import { isOwnerOrAdmin } from "@web/shared/utils/permissions/navAccess";

const drawerWidth = 60;

function AppbarComponent({
  showSidebar,
  setMobileOpen,
  mobileOpen,
  setOpenNotificationDrawer,
  setOpenActivityDrawer,
  handleOpen,
}) {
  const { notifications } = useContext(NotificationContext);
  const { theme, toggleTheme } = useContext(ThemeContext);
  const { handleLogout, user } = useContext(UserContext);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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
    ...(isOwnerOrAdmin(user)
      ? [
          {
            title: "Audit Logs",
            iconClass: "pi-book",
            onClick: () => setOpenActivityDrawer(true),
            badge: false,
          },
        ]
      : []),
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

  const renderActionItem = (item, idx) => {
    const isHovered = hoveredIndex === idx;

    return (
      <Tooltip key={idx} title={item.title} placement="bottom" arrow>
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
                aria-label={`${item.badgeCount ?? 0} ${item.title.toLowerCase()}`}
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
  };

  return (
    <>
      <AppBar
        sx={{
          width: {
            md: showSidebar ? `calc(100% - ${drawerWidth}px)` : "100%",
          },
          ml: { md: `${drawerWidth}px` },
          backgroundColor:
            theme === "light" ? "#f8f9fa !important" : "#111b21 !important",
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
            <Box
              sx={{ flex: 1, display: "flex", alignItems: "center", gap: 1.5 }}
            >
              <Box
                sx={{ width: 230, height: 69 }}
                role="img"
                aria-label="Praesto logo"
              >
                {theme === "light" ? (
                  <LogoDark
                    style={{
                      display: "block",
                      transition: "opacity 0.3s ease",
                      filter: "drop-shadow(0 1px 2px rgba(0, 0, 0, 0.1))",
                      maxWidth: 230,
                      height: 69,
                    }}
                  />
                ) : (
                  <LogoLight
                    style={{
                      display: "block",
                      transition: "opacity 0.3s ease",
                      filter: "drop-shadow(0 1px 2px rgba(0, 0, 0, 0.1))",
                      maxWidth: 230,
                      height: 69,
                    }}
                  />
                )}
              </Box>
              {user?.tenantName && (
                <Box
                  sx={{
                    display: { xs: "none", sm: "flex" },
                    alignItems: "center",
                    px: 1.5,
                    py: 0.5,
                    borderRadius: "20px",
                    bgcolor:
                      theme === "light"
                        ? "rgba(0,0,0,0.06)"
                        : "rgba(255,255,255,0.1)",
                    border: `1px solid ${
                      theme === "light"
                        ? "rgba(0,0,0,0.1)"
                        : "rgba(255,255,255,0.12)"
                    }`,
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 600,
                      fontSize: "0.75rem",
                      color: theme === "light" ? "#374151" : "#d1d5db",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {user.tenantName}
                  </Typography>
                </Box>
              )}
            </Box>

            {/* Desktop action items - hidden on small screens.
                flex: 1 + justifyContent: flex-end mirrors the logo Box's
                flex: 1 above, so both sides claim equal width and the logo
                lands at the true center of the toolbar instead of the
                center of its own (left-packed) half. */}
            <Box
              sx={{
                display: { xs: "none", md: "flex" },
                flex: 1,
                alignItems: "center",
                justifyContent: "flex-end",
                gap: "6px",
              }}
              role="toolbar"
              aria-label="Main actions"
            >
              {renderActionItem(actionItems[0], 0)}

              {/* Apps launcher, right of Search */}
              <AppsPopover theme={theme} />

              {actionItems
                .slice(1)
                .map((item, i) => renderActionItem(item, i + 1))}
            </Box>

            {/* Apps launcher, mobile-only — the desktop instance lives in
                the action row above, right of Search */}
            <Box sx={{ display: { xs: "flex", md: "none" } }}>
              <AppsPopover theme={theme} />
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

      {/* Mobile actions drawer (right side) */}
      <Drawer
        anchor="right"
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        sx={{
          display: { xs: "block", md: "none" },
          "& .MuiDrawer-paper": {
            width: 260,
            backgroundColor: theme === "light" ? "#f9fafb" : "#111b21",
            display: "flex",
            flexDirection: "column",
          },
        }}
        aria-label="Mobile actions menu"
      >
        {/* Header */}
        <Box
          sx={{
            px: 2,
            py: 1.5,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: `1px solid ${theme === "light" ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.07)"}`,
            bgcolor: theme === "light" ? "#fff" : "#1c262a",
            flexShrink: 0,
          }}
        >
          <Typography
            variant="subtitle1"
            fontWeight={700}
            sx={{
              color: theme === "light" ? "#111827" : "#f1f5f9",
              fontSize: "0.95rem",
            }}
          >
            Quick Actions
          </Typography>
          <Box
            component="button"
            aria-label="Close menu"
            onClick={() => setMobileMenuOpen(false)}
            sx={{
              background: "none",
              border: "none",
              cursor: "pointer",
              p: 0.5,
              borderRadius: 1,
              display: "flex",
              alignItems: "center",
              color: theme === "light" ? "#6b7280" : "#9ca3af",
              "&:hover": {
                bgcolor:
                  theme === "light"
                    ? "rgba(0,0,0,0.05)"
                    : "rgba(255,255,255,0.07)",
              },
            }}
          >
            <i
              className="pi pi-times"
              aria-hidden="true"
              style={{ fontSize: 14 }}
            />
          </Box>
        </Box>

        {/* Main actions */}
        <Box sx={{ flex: 1, overflowY: "auto", py: 1 }}>
          <List disablePadding sx={{ px: 1 }}>
            {actionItems
              .filter((item) => !item.danger)
              .map((item, idx) => (
                <ListItemButton
                  key={idx}
                  onClick={() => handleMobileMenuItemClick(item)}
                  sx={{
                    borderRadius: 2,
                    mb: 0.25,
                    px: 1.5,
                    py: 1,
                    "&:hover": {
                      bgcolor:
                        theme === "light"
                          ? "rgba(0,0,0,0.04)"
                          : "rgba(255,255,255,0.06)",
                    },
                  }}
                >
                  <Box
                    sx={{
                      width: 36,
                      height: 36,
                      borderRadius: 2,
                      bgcolor:
                        theme === "light"
                          ? "rgba(0,0,0,0.05)"
                          : "rgba(255,255,255,0.07)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      mr: 1.5,
                      flexShrink: 0,
                    }}
                  >
                    {item.badge && (item.badgeCount ?? 0) > 0 ? (
                      <Badge
                        badgeContent={item.badgeCount}
                        color="error"
                        max={99}
                      >
                        <i
                          className={`pi ${item.iconClass}`}
                          aria-hidden="true"
                          style={{
                            fontSize: 16,
                            color: theme === "light" ? "#374151" : "#d1d5db",
                          }}
                        />
                      </Badge>
                    ) : (
                      <i
                        className={`pi ${item.iconClass}`}
                        aria-hidden="true"
                        style={{
                          fontSize: 16,
                          color: theme === "light" ? "#374151" : "#d1d5db",
                        }}
                      />
                    )}
                  </Box>
                  <ListItemText
                    primary={item.title}
                    sx={{
                      "& .MuiTypography-root": {
                        fontSize: "0.875rem",
                        fontWeight: 500,
                        color: theme === "light" ? "#111827" : "#e5e7eb",
                      },
                    }}
                  />
                </ListItemButton>
              ))}
          </List>

          {/* Danger zone */}
          <Divider
            sx={{
              mx: 2,
              my: 0.75,
              borderColor:
                theme === "light"
                  ? "rgba(0,0,0,0.08)"
                  : "rgba(255,255,255,0.07)",
            }}
          />
          <List disablePadding sx={{ px: 1 }}>
            {actionItems
              .filter((item) => item.danger)
              .map((item, idx) => (
                <ListItemButton
                  key={idx}
                  onClick={() => handleMobileMenuItemClick(item)}
                  sx={{
                    borderRadius: 2,
                    px: 1.5,
                    py: 1,
                    "&:hover": { bgcolor: "rgba(239,68,68,0.08)" },
                  }}
                >
                  <Box
                    sx={{
                      width: 36,
                      height: 36,
                      borderRadius: 2,
                      bgcolor: "rgba(239,68,68,0.08)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      mr: 1.5,
                      flexShrink: 0,
                    }}
                  >
                    <i
                      className={`pi ${item.iconClass}`}
                      aria-hidden="true"
                      style={{ fontSize: 16, color: "#ef4444" }}
                    />
                  </Box>
                  <ListItemText
                    primary={item.title}
                    sx={{
                      "& .MuiTypography-root": {
                        fontSize: "0.875rem",
                        fontWeight: 600,
                        color: "#ef4444",
                      },
                    }}
                  />
                </ListItemButton>
              ))}
          </List>
        </Box>
      </Drawer>
    </>
  );
}

export default memo(AppbarComponent);
