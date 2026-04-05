import React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import RefreshIcon from "@mui/icons-material/Refresh";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";

function ErrorFallback({
  error,
  resetErrorBoundary,
}: {
  error?: any;
  resetErrorBoundary?: () => void;
}) {
  return (
    <Box
      role="alert"
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        minHeight: 200,
        gap: 2,
        p: 4,
        textAlign: "center",
      }}
    >
      <ErrorOutlineIcon
        sx={{ fontSize: 48, color: "error.main", opacity: 0.8 }}
      />
      <Typography variant="h6" fontWeight={600} color="text.primary">
        Something went wrong
      </Typography>
      {error?.message && (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ maxWidth: 400, opacity: 0.8 }}
        >
          {error.message}
        </Typography>
      )}
      {resetErrorBoundary && (
        <Button
          variant="outlined"
          size="small"
          startIcon={<RefreshIcon />}
          onClick={resetErrorBoundary}
          sx={{ mt: 1, textTransform: "none" }}
        >
          Try again
        </Button>
      )}
      {!resetErrorBoundary && (
        <Button
          variant="outlined"
          size="small"
          startIcon={<RefreshIcon />}
          onClick={() => window.location.reload()}
          sx={{ mt: 1, textTransform: "none" }}
        >
          Reload page
        </Button>
      )}
    </Box>
  );
}

export default React.memo(ErrorFallback);
