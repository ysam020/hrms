import React, {
  useState,
  useEffect,
  Suspense,
  useContext,
  useMemo,
  useCallback,
} from "react";
import { Calendar, dayjsLocalizer } from "react-big-calendar";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore";
import utc from "dayjs/plugin/utc";
import "dayjs/locale/en-gb";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "../../styles/rbc.scss";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import Chip from "@mui/material/Chip";
import Tooltip from "@mui/material/Tooltip";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import AddIcon from "@mui/icons-material/Add";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import TodayIcon from "@mui/icons-material/Today";
import ViewModuleIcon from "@mui/icons-material/ViewModule";
import ViewDayIcon from "@mui/icons-material/ViewDay";
import ViewWeekIcon from "@mui/icons-material/ViewWeek";
import EventNoteIcon from "@mui/icons-material/EventNote";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import apiClient from "@web/core/http/axiosConfig";
import useFetchData from "@web/shared/hooks/useFetchData";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import Grid from "@mui/material/Grid2";
import { useLocation } from "react-router-dom";
import ConfirmationDialog from "@web/shared/components/ConfirmationDialog";
import { API_ENDPOINTS } from "@web/shared/constants";
import CircularProgress from "@mui/material/CircularProgress";

const AddEventModal = React.lazy(
  () => import("@web/features/layout/modals/AddEventModal"),
);
const EventPopover = React.lazy(() => import("./EventPopover"));

// Extend dayjs with required plugins
dayjs.extend(relativeTime);
dayjs.extend(isSameOrBefore);
dayjs.extend(utc);

const localizer = dayjsLocalizer(dayjs);

