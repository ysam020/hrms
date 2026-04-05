import React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

type EmptyStateProps = {
  message?: string;
  icon?: React.ReactElement;
  theme?: "light" | "dark";
  sx?: object;
  dashed?: boolean;
};

function EmptyState({
  message = "No data available",
  icon,
  theme = "light",
  sx = {},
  dashed = false,
}: EmptyStateProps) {
  const getEmptyStateStyles = () => {
    return {
      textAlign: "center",
      py: 3,
      px: 2,
      backgroundColor: theme === "light" ? "#f9f9f9" : "#111b21",
      borderRadius: 1,
      border: dashed
        ? `1px dashed ${
            theme === "light" ? "#ccc" : "rgba(255, 255, 255, 0.12)"
          }`
        : `1px solid ${
            theme === "light" ? "#e0e0e0" : "rgba(255, 255, 255, 0.12)"
          }`,
      ...sx,
    };
  };

  return (
    <Box sx={getEmptyStateStyles()}>
      {icon && <Box sx={{ mb: 1, color: "text.secondary" }}>{icon}</Box>}
      <Typography variant="body2" color="text.secondary">
        {message}
      </Typography>
    </Box>
  );
}

export default React.memo(EmptyState);
