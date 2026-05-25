import { memo, useContext, useMemo } from "react";
import Popover from "@mui/material/Popover";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Divider from "@mui/material/Divider";
import Paper from "@mui/material/Paper";
import Chip from "@mui/material/Chip";
import Tooltip from "@mui/material/Tooltip";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import EventIcon from "@mui/icons-material/Event";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import DescriptionIcon from "@mui/icons-material/Description";
import CloseIcon from "@mui/icons-material/Close";
import dayjs from "dayjs";
import "dayjs/locale/en-gb";
import { ThemeContext } from "@web/app/providers/ThemeContext";

function EventPopover({
  openPopover,
  popoverAnchorEl,
  handlePopoverClose,
  selectedEvent,
  onEditEvent,
  onDeleteEvent,
}) {
  const { theme } = useContext(ThemeContext);

  const handleDeleteClick = (event) => {
    handlePopoverClose();
    onDeleteEvent(event);
  };

  const handleEditClick = (event) => {
    const eventData = event.resource || event;
    onEditEvent(eventData);
    handlePopoverClose();
  };

  // Safely get event details
  const getEventDetails = useMemo(() => {
    if (!selectedEvent) return null;

    const eventData = selectedEvent.resource || selectedEvent;

    return {
      id: eventData._id || eventData.id,
      title: eventData.title || "Untitled Event",
      date: eventData.date,
      startTime: eventData.startTime,
      endTime: eventData.endTime,
      description: eventData.description || "",
      allDay: !eventData.startTime,
    };
  }, [selectedEvent]);

  if (!selectedEvent || !getEventDetails) {
    return null;
  }

  const eventDetails = getEventDetails;

  // Format date display
  const formatEventDate = () => {
    const eventDate = dayjs(eventDetails.date);
    const today = dayjs().startOf("day");
    const tomorrow = dayjs().add(1, "day").startOf("day");

    if (eventDate.isSame(today, "day")) {
      return "Today";
    } else if (eventDate.isSame(tomorrow, "day")) {
      return "Tomorrow";
    } else {
      return eventDate.format("dddd, MMMM DD, YYYY");
    }
  };

  // Format time display
  const formatEventTime = () => {
    if (eventDetails.allDay) {
      return "All Day";
    }

    if (eventDetails.startTime && eventDetails.endTime) {
      return `${eventDetails.startTime} - ${eventDetails.endTime}`;
    } else if (eventDetails.startTime) {
      return eventDetails.startTime;
    }

    return "No specific time";
  };

  return (
    <Popover
      open={openPopover}
      anchorEl={popoverAnchorEl}
      onClose={handlePopoverClose}
      anchorOrigin={{
        vertical: "bottom",
        horizontal: "left",
      }}
      transformOrigin={{
        vertical: "top",
        horizontal: "left",
      }}
      PaperProps={{
        elevation: 8,
        sx: {
          borderRadius: 2,
          minWidth: 300,
          maxWidth: 400,
          backgroundColor: theme === "light" ? "#ffffff" : "#1e1e1e",
          border: theme === "light" ? "1px solid #e0e0e0" : "1px solid #333333",
        },
      }}
    >
      <Paper
        elevation={0}
        sx={{
          p: 0,
          backgroundColor: "transparent",
        }}
      >
        {/* Header */}
        <Box
          sx={{
            p: 2,
            pb: 1,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
          }}
        >
          <Box sx={{ flex: 1, mr: 1 }}>
            <Typography
              variant="h6"
              sx={{
                fontWeight: 600,
                lineHeight: 1.2,
                color: "text.primary",
                mb: 0.5,
              }}
            >
              {eventDetails.title}
            </Typography>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.5,
              }}
            >
              <EventIcon sx={{ fontSize: 16 }} />
              {formatEventDate()}
            </Typography>
          </Box>
          <IconButton
            onClick={handlePopoverClose}
            size="small"
            sx={{
              color: "text.secondary",
              "&:hover": {
                backgroundColor: theme === "light" ? "#f5f5f5" : "#333333",
              },
            }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>

        <Divider sx={{ mx: 2 }} />

        {/* Time Information */}
        <Box sx={{ p: 2, py: 1.5 }}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              mb: eventDetails.description ? 1.5 : 0,
            }}
          >
            <AccessTimeIcon
              sx={{
                fontSize: 18,
                color: "text.secondary",
              }}
            />
            <Typography variant="body2" color="text.primary">
              {formatEventTime()}
            </Typography>
            {eventDetails.allDay && (
              <Chip
                label="All Day"
                size="small"
                variant="outlined"
                sx={{
                  height: 20,
                  fontSize: "0.75rem",
                }}
              />
            )}
          </Box>

          {/* Description */}
          {eventDetails.description && (
            <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
              <DescriptionIcon
                sx={{
                  fontSize: 18,
                  color: "text.secondary",
                  mt: 0.1,
                }}
              />
              <Typography
                variant="body2"
                color="text.primary"
                sx={{
                  lineHeight: 1.4,
                  wordBreak: "break-word",
                }}
              >
                {eventDetails.description}
              </Typography>
            </Box>
          )}
        </Box>

        <Divider sx={{ mx: 2 }} />

        {/* Action Buttons */}
        <Box
          sx={{
            p: 2,
            pt: 1.5,
            display: "flex",
            gap: 1,
            justifyContent: "flex-end",
          }}
        >
          <Tooltip title="Edit Event">
            <IconButton
              onClick={() => handleEditClick(selectedEvent)}
              size="small"
              sx={{
                color: "primary.main",
                "&:hover": {
                  backgroundColor: theme === "light" ? "#f3f4f6" : "#374151",
                },
              }}
            >
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete Event">
            <IconButton
              onClick={() => handleDeleteClick(selectedEvent)}
              size="small"
              sx={{
                color: "error.main",
                "&:hover": {
                  backgroundColor: theme === "light" ? "#fef2f2" : "#7f1d1d",
                },
              }}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Paper>
    </Popover>
  );
}

export default memo(EventPopover);
