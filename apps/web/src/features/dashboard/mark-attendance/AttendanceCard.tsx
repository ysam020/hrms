import { memo } from "react";
import Skeleton from "@mui/material/Skeleton";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Today from "@mui/icons-material/Today";
import { AttendanceButtons } from "./AttendanceButtons";

export const AttendanceCard = memo(
  ({
    status,
    disableFields,
    dialogOpen,
    handleAttendance,
    modelsLoading,
    isInitialLoading,
  }: {
    status: any;
    disableFields: any;
    dialogOpen: boolean;
    handleAttendance: any;
    modelsLoading: boolean;
    isInitialLoading: boolean;
    currentTime?: any;
    getCurrentTime?: any;
  }) => (
    <Card
      elevation={0}
      sx={{
        boxShadow: "none !important",
        mb: 1,
        bgcolor: "transparent",
      }}
    >
      <CardContent sx={{ p: 0, "&:last-child": { pb: 0 } }}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mb: 1,
            boxShadow: "none !important",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center" }}>
            <Today sx={{ mr: 1, fontSize: 20 }} />
            <Typography variant="subtitle1" fontWeight={600}>
              Today's Attendance
            </Typography>
          </Box>

          {isInitialLoading ? (
            <Skeleton
              variant="rounded"
              width={80}
              height={24}
              sx={{ borderRadius: 3 }}
            />
          ) : (
            <Chip
              size="small"
              label={status.text}
              color={status.color}
              sx={{ fontWeight: 600, fontSize: "0.7rem" }}
            />
          )}
        </Box>

        <AttendanceButtons
          disableFields={disableFields}
          dialogOpen={dialogOpen}
          modelsLoading={modelsLoading}
          handleAttendance={handleAttendance}
          isInitialLoading={isInitialLoading}
        />
      </CardContent>
    </Card>
  ),
);
