import React, { useState, useMemo, useCallback } from "react";
import { Calendar, dayjsLocalizer } from "react-big-calendar";
import dayjs from "dayjs";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore";
import "dayjs/locale/en-gb";
import "react-big-calendar/lib/css/react-big-calendar.css";
import IconButton from "@mui/material/IconButton";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import TodayIcon from "@mui/icons-material/Today";

// Extend dayjs with required plugins
dayjs.extend(isSameOrBefore);

const localizer = dayjsLocalizer(dayjs);

const AttendanceCalendar = (props: {
  attendances: any[];
  setMonth?: (month: number) => void;
  setYear?: (year: number) => void;
}) => {
  const [currentDate, setCurrentDate] = useState(new Date());

  const today = useMemo(() => new Date(), []);

  // Transform attendance data for React Big Calendar
  const attendanceEvents = useMemo(() => {
    return props.attendances.map((attendance: any) => {
      const eventDate = dayjs(attendance.date).toDate();
      const dayOfWeek = dayjs(attendance.date).day(); // 0 = Sunday, 6 = Saturday

      const statusColors: Record<string, string> = {
        present: "#19bc9b",
        "half day": "#ffb002",
        halfday: "#ffb002",
        leave: "#f15c6d",
        weekOff: "#999999",
        holiday: "#4d3c77",
      };

      const statusLabels: Record<string, string> = {
        present: "Present",
        "half day": "Half Day",
        halfday: "Half Day",
        leave: "Leave",
        weekOff: "Week Off",
        holiday: "Holiday",
      };

      let status = attendance.status?.toLowerCase() || "";

      // Prioritize weekOff for Saturday (6) and Sunday (0)
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        status = "weekOff";
      }

      return {
        id: attendance._id || `${attendance.date}-${status}`,
        title: "",
        start: eventDate,
        end: eventDate,
        allDay: true,
        resource: {
          status: status,
          color: statusColors[status] || "#999999",
          label: statusLabels[status] || "Unknown",
          timeIn: attendance.timeIn,
          timeOut: attendance.timeOut,
          originalData: attendance,
          isWeekendOverride: dayOfWeek === 0 || dayOfWeek === 6,
        },
      };
    });
  }, [props.attendances]);

  const canNavigateToFuture = useCallback(
    (date: Date) => {
      const targetMonth = dayjs(date).startOf("month");
      const currentMonth = dayjs(today).startOf("month");
      return targetMonth.isSameOrBefore(currentMonth);
    },
    [today],
  );

  // Handle navigation with future restrictions
  const handleNavigate = useCallback(
    (newDate: Date, _view: string, action: string) => {
      if (action === "NEXT" || action === "DATE") {
        if (!canNavigateToFuture(newDate)) {
          return; // Block navigation to future
        }
      }

      setCurrentDate(newDate);

      // Update parent component state for month/year
      const newDayjs = dayjs(newDate);
      if (props.setMonth) props.setMonth(newDayjs.month());
      if (props.setYear) props.setYear(newDayjs.year());
    },

    [canNavigateToFuture, props.setMonth, props.setYear],
  );

  // Custom toolbar component
  const CustomToolbar = ({
    label,
    onNavigate,
    date,
  }: {
    label: string;
    onNavigate: (action: string) => void;
    date: Date;
  }) => {
    const currentDayjs = dayjs(date);
    const isCurrentMonth = currentDayjs.isSame(dayjs(today), "month");
    const isNextMonthDisabled = !canNavigateToFuture(
      dayjs(date).add(1, "month").toDate(),
    );

    return (
      <Box className="attendance-toolbar-compact">
        <Box className="attendance-nav-compact">
          <IconButton
            onClick={() => onNavigate("PREV")}
            size="small"
            aria-label="Previous month"
          >
            <ChevronLeftIcon />
          </IconButton>

          <IconButton
            onClick={() => onNavigate("TODAY")}
            size="small"
            disabled={isCurrentMonth}
            aria-label="Go to current month"
          >
            <TodayIcon />
          </IconButton>

          <IconButton
            onClick={() => onNavigate("NEXT")}
            size="small"
            disabled={isNextMonthDisabled}
            aria-label="Next month"
          >
            <ChevronRightIcon />
          </IconButton>

          <Typography variant="h6" className="attendance-label-compact">
            {label}
          </Typography>
        </Box>
      </Box>
    );
  };

  // Event style getter
  const eventStyleGetter = useCallback((event: any) => {
    const backgroundColor = event.resource?.color || "#999999";

    return {
      style: {
        backgroundColor,
        border: "none",
        borderRadius: "3px",
        color: "transparent",
        fontSize: "0px",
        padding: "0",
        margin: "1px",
        height: "8px",
        minHeight: "8px",
        maxHeight: "8px",
        display: "block",
        cursor: "default",
      },
    };
  }, []);

  // Date cell style getter with tooltip
  const dayPropGetter = useCallback(
    (date: Date) => {
      const isToday = dayjs(date).isSame(dayjs(today), "day");

      let className = "";
      const style: React.CSSProperties = {};

      if (isToday) {
        className = "attendance-today-compact";
        style.fontWeight = "bold";
      }

      return { className, style };
    },
    [today],
  );

  return (
    <Paper
      className="attendance-calendar-compact"
      elevation={1}
      role="region"
      aria-label="Attendance calendar"
    >
      <Calendar
        localizer={localizer}
        events={attendanceEvents}
        startAccessor="start"
        endAccessor="end"
        titleAccessor="title"
        onNavigate={handleNavigate}
        date={currentDate}
        views={["month"]}
        eventPropGetter={eventStyleGetter}
        dayPropGetter={dayPropGetter}
        components={{
          toolbar: CustomToolbar,
        }}
        className="attendance-calendar-view"
        popup={false}
        selectable={false}
        formats={{
          monthHeaderFormat: "MMMM YYYY",
          dateFormat: "DD",
        }}
        messages={{
          next: "Next",
          previous: "Previous",
          today: "Today",
          month: "Month",
          noEventsInRange: "",
        }}
        style={{ height: 300 }}
        showMultiDayTimes={false}
      />
    </Paper>
  );
};

export default React.memo(AttendanceCalendar);
