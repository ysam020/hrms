import React, { useContext, useMemo, useState, useEffect } from "react";
import { Box, Skeleton } from "@mui/material";
import { useNavigate } from "react-router-dom";
import useUpdateFavicon from "../../hooks/useUpdateFavicon";
import { NotificationContext } from "../../contexts/NotificationContext";
import { Collapse, IconButton } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import { ThemeContext } from "../../contexts/ThemeContext";

function Notifications() {
  const { notifications, loading } = useContext(NotificationContext);
  const { theme } = useContext(ThemeContext);
  const navigate = useNavigate();
  useUpdateFavicon(notifications);

  const [groupedNotifications, setGroupedNotifications] = useState([]);
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
      acc[title] = false; // Set all groups to collapsed by default
      return acc;
    }, {});

    setGroupedNotifications(Object.entries(grouped)); // Convert to array of [title, notifications]
    setExpandedGroups(defaultExpanded); // Set all groups to be expanded initially
  }, [notifications]);

  const renderSkeleton = useMemo(
    () => (key) =>
      (
        <div
          key={key}
          className="notification-container"
          style={{ display: "block" }}
        >
          <Skeleton width="20%" />
          <Skeleton />
          <Skeleton width="60%" />
        </div>
      ),
    []
  );

  const renderNotificationContent = useMemo(
    () => (item) =>
      (
        <Box
          bgcolor={theme === "light" ? "#f9f9f9" : "#111b21"}
          style={{
            padding: "10px",
            borderRadius: "10px",
            marginBottom: "5px",
            bgcolor: theme === "light" ? "#f9f9f9" : "#111b21",
          }}
        >
          <p>{item.message}</p>
          <p>
            <p>
              {new Date(item.timeStamp).toLocaleString("en-GB", {
                hour12: false,
              })}
            </p>
          </p>
        </Box>
      ),
    // eslint-disable-next-line
    []
  );

  const handleNotificationClick = async (itemTitle) => {
    const { handleNotificationClick } = await import(
      "../../utils/notifications/handleNotificationClick"
    );
    handleNotificationClick(itemTitle, navigate);
  };

  const handleExpandToggle = (title) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [title]: !prev[title],
    }));
  };

  return (
    <div className="notifications">
      <h2 style={{ letterSpacing: 1, fontSize: "30px" }}>Notifications</h2>
      <br />

      {loading ? (
        Array(3)
          .fill(null)
          .map((_, index) => renderSkeleton(index))
      ) : groupedNotifications.length > 0 ? (
        groupedNotifications.map(([title, group], index) => (
          <div key={index} className="notification-container">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
              onClick={() => handleExpandToggle(title)}
            >
              <h4>{title}</h4>
              <IconButton>
                {expandedGroups[title] ? (
                  <ExpandLessIcon />
                ) : (
                  <ExpandMoreIcon />
                )}
              </IconButton>
            </div>

            <Collapse in={expandedGroups[title]}>
              {group.map((item, id) => (
                <div
                  key={id}
                  className="notification-item"
                  onClick={() => handleNotificationClick(item.title)}
                >
                  {renderNotificationContent(item)}
                </div>
              ))}
            </Collapse>
          </div>
        ))
      ) : (
        <div className="notification-container">
          <p>No notifications</p>
        </div>
      )}
    </div>
  );
}

export default React.memo(Notifications);
