import React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import EventNoteIcon from "@mui/icons-material/EventNote";
import DataList from "@web/shared/components/DataList";
import { useDashboard } from "@web/app/providers/DashboardContext";

const formatDate = (dateString) => {
  if (!dateString || typeof dateString !== "string") return "";
  const [year, month, day] = dateString.split("-");
  return `${day}-${month}-${year}`;
};

function HrActivities() {
  const { data, loading } = useDashboard();
  const activities = data.hrActivities;
  const isLoading = loading.hrActivities;

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <Box
        sx={{
          px: 1.5,
          py: 0.75,
          display: "flex",
          alignItems: "center",
          gap: 0.75,
          borderBottom: 1,
          borderColor: "divider",
          flexShrink: 0,
        }}
      >
        <EventNoteIcon sx={{ fontSize: 14, color: "text.secondary" }} />
        <Typography
          variant="subtitle2"
          fontWeight={700}
          sx={{ fontSize: "0.8rem" }}
        >
          HR Activities
        </Typography>
      </Box>

      {/* Scrollable list */}
      <Box
        sx={{
          flex: 1,
          overflow: "auto",
          px: 1,
          py: 0.5,
          "&::-webkit-scrollbar": { width: 4, height: 4 },
          "&::-webkit-scrollbar-thumb": {
            backgroundColor: "rgba(0,0,0,0.1)",
            borderRadius: 4,
          },
        }}
      >
        <DataList
          ariaLabel="HR activities"
          variant="rows"
          striped
          data={activities}
          loading={isLoading}
          emptyMessage="No activities found"
          columns={[
            {
              key: "title",
              label: "Title",
              primary: true,
              render: (activity: any) => activity.title,
            },
            {
              key: "description",
              label: "Description",
              render: (activity: any) => activity.description,
            },
            {
              key: "date",
              label: "Date",
              render: (activity: any) => formatDate(activity.date),
            },
            {
              key: "time",
              label: "Time",
              render: (activity: any) => activity.time,
            },
          ]}
        />
      </Box>
    </Box>
  );
}

export default React.memo(HrActivities);
