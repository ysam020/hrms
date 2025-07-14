import React, { Suspense } from "react";
import { styled } from "@mui/material/styles";
import Button from "@mui/material/Button";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import { ThemeContext } from "../../contexts/ThemeContext";

const CustomUploadButton = React.forwardRef(({ name, onChange }, ref) => {
  const { theme } = React.useContext(ThemeContext);

  const BootstrapButton = styled(Button)({
    backgroundColor: theme === "light" ? "#111b21" : "#0c3f61",
    color: "#fff",
    padding: "8px 20px",
    cursor: "pointer",
    boxShadow: "0 0 20px 1px rgba(0, 0, 0, 0.3)",
    borderRadius: "8px",
    marginTop: "10px",
    textTransform: "none",
    fontFamily: [
      "-apple-system",
      "BlinkMacSystemFont",
      '"Segoe UI"',
      "Roboto",
      '"Helvetica Neue"',
      "Arial",
      "sans-serif",
      '"Apple Color Emoji"',
      '"Segoe UI Emoji"',
      '"Segoe UI Symbol"',
    ].join(","),
    "&:hover": {
      backgroundColor: theme === "light" ? "#111b21" : "#0c3f61",
      boxShadow: "0 0 20px 1px rgba(0, 0, 0, 0.3)",
    },
  });

  const VisuallyHiddenInput = styled("input")({
    clip: "rect(0 0 0 0)",
    clipPath: "inset(50%)",
    height: 1,
    overflow: "hidden",
    position: "absolute",
    bottom: 0,
    left: 0,
    whiteSpace: "nowrap",
    width: 1,
  });

  return (
    <BootstrapButton
      component="label"
      role={undefined}
      variant="contained"
      tabIndex={-1}
      onChange={onChange}
      startIcon={
        <Suspense fallback={<div>Loading Icon...</div>}>
          <CloudUploadIcon
            style={{
              margin: 0,
              width: 20,
              height: 20,
              marginRight: 10,
              color: "#fff",
            }}
          />
        </Suspense>
      }
    >
      {name}
      <VisuallyHiddenInput type="file" multiple />
    </BootstrapButton>
  );
});

export default React.memo(CustomUploadButton);
