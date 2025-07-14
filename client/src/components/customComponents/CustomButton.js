import * as React from "react";
import { styled } from "@mui/material/styles";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import { ThemeContext } from "../../contexts/ThemeContext";

const circularProgressStyles = {
  margin: 0,
  width: 20,
  height: 20,
  marginRight: 10,
  color: "#fff",
};

function CustomButton(props) {
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

  return (
    <BootstrapButton
      startIcon={
        props.isSubmitting ? (
          <React.Suspense
            fallback={<CircularProgress style={circularProgressStyles} />}
          >
            <CircularProgress style={circularProgressStyles} />
          </React.Suspense>
        ) : null
      }
      type="submit"
      disableRipple
      variant="contained"
      disabled={props.isSubmitting}
    >
      {props.name}
    </BootstrapButton>
  );
}

export default React.memo(CustomButton);
