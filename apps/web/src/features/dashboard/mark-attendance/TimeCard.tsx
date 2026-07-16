import { memo } from "react";
import Skeleton from "@mui/material/Skeleton";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";

export const TimeCard = memo(
  ({
    label,
    time,
    loading,
    colorScheme,
    isInitialLoading,
  }: {
    label: string;
    time: any;
    loading: boolean;
    colorScheme: any;
    isInitialLoading: boolean;
  }) => (
    <Paper
      sx={{
        p: 0.5,
        textAlign: "center",
        backgroundColor: "transparent",
        color: colorScheme.color,
        borderRadius: 3,
        border: colorScheme.border,
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        boxShadow: `
          0 8px 32px rgba(0, 0, 0, 0.1),
          inset 0 1px 0 rgba(255, 255, 255, 0.1),
          0 1px 3px rgba(0, 0, 0, 0.05)
        `,
        transition: "all 0.3s ease-in-out",
        position: "relative",
        overflow: "hidden",
        "&::before": {
          content: '""',
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: `linear-gradient(135deg,
            rgba(255, 255, 255, 0.1) 0%,
            rgba(255, 255, 255, 0.05) 50%,
            rgba(255, 255, 255, 0.02) 100%
          )`,
          borderRadius: "inherit",
          pointerEvents: "none",
        },
        "&:hover": {
          transform: "translateY(-2px)",
          boxShadow: `
            0 12px 40px rgba(0, 0, 0, 0.15),
            inset 0 1px 0 rgba(255, 255, 255, 0.15),
            0 2px 8px rgba(0, 0, 0, 0.08)
          `,
        },
      }}
    >
      {isInitialLoading ? (
        <>
          <Skeleton
            variant="text"
            width={60}
            height={16}
            sx={{ mx: "auto", mb: 0.5 }}
          />
          <Skeleton variant="text" width={80} height={28} sx={{ mx: "auto" }} />
        </>
      ) : (
        <>
          <Typography
            variant="caption"
            display="block"
            fontWeight={600}
            sx={{
              position: "relative",
              zIndex: 1,
              textShadow: "0 1px 2px rgba(0, 0, 0, 0.1)",
            }}
          >
            {label}
          </Typography>
          {loading && time === undefined ? (
            <Skeleton
              variant="text"
              width={60}
              height={28}
              sx={{ mx: "auto" }}
            />
          ) : (
            <Typography
              variant="h6"
              fontWeight={700}
              sx={{
                fontSize: "1.1rem",
                transition: "all 0.2s ease-in-out",
                position: "relative",
                zIndex: 1,
                textShadow: "0 1px 2px rgba(0, 0, 0, 0.1)",
              }}
            >
              {time || "--:--"}
            </Typography>
          )}
        </>
      )}
    </Paper>
  ),
);
