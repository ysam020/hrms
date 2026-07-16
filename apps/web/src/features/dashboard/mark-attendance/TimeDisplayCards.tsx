import { memo } from "react";
import CardContent from "@mui/material/CardContent";
import Grid from "@mui/material/Grid2";
import { TimeCard } from "./TimeCard";

export const TimeDisplayCards = memo(
  ({
    loading,
    todayTimeIn,
    todayTimeOut,
    theme,
    isInitialLoading,
  }: {
    loading: boolean;
    todayTimeIn: any;
    todayTimeOut: any;
    theme: any;
    isInitialLoading: boolean;
  }) => (
    <div style={{ marginBottom: 0, boxShadow: "none !important" }}>
      <CardContent sx={{ p: 0, "&:last-child": { pb: 0 } }}>
        <Grid container spacing={1}>
          <Grid size={{ xs: 6 }}>
            <TimeCard
              label="Time In"
              time={todayTimeIn}
              loading={loading}
              isInitialLoading={isInitialLoading}
              colorScheme={{
                background: todayTimeIn
                  ? theme === "light"
                    ? "rgba(46, 125, 50, 0.15)"
                    : "rgba(165, 214, 167, 0.15)"
                  : theme === "light"
                    ? "rgba(255, 255, 255, 0.25)"
                    : "rgba(255, 255, 255, 0.1)",
                color: todayTimeIn
                  ? theme === "light"
                    ? "#2e7d32"
                    : "#a5d6a7"
                  : theme === "light"
                    ? "#333"
                    : "#ccc",
                border: todayTimeIn
                  ? theme === "light"
                    ? "1px solid rgba(46, 125, 50, 0.3)"
                    : "1px solid rgba(165, 214, 167, 0.3)"
                  : theme === "light"
                    ? "1px solid rgba(255, 255, 255, 0.4)"
                    : "1px solid rgba(255, 255, 255, 0.2)",
              }}
            />
          </Grid>
          <Grid size={{ xs: 6 }}>
            <TimeCard
              label="Time Out"
              time={todayTimeOut}
              loading={loading}
              isInitialLoading={isInitialLoading}
              colorScheme={{
                background: todayTimeOut
                  ? theme === "light"
                    ? "rgba(230, 81, 0, 0.15)"
                    : "rgba(255, 204, 128, 0.15)"
                  : theme === "light"
                    ? "rgba(255, 255, 255, 0.25)"
                    : "rgba(255, 255, 255, 0.1)",
                color: todayTimeOut
                  ? theme === "light"
                    ? "#e65100"
                    : "#ffcc80"
                  : theme === "light"
                    ? "#333"
                    : "#ccc",
                border: todayTimeOut
                  ? theme === "light"
                    ? "1px solid rgba(230, 81, 0, 0.3)"
                    : "1px solid rgba(255, 204, 128, 0.3)"
                  : theme === "light"
                    ? "1px solid rgba(255, 255, 255, 0.4)"
                    : "1px solid rgba(255, 255, 255, 0.2)",
              }}
            />
          </Grid>
        </Grid>
      </CardContent>
    </div>
  ),
);
