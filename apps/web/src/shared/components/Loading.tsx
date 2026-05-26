import CircularProgress from "@mui/material/CircularProgress";
import React from "react";

function Loading() {
  return (
    <div
      role="status"
      aria-label="Loading"
      aria-live="polite"
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
      }}
    >
      <CircularProgress />
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export default React.memo(Loading);
