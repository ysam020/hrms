import {
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import Box from "@mui/material/Box";
import Skeleton from "@mui/material/Skeleton";
import Collapse from "@mui/material/Collapse";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import { useNavigate } from "react-router-dom";
import useUpdateFavicon from "@web/shared/hooks/useUpdateFavicon";
import { NotificationContext } from "@web/app/providers/NotificationContext";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import CloseIcon from "@mui/icons-material/Close";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import apiClient from "@web/core/http/axiosConfig";
import { API_ENDPOINTS } from "@web/shared/constants";
import { saveNotifications } from "@web/core/db";
import { AnimatePresence, motion } from "framer-motion";

function Notifications() {
  const { notifications, loading, setNotifications } =
    useContext(NotificationContext);
  const { theme } = useContext(ThemeContext);
  const navigate = useNavigate();
  useUpdateFavicon(notifications);

  const [groupedNotifications, setGroupedNotifications] = useState<any[]>([]);
  const [expandedGroups, setExpandedGroups] = useState({});

  // Group notifications by title
  useEffect(() => {
    const grouped = notifications.reduce((acc, notification) => {
      const title = notification.title;
      if (!acc[title]) {
        acc[title] = [];
      }
      acc[title].push(notification);
      return acc;
    }, {});

    const defaultExpanded = Object.keys(grouped).reduce((acc, title) => {
      acc[title] = false;
      return acc;
    }, {});

    setGroupedNotifications(Object.entries(grouped));
    setExpandedGroups(defaultExpanded);
  }, [notifications]);

  const renderSkeleton = useMemo(
    () => (key) => (
      <Box
        key={key}
        sx={{
          p: 1,
          mb: 1,
          borderRadius: 2,
          backgroundColor: theme === "light" ? "#fff" : "#212e35",
          border: `1px solid ${
            theme === "light" ? "#e5e7eb" : "rgba(255, 255, 255, 0.12)"
          }`,
        }}
      >
        <Skeleton width="25%" height={20} sx={{ mb: 1 }} />
        <Skeleton width="100%" />
        <Skeleton width="50%" />
      </Box>
    ),
    [theme],
  );

  const clearNotification = useCallback(
    async (notificationId) => {
      try {
        await apiClient.put(API_ENDPOINTS.CLEAR_NOTIFICATION(notificationId));
      } catch {
        // still remove from UI even if request fails unexpectedly
      }
      setNotifications((prev) => {
        const updated = prev.filter((n) => (n._id || n.id) !== notificationId);
        saveNotifications(updated).catch(console.error);
        return updated;
      });
    },
    [setNotifications],
  );

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleString("en-GB", {
      hour12: false,
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Color palette for group accents - subtle but distinctive
  const getGroupAccent = (index) => {
    const accents = [
      { light: "#2196F3", dark: "#64b5f6", bg: "rgba(33, 150, 243, 0.08)" },
      { light: "#4CAF50", dark: "#81c784", bg: "rgba(76, 175, 80, 0.08)" },
      { light: "#FF9800", dark: "#ffb74d", bg: "rgba(255, 152, 0, 0.08)" },
      { light: "#E91E63", dark: "#f06292", bg: "rgba(233, 30, 99, 0.08)" },
      { light: "#9C27B0", dark: "#ba68c8", bg: "rgba(156, 39, 176, 0.08)" },
      { light: "#00BCD4", dark: "#4dd0e1", bg: "rgba(0, 188, 212, 0.08)" },
    ];
    return accents[index % accents.length];
  };

  const renderNotificationContent = useMemo(
    () => (item) => (
      <Box
        sx={{
          p: 1,
          mb: 0.75,
          borderRadius: 1.5,
          backgroundColor:
            theme === "light" ? "#f9fafb" : "rgba(255, 255, 255, 0.03)",
          border: `1px solid ${
            theme === "light" ? "#e5e7eb" : "rgba(255, 255, 255, 0.08)"
          }`,
          transition: "all 0.15s ease",
          "&:hover": {
            backgroundColor:
              theme === "light" ? "#f3f4f6" : "rgba(255, 255, 255, 0.05)",
            borderColor:
              theme === "light" ? "#d1d5db" : "rgba(255, 255, 255, 0.12)",
          },
        }}
      >
        <Box display="flex" alignItems="flex-start" gap={1}>
          <Box flex={1}>
            <Typography
              variant="body2"
              sx={{
                color: theme === "light" ? "#374151" : "#d1d5db",
                fontSize: "0.875rem",
                lineHeight: 1.5,
                mb: 0.5,
              }}
            >
              {item.message}
            </Typography>
            <Typography
              variant="caption"
              sx={{
                color: theme === "light" ? "#9ca3af" : "#6b7280",
                fontSize: "0.75rem",
              }}
            >
              {formatTimestamp(item.timeStamp)}
            </Typography>
          </Box>
          <IconButton
            onClick={(e) => {
              e.stopPropagation();
              clearNotification(item._id);
            }}
            size="small"
            aria-label="Dismiss notification"
            sx={{
              color: theme === "light" ? "#9ca3af" : "#6b7280",
              padding: "4px",
              "&:hover": {
                color: theme === "light" ? "#374151" : "#d1d5db",
                backgroundColor:
                  theme === "light"
                    ? "rgba(0, 0, 0, 0.04)"
                    : "rgba(255, 255, 255, 0.08)",
              },
            }}
          >
            <CloseIcon sx={{ fontSize: 16 }} aria-hidden="true" />
          </IconButton>
        </Box>
      </Box>
    ),
    [theme, clearNotification],
  );

  const handleNotificationClick = async (itemTitle) => {
    const { handleNotificationClick } =
      await import("@web/shared/utils/notifications/handleNotificationClick");
    handleNotificationClick(itemTitle, navigate);
  };

  const handleExpandToggle = (title) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [title]: !prev[title],
    }));
  };

  const clearAllNotifications = useCallback(async () => {
    try {
      await apiClient.put(API_ENDPOINTS.CLEAR_ALL_NOTIFICATIONS);
    } catch {
      // still clear from UI
    }
    setNotifications([]);
    saveNotifications([]).catch(console.error);
  }, [setNotifications]);

  return (
    <Box>
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 1,
          pb: 1,
          borderBottom: `1px solid ${
            theme === "light" ? "#e5e7eb" : "rgba(255, 255, 255, 0.12)"
          }`,
        }}
      >
        <Box>
          <Typography
            variant="h6"
            sx={{
              fontWeight: 600,
              fontSize: "1.125rem",
              color: theme === "light" ? "#111827" : "#f9fafb",
              letterSpacing: "-0.01em",
              mb: 0.5,
            }}
          >
            Notifications
          </Typography>
          {notifications.length > 0 && (
            <Typography
              variant="body2"
              sx={{
                color: theme === "light" ? "#6b7280" : "#9ca3af",
                fontSize: "0.875rem",
              }}
            >
              {notifications.length} unread notification
              {notifications.length !== 1 ? "s" : ""}
            </Typography>
          )}
        </Box>

        {notifications.length > 0 && (
          <IconButton
            onClick={clearAllNotifications}
            size="small"
            aria-label="Clear all notifications"
            sx={{
              color: theme === "light" ? "#6b7280" : "#9ca3af",
              fontSize: "0.875rem",
              px: 1.5,
              py: 0.75,
              borderRadius: 1.5,
              "&:hover": {
                color: theme === "light" ? "#374151" : "#d1d5db",
                backgroundColor:
                  theme === "light"
                    ? "rgba(0, 0, 0, 0.04)"
                    : "rgba(255, 255, 255, 0.05)",
              },
            }}
          >
            <DeleteOutlineIcon
              sx={{ fontSize: 18, mr: 0.5 }}
              aria-hidden="true"
            />
            Clear All
          </IconButton>
        )}
      </Box>

      {/* Notifications List */}
      {loading ? (
        <Stack spacing={1}>
          {Array(3)
            .fill(null)
            .map((_, index) => renderSkeleton(index))}
        </Stack>
      ) : groupedNotifications.length > 0 ? (
        <Stack spacing={1.5}>
          <AnimatePresence initial={false}>
            {groupedNotifications.map(([title, group], index) => {
              const accent = getGroupAccent(index);
              return (
                <motion.div
                  key={title}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{
                    opacity: 0,
                    scale: 0.96,
                    transition: { duration: 0.16 },
                  }}
                  transition={{
                    type: "spring",
                    stiffness: 320,
                    damping: 26,
                    delay: index * 0.045,
                  }}
                >
                  <Paper
                    elevation={0}
                    sx={{
                      borderRadius: 2,
                      overflow: "hidden",
                      backgroundColor: theme === "light" ? "#fff" : "#212e35",
                      border: `1px solid ${
                        theme === "light"
                          ? "#e5e7eb"
                          : "rgba(255, 255, 255, 0.12)"
                      }`,
                      transition: "box-shadow 0.2s ease",
                      "&:hover": {
                        boxShadow:
                          theme === "light"
                            ? "0 2px 8px rgba(0, 0, 0, 0.08)"
                            : "0 2px 8px rgba(0, 0, 0, 0.3)",
                      },
                    }}
                  >
                    {/* Group Header */}
                    <Box
                      onClick={() => handleExpandToggle(title)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleExpandToggle(title);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      aria-expanded={expandedGroups[title]}
                      aria-controls={`notification-group-${title}`}
                      sx={{
                        p: 1,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        borderLeft: `3px solid ${
                          theme === "light" ? accent.light : accent.dark
                        }`,
                        borderBottom: expandedGroups[title]
                          ? `1px solid ${
                              theme === "light"
                                ? "#e5e7eb"
                                : "rgba(255, 255, 255, 0.12)"
                            }`
                          : "none",
                        "&:hover": {
                          backgroundColor:
                            theme === "light"
                              ? accent.bg
                              : "rgba(255, 255, 255, 0.02)",
                        },
                      }}
                    >
                      <Stack direction="row" alignItems="center" spacing={1.5}>
                        <Typography
                          variant="subtitle1"
                          sx={{
                            fontWeight: 500,
                            fontSize: "0.9375rem",
                            color: theme === "light" ? "#111827" : "#f9fafb",
                          }}
                        >
                          {title}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{
                            px: 1,
                            py: 0.25,
                            borderRadius: 1,
                            backgroundColor:
                              theme === "light"
                                ? accent.bg
                                : "rgba(255, 255, 255, 0.05)",
                            color:
                              theme === "light" ? accent.light : accent.dark,
                            fontSize: "0.75rem",
                            fontWeight: 600,
                          }}
                        >
                          {group.length}
                        </Typography>
                      </Stack>
                      <IconButton
                        size="small"
                        aria-label={
                          expandedGroups[title]
                            ? `Collapse ${title} notifications`
                            : `Expand ${title} notifications`
                        }
                        tabIndex={-1}
                        sx={{
                          transition: "transform 0.2s ease",
                          transform: expandedGroups[title]
                            ? "rotate(180deg)"
                            : "rotate(0deg)",
                          color: theme === "light" ? "#9ca3af" : "#6b7280",
                        }}
                      >
                        <ExpandMoreIcon
                          sx={{ fontSize: 20 }}
                          aria-hidden="true"
                        />
                      </IconButton>
                    </Box>

                    {/* Notifications in Group */}
                    <Collapse in={expandedGroups[title]} timeout={200}>
                      <Box id={`notification-group-${title}`} sx={{ p: 1.5 }}>
                        {group.map((item, id) => (
                          <Box
                            key={id}
                            onClick={() => handleNotificationClick(item.title)}
                            sx={{ cursor: "pointer" }}
                          >
                            {renderNotificationContent(item)}
                          </Box>
                        ))}
                      </Box>
                    </Collapse>
                  </Paper>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </Stack>
      ) : (
        <Paper
          elevation={0}
          sx={{
            p: 6,
            textAlign: "center",
            borderRadius: 2,
            backgroundColor: theme === "light" ? "#fff" : "#212e35",
            border: `1px solid ${
              theme === "light" ? "#e5e7eb" : "rgba(255, 255, 255, 0.12)"
            }`,
          }}
        >
          <Box
            sx={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              backgroundColor:
                theme === "light"
                  ? "rgba(57, 162, 207, 0.08)"
                  : "rgba(57, 162, 207, 0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              mx: "auto",
              mb: 2,
            }}
          >
            <NotificationsNoneIcon
              sx={{
                fontSize: 32,
                color: theme === "light" ? "#39a2cf" : "#6bb4d6",
              }}
            />
          </Box>
          <Typography
            variant="h6"
            sx={{
              color: theme === "light" ? "#374151" : "#d1d5db",
              fontSize: "0.9375rem",
              fontWeight: 500,
              mb: 0.5,
            }}
          >
            No notifications
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: theme === "light" ? "#9ca3af" : "#6b7280",
              fontSize: "0.8125rem",
            }}
          >
            You're all caught up!
          </Typography>
        </Paper>
      )}
    </Box>
  );
}

export default memo(Notifications);
