import "../../styles/calendar.scss";
import React, { useState, useEffect } from "react";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import { IconButton, Tooltip } from "@mui/material";
import { months } from "../../assets/data/months";
import { weekdays } from "../../assets/data/weekdays";
import { calculateMonthDetails } from "../../utils/calculateMonthDetails";

const CustomCalendar = (props) => {
  const [daysInMonth, setDaysInMonth] = useState([]);

  const getStatusClass = (day, isCurrentMonth) => {
    if (!isCurrentMonth) return "";

    const dateString = `${props.year}-${String(props.month + 1).padStart(
      2,
      "0"
    )}-${String(day).padStart(2, "0")}`;

    const status = props.attendances.find((entry) => entry.date === dateString);

    return status?.status?.toLowerCase() || "";
  };

  useEffect(() => {
    calculateMonthDetails(
      props.year,
      props.month,
      props.currentDate,
      setDaysInMonth
    );
    // eslint-disable-next-line
  }, [props.month, props.year]);

  const getTooltipTitle = (day, isCurrentMonth) => {
    if (!isCurrentMonth) return ""; // No tooltip for inactive days

    const dateString = `${props.year}-${String(props.month + 1).padStart(
      2,
      "0"
    )}-${String(day).padStart(2, "0")}`;

    const status = props.attendances.find((entry) => entry.date === dateString);

    if (status) {
      switch (status?.status?.toLowerCase()) {
        case "present":
          return "Present";
        case "halfday":
          return "Half Day";
        case "leave":
          return "Leave";
        case "holiday":
          return "Holiday";
        default:
          return "Unknown Status";
      }
    }

    return ""; // No tooltip for dates without status
  };

  const isNextButtonDisabled = () => {
    const currentDate = new Date();
    return (
      props.year === currentDate.getFullYear() &&
      props.month === currentDate.getMonth()
    );
  };

  return (
    <div style={{ marginTop: "20px" }}>
      <header
        style={{
          alignItems: "center",
          justifyContent: "space-between",
          display: "flex",
        }}
      >
        <p className="calendar-current-date">{`${months[props.month]} ${
          props.year
        }`}</p>
        <div className="calendar-navigation">
          <IconButton
            aria-label="previous-month"
            onClick={async () => {
              const { handleCalendarNavigation } = await import(
                "../../utils/handleCalendarNavigation"
              );
              handleCalendarNavigation(
                -1,
                props.month,
                props.year,
                props.setMonth,
                props.setYear
              );
            }}
          >
            <ChevronLeftIcon />
          </IconButton>
          <IconButton
            aria-label="next-month"
            onClick={async () => {
              const { handleCalendarNavigation } = await import(
                "../../utils/handleCalendarNavigation"
              );
              handleCalendarNavigation(
                1,
                props.month,
                props.year,
                props.setMonth,
                props.setYear
              );
            }}
            disabled={isNextButtonDisabled()}
          >
            <ChevronRightIcon />
          </IconButton>
        </div>
      </header>

      <div className="calendar-body">
        <ul className="calendar-weekdays">
          {weekdays.map((weekday, index) => (
            <li key={index}>{weekday}</li>
          ))}
        </ul>
        <ul className="calendar-dates">
          {daysInMonth.map((day, index) => (
            <Tooltip
              key={index}
              title={getTooltipTitle(day.day, day.isCurrentMonth)}
              arrow
            >
              <li
                className={`calendar-day ${
                  day.isCurrentMonth ? "" : "inactive"
                } ${day.isToday ? "active" : ""} ${getStatusClass(
                  day.day,
                  day.isCurrentMonth
                )}`}
              >
                {day.day}
              </li>
            </Tooltip>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default React.memo(CustomCalendar);
