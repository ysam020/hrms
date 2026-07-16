import { memo } from "react";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Login from "@mui/icons-material/Login";
import Logout from "@mui/icons-material/Logout";
import Button from "@web/shared/components/Button";

export const AttendanceButtons = memo(
  ({
    disableFields,
    dialogOpen,
    modelsLoading,
    handleAttendance,
    isInitialLoading,
  }: {
    disableFields: any;
    dialogOpen: boolean;
    modelsLoading: boolean;
    handleAttendance: any;
    isInitialLoading: boolean;
  }) => (
    <Stack
      direction="row"
      sx={{ mb: 0 }}
      style={{ marginBottom: "0 !important" }}
    >
      {isInitialLoading ? (
        <>
          <Skeleton
            variant="rounded"
            width={100}
            height={36}
            sx={{ borderRadius: 1 }}
          />
          <Skeleton
            variant="rounded"
            width={100}
            height={36}
            sx={{ borderRadius: 1 }}
          />
        </>
      ) : (
        <>
          {!disableFields.timeIn && (
            <Button
              onClick={() => handleAttendance("timeIn")}
              disabled={dialogOpen || modelsLoading}
              loading={modelsLoading}
              loadingText="Loading models..."
              style={{
                opacity: dialogOpen || modelsLoading ? 0.6 : 1,
                cursor: dialogOpen || modelsLoading ? "not-allowed" : "pointer",
                transition: "opacity 0.2s ease-in-out",
                marginBottom: 0,
              }}
            >
              <Login sx={{ fontSize: 16, mr: 0.5 }} />
              Punch In
            </Button>
          )}
          {disableFields.timeIn && !disableFields.timeOut && (
            <Button
              onClick={() => handleAttendance("timeOut")}
              disabled={dialogOpen || modelsLoading}
              loading={modelsLoading}
              loadingText="Loading models..."
              style={{
                opacity: dialogOpen || modelsLoading ? 0.6 : 1,
                cursor: dialogOpen || modelsLoading ? "not-allowed" : "pointer",
                transition: "opacity 0.2s ease-in-out",
                marginBottom: 0,
              }}
            >
              <Logout sx={{ fontSize: 16 }} />
              Punch Out
            </Button>
          )}
        </>
      )}
    </Stack>
  ),
);
