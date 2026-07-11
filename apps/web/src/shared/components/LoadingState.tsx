import React, { useContext } from "react";
import CircularProgress from "@mui/material/CircularProgress";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { ThemeContext } from "@web/app/providers/ThemeContext";

function LoadingState({
  height = 400,
  message = undefined,
  size = "medium",
  theme = undefined,
}: {
  height?: number;
  message?: any;
  size?: string;
  theme?: string;
}) {
  const appTheme = useContext(ThemeContext).theme;
  theme = theme ?? appTheme ?? "light";

  const getSpinnerSize = () => {
    switch (size) {
      case "small":
        return 24;
      case "large":
        return 60;
      default:
        return 40;
    }
  };

  return (
    <Box
      role="status"
      aria-label={typeof message === "string" ? message : "Loading"}
      aria-live="polite"
      className="dashboard-container"
      sx={{
        height,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: message ? 2 : 0,
      }}
    >
      <CircularProgress
        size={getSpinnerSize()}
        color={theme === "dark" ? "inherit" : "primary"}
      />
      {message && (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ textAlign: "center" }}
        >
          {message}
        </Typography>
      )}
    </Box>
  );
}

export default React.memo(LoadingState);
