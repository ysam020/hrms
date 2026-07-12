import {
  Suspense,
  lazy,
  memo,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate, useLocation } from "react-router-dom";
import "../../styles/sidebar.scss";
import Avatar from "@mui/material/Avatar";
import Badge from "@mui/material/Badge";
import IconButton from "@mui/material/IconButton";
import ListItemButton from "@mui/material/ListItemButton";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { UserContext } from "@web/app/providers/UserContext";
import { ChatUnreadContext } from "@web/app/providers/ChatUnreadContext";
import { ApprovalsBadgeContext } from "@web/app/providers/ApprovalsBadgeContext";
import {
  canManagePermissions,
  canViewAnalytics,
  canAccessSettings,
} from "@web/shared/utils/permissions/navAccess";

const SpaceDashboardIcon = lazy(
  () => import("@mui/icons-material/SpaceDashboard"),
);
const LiveHelpIcon = lazy(() => import("@mui/icons-material/LiveHelp"));
const CalendarMonthIcon = lazy(
  () => import("@mui/icons-material/CalendarMonth"),
);
const SettingsIcon = lazy(() => import("@mui/icons-material/Settings"));
const EqualizerIcon = lazy(() => import("@mui/icons-material/Equalizer"));
const AccountTreeIcon = lazy(() => import("@mui/icons-material/AccountTree"));
const ForumIcon = lazy(() => import("@mui/icons-material/Forum"));
const PolicyIcon = lazy(() => import("@mui/icons-material/Policy"));
const TuneIcon = lazy(() => import("@mui/icons-material/Tune"));
const InboxIcon = lazy(() => import("@mui/icons-material/Inbox"));

function Sidebar({ isMobile = false }: { isMobile?: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(UserContext);
  const { totalUnread } = useContext(ChatUnreadContext);
  const { pendingApprovalsCount } = useContext(ApprovalsBadgeContext);
  const badgeCountByPath: Record<string, number> = {
    "/chat": totalUnread,
    "/approvals": pendingApprovalsCount,
  };
  const navRefs = useRef<(HTMLElement | null)[]>([]);
  const [indicatorStyle, setIndicatorStyle] = useState({ top: 0, opacity: 0 });

  const handleNavigation = (path) => {
    navigate(path);
  };

  // Memoized navItems array — Subscription moved to Settings tabs
  const navItems = useMemo(() => {
    return [
      { title: "Dashboard", icon: <SpaceDashboardIcon />, path: "/" },
      {
        title: "Pending Approvals",
        icon: <InboxIcon />,
        path: "/approvals",
      },
      { title: "Calendar", icon: <CalendarMonthIcon />, path: "/calendar" },
      { title: "Chat", icon: <ForumIcon />, path: "/chat" },
      {
        title: "Permissions",
        icon: <SettingsIcon />,
        path: "/permissions",
        isVisible: canManagePermissions,
      },
      {
        title: "Organization Tree",
        icon: <AccountTreeIcon />,
        path: "/organization-tree",
      },
      {
        title: "Analytics",
        icon: <EqualizerIcon />,
        path: "/analytics",
        isVisible: canViewAnalytics,
      },
      { title: "Policy", icon: <PolicyIcon />, path: "/policy" },
      {
        title: "Settings",
        icon: <TuneIcon />,
        path: "/settings",
        isVisible: canAccessSettings,
      },
      { title: "Help", icon: <LiveHelpIcon />, path: "/help" },
    ].filter((item) => !item.isVisible || item.isVisible(user));
  }, [user]);

  // Legacy routes that now live under /settings should keep the Settings icon active
  const SETTINGS_ALIASES = ["/subscription", "/company-info", "/org-settings"];

  const isActive = (path) => {
    if (path === "/") {
      return location.pathname === "/";
    }
    if (path === "/settings") {
      return (
        location.pathname.startsWith("/settings") ||
        SETTINGS_ALIASES.some((alias) => location.pathname.startsWith(alias))
      );
    }
    return location.pathname.startsWith(path);
  };

  // Update indicator position when route changes
  useEffect(() => {
    const pathname = location.pathname;
    const activeIndex = navItems.findIndex((item) => {
      if (item.path === "/") return pathname === "/";
      return pathname.startsWith(item.path);
    });

    if (activeIndex !== -1 && navRefs.current[activeIndex]) {
      const rafId = requestAnimationFrame(() => {
        const el = navRefs.current[activeIndex];
        if (el) setIndicatorStyle({ top: el.offsetTop, opacity: 1 });
      });
      return () => cancelAnimationFrame(rafId);
    } else {
      setIndicatorStyle((prev) => ({ ...prev, opacity: 0 }));
    }
  }, [location.pathname, navItems]);

  return (
    <div className="sidebar">
      <Tooltip
        title={`Welcome ${user.fullName}`}
        enterDelay={0}
        placement="right"
      >
        <IconButton
          onClick={() => handleNavigation("/profile")}
          aria-label={`View ${user.fullName ? user.fullName + "'s" : "your"} profile`}
          className="avatar-button"
        >
          <Avatar src={user?.employee_photo} alt="" />
        </IconButton>
      </Tooltip>

      <div className="nav-wrapper">
        {/* Animated background indicator */}
        {!isMobile && (
          <div className="active-indicator" style={indicatorStyle} />
        )}
        {navItems.map((item, index) => (
          <Tooltip
            title={isMobile ? "" : item.title}
            placement="right"
            key={index}
          >
            <ListItemButton
              ref={(el) => (navRefs.current[index] = el)}
              className={`appbar-links ${isActive(item.path) ? "active" : ""}`}
              aria-label={item.title}
              onClick={() => handleNavigation(item.path)}
            >
              <Suspense fallback={<div style={{ width: 24, height: 24 }} />}>
                {badgeCountByPath[item.path] !== undefined ? (
                  <Badge
                    badgeContent={badgeCountByPath[item.path]}
                    color="error"
                    max={99}
                    showZero
                  >
                    {item.icon}
                  </Badge>
                ) : (
                  item.icon
                )}
              </Suspense>
              {isMobile && (
                <Typography
                  variant="body2"
                  sx={{
                    color: "#b2b6bd",
                    fontWeight: 500,
                    fontSize: "0.85rem",
                    ".appbar-links.active &": { color: "#6366f1" },
                  }}
                >
                  {item.title}
                </Typography>
              )}
            </ListItemButton>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}

export default memo(Sidebar);
