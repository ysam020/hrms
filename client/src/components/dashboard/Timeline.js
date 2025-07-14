import React, { useEffect, useState } from "react";
import { Timeline } from "primereact/timeline";
import apiClient from "../../config/axiosConfig";
import "../../styles/timeline.scss";

function TimelineCustom() {
  const [events, setEvents] = useState([]);

  async function getEvents() {
    try {
      const res = await apiClient(`/get-calendar-events`);

      const now = new Date();
      const todayUTC = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
      );
      const todayFormatted = todayUTC.toISOString().split("T")[0];

      const upcomingEvents = res.data
        .filter((event) => event.date >= todayFormatted)
        .sort((a, b) => new Date(a.date) - new Date(b.date));

      function formatDate(dateStr) {
        const [year, month, day] = dateStr.split("-");
        return `${day}-${month}-${year}`;
      }

      const transformed = upcomingEvents.map((event, index) => ({
        status: event.title || "Event",
        date: `${formatDate(event.date)}, ${event.startTime} - ${
          event.endTime
        }`,
        color: ["#9C27B0", "#673AB7", "#FF9800", "#607D8B"][index % 4],
        description: event.description || "No description provided.",
      }));

      setEvents(transformed);
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => {
    getEvents();
  }, []);

  const customizedContent = (item) => {
    return (
      <p>
        {item.status} <br />
        {item.date}
      </p>
    );
  };

  return (
    <div style={{ width: "100%" }}>
      {events.length === 0 ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            height: "100%",
            justifyContent: "center",
          }}
        >
          <p>No upcoming events available.</p>
        </div>
      ) : (
        <Timeline
          value={events}
          align="left"
          className="customized-timeline"
          content={customizedContent}
        />
      )}
    </div>
  );
}

export default React.memo(TimelineCustom);
