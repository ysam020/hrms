import React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Skeleton from "@mui/material/Skeleton";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Tooltip from "@mui/material/Tooltip";
import EventNoteIcon from "@mui/icons-material/EventNote";
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

      {/* Scrollable table */}
      <TableContainer
        sx={{
          flex: 1,
          overflow: "auto",
          bgcolor: "transparent",
          "&::-webkit-scrollbar": { width: 4, height: 4 },
          "&::-webkit-scrollbar-thumb": {
            backgroundColor: "rgba(0,0,0,0.1)",
            borderRadius: 4,
          },
        }}
      >
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              {[
                { label: "Title", width: 90 },
                { label: "Description", width: 120 },
                { label: "Date", width: 70 },
                { label: "Time", width: 55 },
              ].map(({ label, width }) => (
                <TableCell
                  key={label}
                  sx={{
                    fontWeight: 700,
                    fontSize: "0.7rem",
                    py: 0.5,
                    bgcolor: "background.paper",
                    whiteSpace: "nowrap",
                    width,
                    maxWidth: width,
                  }}
                >
                  {label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              [...Array(2)].map((_, i) => (
                <TableRow key={i}>
                  {[...Array(4)].map((__, j) => (
                    <TableCell key={j} sx={{ py: 0.5 }}>
                      <Skeleton height={12} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : activities.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  align="center"
                  sx={{ py: 2, color: "text.secondary", fontSize: "0.75rem" }}
                >
                  No activities found
                </TableCell>
              </TableRow>
            ) : (
              activities.map((activity, index) => (
                <TableRow key={activity.id || index} hover>
                  <Tooltip title={activity.title || ""} placement="top" arrow>
                    <TableCell
                      sx={{
                        fontSize: "0.73rem",
                        py: 0.5,
                        width: 90,
                        maxWidth: 90,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {activity.title}
                    </TableCell>
                  </Tooltip>
                  <Tooltip
                    title={activity.description || ""}
                    placement="top"
                    arrow
                  >
                    <TableCell
                      sx={{
                        fontSize: "0.73rem",
                        py: 0.5,
                        width: 120,
                        maxWidth: 120,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {activity.description}
                    </TableCell>
                  </Tooltip>
                  <Tooltip
                    title={formatDate(activity.date) || ""}
                    placement="top"
                    arrow
                  >
                    <TableCell
                      sx={{
                        fontSize: "0.73rem",
                        py: 0.5,
                        width: 70,
                        maxWidth: 70,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {formatDate(activity.date)}
                    </TableCell>
                  </Tooltip>
                  <Tooltip title={activity.time || ""} placement="top" arrow>
                    <TableCell
                      sx={{
                        fontSize: "0.73rem",
                        py: 0.5,
                        width: 55,
                        maxWidth: 55,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {activity.time}
                    </TableCell>
                  </Tooltip>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

export default React.memo(HrActivities);
