import { createTheme } from "@mui/material/styles";

function useMuiTheme(theme) {
  const muiTheme = createTheme({
    palette: {
      mode: theme,
      primary: {
        main: "#39a2cf",
      },
      background: {
        default: theme === "light" ? "#fff" : "#111B21",
        paper: theme === "light" ? "#fff" : "#212e35",
      },
      text: {
        primary: theme === "light" ? "#000" : "#A5A9AB",
      },
    },
    components: {
      MuiSvgIcon: {
        styleOverrides: {
          root: {
            color: theme === "light" ? "#878585" : "#ffffff9f",
          },
        },
      },
      MuiAlert: {
        styleOverrides: {
          root: {
            backgroundColor: theme === "light" ? undefined : "#1A2227",
          },
          standardSuccess: {
            backgroundColor: theme === "light" ? undefined : "#1E4620",
          },
          standardError: {
            backgroundColor: theme === "light" ? undefined : "#441A1A",
          },
          standardWarning: {
            backgroundColor: theme === "light" ? undefined : "#442D0F",
          },
          standardInfo: {
            backgroundColor: theme === "light" ? undefined : "#1A2B4D",
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundColor: theme === "light" ? "#F9FAFB" : "#111B21",
          },
        },
      },
    },
  });

  return muiTheme;
}

export default useMuiTheme;
