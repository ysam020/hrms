import React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { motion } from "framer-motion";

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
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 28, mass: 0.8 }}
    >
      {/* role="status" + aria-live ensure screen readers announce empty-state
          changes when data loads/clears without a full page navigation. */}
      <Box role="status" aria-live="polite" sx={getEmptyStateStyles()}>
        {icon && (
          <Box aria-hidden="true" sx={{ mb: 1, color: "text.secondary" }}>
            {icon}
          </Box>
        )}
        <Typography variant="body2" color="text.secondary">
          {message}
        </Typography>
      </Box>
    </motion.div>
  );
}

export default React.memo(EmptyState);
