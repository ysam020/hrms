import createTheme from "@mui/material/styles/createTheme";

function useMuiTheme(theme) {
  const muiTheme = createTheme({
    cssVariables: true,
    palette: {
      mode: theme,
      primary: {
        main: "#39a2cf",
        light: "#6bb4d6",
        dark: "#2976a1",
        contrastText: "#ffffff",
      },
      secondary: {
        main: "#6c5dfc",
        light: "#8975fd",
        dark: "#5541d8",
        contrastText: "#ffffff",
      },
      background: {
        default: theme === "light" ? "#fff" : "#111B21",
        paper: theme === "light" ? "#fff" : "#212e35",
      },
      text: {
        primary: theme === "light" ? "#000" : "#cacfd1ff",
        secondary: theme === "light" ? "#64748b" : "#b2b8c2ff",
      },
      divider:
        theme === "light" ? "rgba(0, 0, 0, 0.12)" : "rgba(255, 255, 255, 0.12)",
      error: {
        main: "#f44336",
        light: "#e57373",
        dark: "#d32f2f",
      },
      warning: {
        main: "#ff9800",
        light: "#ffb74d",
        dark: "#f57c00",
      },
      info: {
        main: "#2196f3",
        light: "#64b5f6",
        dark: "#1976d2",
      },
      success: {
        main: "#4caf50",
        light: "#81c784",
        dark: "#388e3c",
      },
    },
    typography: {
      fontFamily: '"Poppins", "Roboto", "Helvetica", "Arial", sans-serif',
    },
    shape: {
      borderRadius: 8,
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          "html, body, #root": {
            backgroundColor: theme === "light" ? "#F9FAFB" : "#111B21",
            height: "100%",
          },
        },
      },

      // Svg Icons - Default theme-based colors
      MuiSvgIcon: {
        styleOverrides: {
          root: {
            color: theme === "light" ? "#5c6064ff" : "#f3f4f6",
          },
        },
      },

      // Alert Components
      MuiAlert: {
        styleOverrides: {
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
          filledSuccess: {
            backgroundColor: theme === "light" ? undefined : "#2e7d32",
          },
          filledError: {
            backgroundColor: theme === "light" ? undefined : "#c62828",
          },
          filledWarning: {
            backgroundColor: theme === "light" ? undefined : "#e65100",
          },
          filledInfo: {
            backgroundColor: theme === "light" ? undefined : "#1565c0",
          },
        },
      },

      // Button Components
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: "none",
            borderRadius: 8,
            padding: "8px 20px",
            fontFamily: '"Poppins", sans-serif',
            fontWeight: 500,
            boxShadow:
              theme === "light"
                ? "0 2px 8px rgba(0, 0, 0, 0.1)"
                : "0 2px 8px rgba(0, 0, 0, 0.3)",
            "&:hover": {
              boxShadow:
                theme === "light"
                  ? "0 4px 12px rgba(0, 0, 0, 0.15)"
                  : "0 4px 12px rgba(0, 0, 0, 0.4)",
            },
            // The global MuiSvgIcon override below pins every icon to a fixed
            // grey by default, which breaks a button icon's natural
            // currentColor inheritance (e.g. a white icon on a contained
            // button). Restore inheritance specifically for button icons.
            "& .MuiSvgIcon-root": {
              color: "inherit",
            },
          },
          containedPrimary: {
            backgroundColor: theme === "light" ? "#111b21" : "#0c3f61",
            color: "#fff",
            "&:hover": {
              backgroundColor: theme === "light" ? "#0f1a1f" : "#0a3555",
            },
          },
        },
      },

      MuiIconButton: {
        styleOverrides: {
          root: {
            borderRadius: 4,
            padding: 5,
            "&:hover": {
              backgroundColor:
                theme === "light"
                  ? "rgba(0, 0, 0, 0.04)"
                  : "rgba(255, 255, 255, 0.08)",
            },
          },
        },
      },

      // Card Components
      MuiCard: {
        styleOverrides: {
          root: {
            backgroundColor: theme === "light" ? "#fff" : "#212e35",
            boxShadow:
              theme === "light"
                ? "0 4px 20px rgba(0, 0, 0, 0.1)"
                : "0 4px 20px rgba(0, 0, 0, 0.3)",
            borderRadius: 12,
          },
        },
      },

      // Paper Components
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: "none",
            backgroundColor: theme === "light" ? "#fff" : "#212e35",
            boxShadow:
              theme === "light"
                ? "0 4px 20px rgba(0, 0, 0, 0.1)"
                : "0 4px 20px rgba(0, 0, 0, 0.3)",
          },
          elevation1: {
            boxShadow:
              theme === "light"
                ? "0 2px 8px rgba(0, 0, 0, 0.08)"
                : "0 2px 8px rgba(0, 0, 0, 0.25)",
          },
        },
      },

      // Drawer Components
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundColor: theme === "light" ? "#F9FAFB" : "#111B21",
            backgroundImage: "none",
          },
        },
      },

      // Dialog Components
      MuiDialog: {
        styleOverrides: {
          paper: {
            backgroundColor: theme === "light" ? "#fff" : "#212e35",
            borderRadius: 12,
          },
        },
      },

      MuiDialogTitle: {
        styleOverrides: {
          root: {
            backgroundColor:
              theme === "light" ? "background.default" : "#1a252b",
            borderBottom: `1px solid ${
              theme === "light" ? "#e9ecef" : "#374151"
            }`,
            fontWeight: 600,
            fontSize: "1.25rem",
            padding: "16px 24px",
          },
        },
      },

      MuiDialogContent: {
        styleOverrides: {
          root: {
            padding: "20px !important",
          },
        },
      },

      MuiDialogActions: {
        styleOverrides: {
          root: {
            padding: "16px 24px",
            borderTop: `1px solid ${theme === "light" ? "#e9ecef" : "#374151"}`,
            backgroundColor:
              theme === "light" ? "background.default" : "#1a252b",
          },
        },
      },

      // Backdrop Components — dims/blurs real dialogs, but must stay
      // transparent for Popover/Menu/Select/Autocomplete, which render an
      // "invisible" backdrop purely to catch outside clicks. Styling this on
      // MuiModal (rather than MuiBackdrop's own root/invisible slots) would
      // unconditionally override that transparency and dim the whole page
      // behind every open dropdown.
      MuiBackdrop: {
        styleOverrides: {
          root: {
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            backdropFilter: "blur(4px)",
          },
          invisible: {
            backgroundColor: "transparent",
            backdropFilter: "none",
          },
        },
      },

      // List Components
      MuiList: {
        styleOverrides: {
          root: {
            padding: 0,
          },
        },
      },

      MuiListItem: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            margin: "4px 0",
            "&:hover": {
              backgroundColor:
                theme === "light"
                  ? "rgba(0, 0, 0, 0.04)"
                  : "rgba(255, 255, 255, 0.08)",
            },
          },
        },
      },

      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            "&:hover": {
              backgroundColor:
                theme === "light"
                  ? "rgba(0, 0, 0, 0.04)"
                  : "rgba(255, 255, 255, 0.08)",
            },
          },
        },
      },

      MuiListItemText: {
        styleOverrides: {
          secondary: {
            textAlign: "right",
          },
        },
      },

      // Input Components
      MuiTextField: {
        styleOverrides: {
          root: {
            "& .MuiOutlinedInput-root": {
              backgroundColor: theme === "light" ? "#fff" : "#1a252b",
              borderRadius: 8,
              "& fieldset": {
                borderColor: theme === "light" ? "#d1d5db" : "#374151",
              },
              "&:hover fieldset": {
                borderColor: theme === "light" ? "#9ca3af" : "#4b5563",
              },
              "&.Mui-focused fieldset": {
                borderColor: "#39a2cf",
              },
            },
            "& .MuiInputLabel-root": {
              color: theme === "light" ? "#6b7280" : "#9ca3af",
            },
            "& .MuiOutlinedInput-input": {
              color: theme === "light" ? "#111827" : "#f9fafb",
            },
          },
        },
      },

      MuiFormControl: {
        styleOverrides: {
          root: {
            width: "100%",
          },
        },
      },

      MuiInputBase: {
        styleOverrides: {
          root: {
            backgroundColor: theme === "light" ? "#fff" : "#1a252b",
            borderRadius: 8,
          },
        },
      },

      // Selection Components
      MuiSelect: {
        styleOverrides: {
          root: {
            backgroundColor: theme === "light" ? "#fff" : "#1a252b",
            borderRadius: 8,
          },
        },
      },

      MuiMenuItem: {
        styleOverrides: {
          root: {
            "&:hover": {
              backgroundColor:
                theme === "light"
                  ? "rgba(57, 162, 207, 0.1)"
                  : "rgba(57, 162, 207, 0.2)",
            },
            "&.Mui-selected": {
              backgroundColor:
                theme === "light"
                  ? "rgba(57, 162, 207, 0.15)"
                  : "rgba(57, 162, 207, 0.25)",
              "&:hover": {
                backgroundColor:
                  theme === "light"
                    ? "rgba(57, 162, 207, 0.2)"
                    : "rgba(57, 162, 207, 0.3)",
              },
            },
          },
        },
      },

      // Checkbox and Switch Components
      MuiCheckbox: {
        styleOverrides: {
          root: {
            color: theme === "light" ? "#6b7280" : "#9ca3af",
            "&.Mui-checked": {
              color: "#39a2cf",
            },
          },
        },
      },

      MuiSwitch: {
        styleOverrides: {
          root: {
            "& .MuiSwitch-switchBase": {
              "&.Mui-checked": {
                color: "#39a2cf",
                "& + .MuiSwitch-track": {
                  backgroundColor: "#39a2cf",
                },
              },
            },
            "& .MuiSwitch-track": {
              backgroundColor: theme === "light" ? "#d1d5db" : "#4b5563",
            },
          },
        },
      },

      // Slider Components
      MuiSlider: {
        styleOverrides: {
          root: {
            color: "#05b6d3",
            height: 2,
            width: 400,
            marginLeft: 30,
            "& .MuiSlider-thumb": {
              backgroundColor: "#05b6d3",
              "&:hover": {
                boxShadow: "0 0 0 8px rgba(5, 182, 211, 0.16)",
              },
            },
            "& .MuiSlider-track": {
              backgroundColor: "#05b6d3",
            },
            "& .MuiSlider-rail": {
              backgroundColor: theme === "light" ? "#e5e7eb" : "#4b5563",
            },
          },
        },
      },

      // Chip Components
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: 16,
            fontWeight: 500,
          },
          colorPrimary: {
            backgroundColor: theme === "light" ? "#e3f2fd" : "#1565c0",
            color: theme === "light" ? "#1565c0" : "#e3f2fd",
          },
        },
      },

      // AppBar Components
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: theme === "light" ? "#fff" : "#111B21",
            boxShadow:
              theme === "light"
                ? "0 1px 3px rgba(0, 0, 0, 0.1)"
                : "0 1px 3px rgba(0, 0, 0, 0.3)",
          },
        },
      },

      MuiToolbar: {
        styleOverrides: {
          root: {
            padding: "0 16px",
          },
        },
      },

      // Tooltip Components
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            backgroundColor: theme === "light" ? "#374151" : "#f9fafb",
            color: theme === "light" ? "#f9fafb" : "#374151",
            fontSize: "0.75rem",
            borderRadius: 6,
          },
          arrow: {
            color: theme === "light" ? "#374151" : "#f9fafb",
          },
        },
      },

      // Typography Components
      MuiTypography: {
        styleOverrides: {
          root: {
            color: theme === "light" ? "#111827" : "#f9fafb",
          },
          h1: {
            fontSize: "2.25rem",
            fontWeight: 700,
          },
          h2: {
            fontSize: "1.875rem",
            fontWeight: 600,
          },
          h3: {
            fontSize: "1.5rem",
            fontWeight: 600,
          },
          h4: {
            fontSize: "1.25rem",
            fontWeight: 600,
          },
          h5: {
            fontSize: "1.125rem",
            fontWeight: 500,
            marginTop: "30px",
            marginBottom: "10px",
          },
          h6: {
            fontSize: "1rem",
            fontWeight: 500,
          },
        },
      },

      // Grid Components
      MuiGrid2: {
        styleOverrides: {
          root: {
            "&.MuiGrid2-direction-xs-row": {
              marginBottom: "5px",
            },
          },
        },
      },

      // Divider Components
      MuiDivider: {
        styleOverrides: {
          root: {
            borderColor: theme === "light" ? "#e5e7eb" : "#374151",
          },
        },
      },

      // Box Components
      MuiBox: {
        styleOverrides: {
          root: {},
        },
      },

      // Avatar Components
      MuiAvatar: {
        styleOverrides: {
          root: {
            backgroundColor: theme === "light" ? "#e5e7eb" : "#4b5563",
            color: theme === "light" ? "#374151" : "#f9fafb",
          },
        },
      },

      // Badge Components
      MuiBadge: {
        styleOverrides: {
          badge: {
            backgroundColor: "#ef4444",
            color: "#fff",
            fontWeight: 600,
          },
        },
      },

      // Tab Components
      MuiTabs: {
        styleOverrides: {
          root: {
            backgroundColor:
              theme === "light" ? "background.default" : "#111b21",
            borderRadius: 8,
            minHeight: 48,
          },
          indicator: {
            backgroundColor: "#39a2cf",
          },
        },
      },

      MuiTab: {
        styleOverrides: {
          root: {
            textTransform: "none",
            fontWeight: 500,
            "&.Mui-selected": {
              color: "#39a2cf",
            },
          },
        },
      },
    } as any,
  });

  return muiTheme;
}

export default useMuiTheme;