const CustomCalendar = () => {
  const location = useLocation();
  const [currentDate, setCurrentDate] = useState(() => {
    if (location.state?.targetDate) {
      return dayjs(location.state.targetDate).toDate();
    }
    return new Date();
  });
  const [currentView, setCurrentView] = useState(() => {
    if (location.state?.view) {
      return location.state.view;
    }
    return "month";
  });
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [popoverAnchorEl, setPopoverAnchorEl] = useState<Element | null>(null);
  const [open, setOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<any>(null);
  const [editEventData, setEditEventData] = useState<any>(null);
  const [isEditMode, setIsEditMode] = useState(false);

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [eventToDelete, setEventToDelete] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const { theme } = useContext(ThemeContext);

  // Fetch calendar events using custom hook
  const { data: events, refetch } = useFetchData(
    "/get-calendar-events",
    "get",
    [],
    null,
    null,
  );

  // Calculate upcoming events
  const upcomingEvents = useMemo(() => {
    if (!events || !Array.isArray(events)) return [];

    const now = new Date();
    const todayUTC = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const todayFormatted = todayUTC.toISOString().split("T")[0];

    return events
      .filter((event) => event.date >= todayFormatted)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 5);
  }, [events]);

  // Apply theme class to document root for CSS targeting
  useEffect(() => {
    document.documentElement.id = theme;
    return () => {
      document.documentElement.id = "";
    };
  }, [theme]);

  const handleOpen = useCallback((slotInfo = null) => {
    setSelectedSlot(slotInfo);
    setEditEventData(null);
    setIsEditMode(false);
    setOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
    setSelectedSlot(null);
    setEditEventData(null);
    setIsEditMode(false);
  }, []);

  const handleEditEvent = useCallback((eventData) => {
    setEditEventData(eventData);
    setSelectedSlot(null);
    setIsEditMode(true);
    setOpen(true);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!eventToDelete) return;

    try {
      setIsDeleting(true);

      // Get the correct event ID
      const eventId =
        eventToDelete.resource?._id || eventToDelete._id || eventToDelete.id;

      if (!eventId) {
        throw new Error("No event ID found");
      }

      // Close popover immediately
      setPopoverAnchorEl(null);
      setSelectedEvent(null);

      // Close dialog immediately for smoother UX
      setDeleteDialogOpen(false);
      setEventToDelete(null);

      // Make API call to delete
      await apiClient.delete(API_ENDPOINTS.DELETE_CALENDAR_EVENT(eventId), {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 10000,
      });

      // Refetch events after successful deletion
      refetch();
    } catch (error) {
      console.error("Error deleting event:", error);
      alert("Failed to delete event. Please try again.");

      // Refetch to ensure UI is in sync with server
      refetch();
    } finally {
      setIsDeleting(false);
    }
  }, [eventToDelete, refetch]);

  const handleDeleteEvent = useCallback((event) => {
    // Close popover immediately when delete is initiated
    setPopoverAnchorEl(null);
    setSelectedEvent(null);

    // Set event to delete and open confirmation dialog
    setEventToDelete(event);
    setDeleteDialogOpen(true);
  }, []);

  // Cancel delete
  const handleDeleteCancel = useCallback(() => {
    setDeleteDialogOpen(false);
    setEventToDelete(null);
  }, []);

  // Transform events for React Big Calendar
  const calendarEvents = useMemo(() => {
    if (!events || !Array.isArray(events)) return [];

    return events.map((event) => {
      const eventDate = dayjs(event.date).toDate();
      let startTime, endTime;

      if (event.startTime) {
        startTime = dayjs(`${event.date} ${event.startTime}`).toDate();
      } else {
        startTime = eventDate;
      }

      if (event.endTime) {
        endTime = dayjs(`${event.date} ${event.endTime}`).toDate();
      } else if (event.startTime) {
        endTime = dayjs(`${event.date} ${event.startTime}`)
          .add(1, "hour")
          .toDate();
      } else {
        endTime = dayjs(eventDate).add(1, "hour").toDate();
      }

      return {
        id: event._id,
        title: event.title,
        start: startTime,
        end: endTime,
        description: event.description,
        resource: event,
        allDay: !event.startTime,
      };
    });
  }, [events]);

  useEffect(() => {
    if (location.state?.targetDate) {
      const targetDate = dayjs(location.state.targetDate).toDate();
      setCurrentDate(targetDate);

      if (location.state.view) {
        setCurrentView(location.state.view);
      }

      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const handleSelectEvent = useCallback((event, e) => {
    setSelectedEvent(event);
    setPopoverAnchorEl(e.currentTarget);
  }, []);

  const handleSelectSlot = useCallback(
    (slotInfo) => {
      handleOpen(slotInfo);
    },
    [handleOpen],
  );

  const handlePopoverClose = useCallback(() => {
    setPopoverAnchorEl(null);
    setSelectedEvent(null);
  }, []);

  // Custom date cell component to control current date highlighting
  const CustomDateCellWrapper = ({ children, value }) => {
    const today = dayjs().startOf("day");
    const cellDate = dayjs(value).startOf("day");
    const viewingCurrentMonth = dayjs(currentDate).isSame(today, "month");

    const isCurrentDateInCurrentMonth =
      cellDate.isSame(today, "day") && viewingCurrentMonth;

    return React.cloneElement(children, {
      className: `${children.props.className} ${
        isCurrentDateInCurrentMonth ? "rbc-current-highlight" : ""
      }`.trim(),
    });
  };

  // Custom toolbar component with theme integration
  const CustomToolbar = ({ label, onNavigate, onView, view }) => {
    return (
      <Box className="rbc-toolbar-compact" data-theme={theme}>
        <Box className="rbc-btn-group">
          <Tooltip title="Previous">
            <IconButton onClick={() => onNavigate("PREV")} size="small">
              <ChevronLeftIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Today">
            <IconButton onClick={() => onNavigate("TODAY")} size="small">
              <TodayIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Next">
            <IconButton onClick={() => onNavigate("NEXT")} size="small">
              <ChevronRightIcon />
            </IconButton>
          </Tooltip>
        </Box>

        <Typography variant="h6" className="rbc-toolbar-label-compact">
          {label}
        </Typography>

        <Box className="rbc-btn-group">
          <Tooltip title="Month View">
            <IconButton
              onClick={() => onView("month")}
              size="small"
              className={view === "month" ? "active-view" : ""}
            >
              <ViewModuleIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Week View">
            <IconButton
              onClick={() => onView("week")}
              size="small"
              className={view === "week" ? "active-view" : ""}
            >
              <ViewWeekIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Day View">
            <IconButton
              onClick={() => onView("day")}
              size="small"
              className={view === "day" ? "active-view" : ""}
            >
              <ViewDayIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>
    );
  };

  // Custom event component
  const CustomEvent = ({ event }) => {
    const hasTime = event.start && !event.allDay;

    return (
      <Box className="custom-event-compact" data-theme={theme}>
        <Typography variant="caption" className="event-title-compact">
          {event.title}
        </Typography>
        {hasTime && (
          <Typography variant="caption" className="event-time-compact">
            {dayjs(event.start).format("HH:mm")}
          </Typography>
        )}
      </Box>
    );
  };

  // Event style getter with theme awareness
  const eventStyleGetter = useCallback(
    (event) => {
      const baseStyle = {
        borderRadius: "6px",
        border: "none",
        color: "white",
        fontSize: "11px",
        padding: "2px 6px",
        boxShadow:
          theme === "light"
            ? "0 1px 4px rgba(108, 93, 252, 0.3)"
            : "0 1px 4px rgba(108, 93, 252, 0.5)",
        cursor: "pointer",
      };

      return { style: baseStyle };
    },
    [theme],
  );

  // Calendar height calculation
  const calendarHeight = useMemo(() => {
    if (currentView === "month") return "calc(100vh - 200px)";
    if (currentView === "week") return "calc(100vh - 180px)";
    if (currentView === "day") return "calc(100vh - 180px)";
    return "calc(100vh - 200px)";
  }, [currentView]);

  const openPopover = Boolean(popoverAnchorEl);

  return (
    <>
      <Grid container spacing={2} sx={{ p: 1 }}>
        {/* Upcoming Events Sidebar */}
        <Grid size={{ md: 3, xs: 12 }}>
          <Paper
            className="upcoming-events-compact"
            elevation={1}
            data-theme={theme}
          >
            <Box className="upcoming-header">
              <EventNoteIcon className="header-icon" />
              <Typography variant="subtitle1" sx={{ fontWeight: 600, flex: 1 }}>
                Upcoming Events
              </Typography>
              <IconButton onClick={() => handleOpen()}>
                <AddIcon />
              </IconButton>
            </Box>

            <Box className="upcoming-list">
              {upcomingEvents.length > 0 ? (
                upcomingEvents.map((event, id) => (
                  <Paper
                    key={id}
                    className="upcoming-item-compact"
                    elevation={0}
                    data-theme={theme}
                    onClick={() => {
                      const calEvent = calendarEvents.find(
                        (e) => e.id === event._id,
                      );
                      if (calEvent) {
                        setSelectedEvent(event);
                        setPopoverAnchorEl(
                          document.querySelector(".upcoming-item-compact"),
                        );
                      }
                    }}
                  >
                    <Box className="event-content">
                      <Typography variant="body2" className="event-title">
                        {event.title}
                      </Typography>
                      <Box className="event-meta-compact">
                        <CalendarMonthIcon className="meta-icon" />
                        <Typography variant="caption">
                          {dayjs(event.date).format("MMM DD")}
                        </Typography>
                        {event.startTime && (
                          <>
                            <AccessTimeIcon className="meta-icon" />
                            <Typography variant="caption">
                              {event.startTime}
                            </Typography>
                          </>
                        )}
                      </Box>
                    </Box>
                    <Chip
                      size="small"
                      label={dayjs(event.date).fromNow()}
                      className="event-chip"
                    />
                  </Paper>
                ))
              ) : (
                <Box className="no-events">
                  <Typography variant="body2" color="text.secondary">
                    No upcoming events
                  </Typography>
                </Box>
              )}
            </Box>
          </Paper>
        </Grid>

        {/* Main Calendar */}
        <Grid size={{ md: 9, xs: 12 }}>
          <Paper
            className="calendar-compact-container"
            elevation={1}
            data-theme={theme}
          >
            <Calendar
              localizer={localizer}
              events={calendarEvents}
              startAccessor="start"
              endAccessor="end"
              titleAccessor="title"
              onSelectEvent={handleSelectEvent}
              onSelectSlot={handleSelectSlot}
              onNavigate={setCurrentDate}
              onView={setCurrentView}
              view={currentView}
              date={currentDate}
              eventPropGetter={eventStyleGetter}
              selectable
              popup
              components={{
                toolbar: CustomToolbar,
                event: CustomEvent,
                dateCellWrapper: CustomDateCellWrapper,
              }}
              className={`compact-calendar theme-${theme}`}
              style={{ height: calendarHeight }}
              step={30}
              timeslots={2}
              min={new Date(0, 0, 0, 8, 0, 0)}
              max={new Date(0, 0, 0, 20, 0, 0)}
              scrollToTime={new Date(0, 0, 0, 9, 0, 0)}
              dayLayoutAlgorithm="no-overlap"
              formats={{
                timeGutterFormat: "HH:mm",
                eventTimeRangeFormat: ({ start, end }) =>
                  `${dayjs(start).format("HH:mm")} - ${dayjs(end).format(
                    "HH:mm",
                  )}`,
                dayFormat: "ddd DD",
                dateFormat: "DD",
                monthHeaderFormat: "MMMM YYYY",
                dayHeaderFormat: "dddd, MMM DD",
                dayRangeHeaderFormat: ({ start, end }) =>
                  `${dayjs(start).format("MMM DD")} - ${dayjs(end).format(
                    "MMM DD, YYYY",
                  )}`,
                selectRangeFormat: ({ start, end }) =>
                  `${dayjs(start).format("MMM DD")} - ${dayjs(end).format(
                    "MMM DD",
                  )}`,
                agendaHeaderFormat: ({ start, end }) =>
                  `${dayjs(start).format("MMM DD")} - ${dayjs(end).format(
                    "MMM DD, YYYY",
                  )}`,
                agendaDateFormat: "ddd MMM DD",
                agendaTimeFormat: "HH:mm",
                agendaTimeRangeFormat: ({ start, end }) =>
                  `${dayjs(start).format("HH:mm")} - ${dayjs(end).format(
                    "HH:mm",
                  )}`,
              }}
              messages={{
                next: "Next",
                previous: "Previous",
                today: "Today",
                month: "Month",
                week: "Week",
                day: "Day",
                agenda: "Agenda",
                date: "Date",
                time: "Time",
                event: "Event",
                noEventsInRange: "No events in this range",
                showMore: (total) => `+${total} more`,
                yesterday: "Yesterday",
                tomorrow: "Tomorrow",
                allDay: "All Day",
              }}
              views={["month", "week", "day"]}
              drilldownView="day"
              length={7}
              toolbar
              popupOffset={{ x: 30, y: 20 }}
            />
          </Paper>
        </Grid>

        {/* Modals */}
        <Suspense
          fallback={
            <Box
              sx={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                p: 4,
              }}
            >
              <CircularProgress size={24} />
            </Box>
          }
        >
          <AddEventModal
            open={open}
            handleClose={handleClose}
            getEvents={refetch}
            selectedSlot={selectedSlot}
            editEventData={editEventData}
            isEditMode={isEditMode}
          />
        </Suspense>

        <Suspense
          fallback={
            <Box
              sx={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                p: 4,
              }}
            >
              <CircularProgress size={24} />
            </Box>
          }
        >
          <EventPopover
            openPopover={openPopover}
            popoverAnchorEl={popoverAnchorEl}
            handlePopoverClose={handlePopoverClose}
            selectedEvent={selectedEvent}
            onEditEvent={handleEditEvent}
            onDeleteEvent={handleDeleteEvent}
          />
        </Suspense>
      </Grid>

      {/* Delete Confirmation Dialog - Rendered at top level, outside all other components */}
      <ConfirmationDialog
        open={deleteDialogOpen}
        onClose={handleDeleteCancel}
        onConfirm={handleDeleteConfirm}
        title="Delete Event"
        message={`Are you sure you want to delete "${
          eventToDelete?.title || eventToDelete?.resource?.title || "this event"
        }"?`}
        description="This action cannot be undone."
        confirmText={isDeleting ? "Deleting..." : "Delete Event"}
        cancelText="Cancel"
        loading={isDeleting}
        variant="danger"
        theme={theme}
      />
    </>
  );
};

export default React.memo(CustomCalendar);
