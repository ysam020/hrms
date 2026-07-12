import React from "react";
import SearchOffIcon from "@mui/icons-material/SearchOff";
import Typography from "@mui/material/Typography";
import Button from "@web/shared/components/Button";

function UnAuthorisedRoute() {
  const handleClick = () => {
    window.history.back();
  };
  return (
    <div
      style={{
        height: "80vh",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
      }}
    >
      <SearchOffIcon sx={{ fontSize: 96, opacity: 0.4 }} />
      <Typography variant="h6" color="text.secondary">
        Page not found
      </Typography>
      <Button onClick={handleClick}>Go Back</Button>
    </div>
  );
}

export default React.memo(UnAuthorisedRoute);
