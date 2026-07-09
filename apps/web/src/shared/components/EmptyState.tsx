import React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { motion } from "framer-motion";

type EmptyStateProps = {
  message?: string;
  icon?: React.ReactElement;
  /** @deprecated Colors now derive from the active MUI theme automatically; this prop is a no-op. */
  theme?: "light" | "dark";
  sx?: object;
  dashed?: boolean;
};

function EmptyState({
  message = "No data available",
  icon,
  sx = {},
  dashed = false,
}: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 28, mass: 0.8 }}
    >
      {/* role="status" + aria-live ensure screen readers announce empty-state
          changes when data loads/clears without a full page navigation. */}
      <Box
        role="status"
        aria-live="polite"
        sx={{
          textAlign: "center",
          py: 3,
          px: 2,
          bgcolor: "action.hover",
          borderRadius: 1.5,
          border: dashed ? "1px dashed" : "1px solid",
          borderColor: "divider",
          ...sx,
        }}
      >
        {icon && (
          <Box
            aria-hidden="true"
            sx={{
              mb: 1,
              color: "text.secondary",
              display: "flex",
              justifyContent: "center",
            }}
          >
            {icon}
          </Box>
        )}
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {message}
        </Typography>
      </Box>
    </motion.div>
  );
}

export default React.memo(EmptyState);
