import CircularProgress from "@mui/material/CircularProgress";
import React from "react";

function Loading() {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
      }}
    >
      <CircularProgress />
    </div>
  );
}

export default React.memo(Loading);
