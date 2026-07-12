import {
  Fragment,
  memo,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Container from "@mui/material/Container";
import Divider from "@mui/material/Divider";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import SearchIcon from "@mui/icons-material/Search";
import LogoutIcon from "@mui/icons-material/Logout";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import FormatListBulletedIcon from "@mui/icons-material/FormatListBulleted";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import EmailIcon from "@mui/icons-material/Email";
import HeadsetMicIcon from "@mui/icons-material/HeadsetMic";
import { ThemeContext } from "@web/app/providers/ThemeContext";

function Help() {
  const [isMac, setIsMac] = useState(false);
  const { theme } = useContext(ThemeContext);
  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    setIsMac(userAgent.includes("mac"));
  }, []);

  // Memoize keyboard shortcuts with icons
  const keyboardShortcuts = useMemo(
    () => [
      {
        title: "Toggle Fullscreen",
        description: "Switch between fullscreen and windowed mode",
        keys: [isMac ? "⌘" : "Ctrl", "Shift", "F"],
        icon: <FullscreenIcon />,
        category: "View",
      },
      {
        title: "Show/Hide Sidebar",
        description: "Toggle the navigation sidebar",
        keys: [isMac ? "⌘" : "Ctrl", "Shift", "S"],
        icon: <FormatListBulletedIcon />,
        category: "View",
      },
      {
        title: "Route Query",
        description: "Quickly access search functionality",
        keys: ["Shift", "Space"],
        icon: <SearchIcon />,
        category: "Navigation",
      },
      {
        title: "Toggle AI Assistant",
        description: "Open or close the HRMS AI Assistant chatbot",
        keys: [isMac ? "⌘" : "Ctrl", "Shift", "A"],
        icon: <SmartToyIcon />,
        category: "Navigation",
      },
      {
        title: "Navigate Between Pages",
        description: "Move between different pages",
        keys: [isMac ? "⌘" : "Ctrl", "Shift", "← →"],
        icon: <NavigateNextIcon />,
        category: "Navigation",
      },
      {
        title: "Logout",
        description: "Sign out of your account",
        keys: [isMac ? "⌘" : "Ctrl", "Shift", "L"],
        icon: <LogoutIcon />,
        category: "Account",
      },
      {
        title: "Toggle Magnifier",
        description: "Show or hide the DOM magnifier around the cursor",
        keys: [isMac ? "⌥" : "Alt", "M"],
        icon: <ZoomInIcon />,
        category: "View",
      },
    ],
    [isMac],
  );

  // Group shortcuts by category
  const groupedShortcuts = useMemo(() => {
    return keyboardShortcuts.reduce(
      (acc, shortcut) => {
        if (!acc[shortcut.category]) {
          acc[shortcut.category] = [];
        }
        acc[shortcut.category].push(shortcut);
        return acc;
      },
      {} as Record<string, any[]>,
    );
  }, [keyboardShortcuts]);

  const renderShortcutKeys = (keys) => (
    <Stack
      direction="row"
      spacing={{ xs: 0.4, sm: 0.5 }}
      alignItems="center"
      sx={{ flexWrap: "wrap", gap: { xs: 0.4, sm: 0.5 } }}
    >
      {keys.map((key, index) => (
        <Fragment key={index}>
          <Chip
            label={key}
            size="small"
            variant="outlined"
            sx={{
              minWidth: "auto",
              height: { xs: 24, sm: 28 },
              fontSize: { xs: "0.7rem", sm: "0.8rem" },
              fontFamily: "monospace",
              bgcolor: theme === "light" ? "#0991B1" : "#111b21",
              color: "#fff",
              borderColor: theme === "light" ? "#0991B1" : "#111b21",
              borderRadius: 1,
              "&:hover": {
                bgcolor: theme === "light" ? "#0991B1" : "#111b21",
              },
              "& .MuiChip-label": {
                color: "#fff",
                px: { xs: 0.75, sm: 1 },
              },
            }}
          />
          {index < keys.length - 1 && (
            <Typography
              variant="caption"
              sx={{
                mx: { xs: 0.25, sm: 0.5 },
                color: "#fff",
                fontSize: { xs: "0.7rem", sm: "0.75rem" },
              }}
            >
              +
            </Typography>
          )}
        </Fragment>
      ))}
    </Stack>
  );

  return (
    <Container
      maxWidth="md"
      sx={{
        px: { xs: 1.5, sm: 2, md: 3 },
      }}
    >
      {/* App support */}
      <Paper
        elevation={2}
        sx={{ borderRadius: { xs: 2, sm: 3 }, mb: 3, overflow: "hidden" }}
      >
        <Box
          sx={{
            p: { xs: 2, sm: 2 },
            bgcolor: theme === "light" ? "" : "#212e35",
          }}
        >
          <Typography
            variant="h5"
            fontWeight={600}
            gutterBottom
            sx={{
              color: theme === "light" ? "" : "#A5A9AB",
              fontSize: { xs: "1.25rem", sm: "1.5rem" },
            }}
          >
            App Support
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: theme === "light" ? "" : "#A5A9AB",
              fontSize: { xs: "0.85rem", sm: "0.875rem" },
            }}
          >
            For questions or issues with the HRMS application itself, contact
            our support team.
          </Typography>
        </Box>
        <Divider />
        <Box
          sx={{
            p: { xs: 1.5, sm: 2 },
            display: "flex",
            flexDirection: "column",
            gap: 1.5,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <HeadsetMicIcon color="primary" fontSize="small" />
            <Box>
              <Typography
                variant="caption"
                color="text.secondary"
                display="block"
              >
                Support Email
              </Typography>
              <Typography
                component="a"
                href="mailto:support@praesto.cloud"
                variant="body2"
                fontWeight={500}
                sx={{
                  color: "primary.main",
                  textDecoration: "none",
                  "&:hover": { textDecoration: "underline" },
                }}
              >
                support@praesto.cloud
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <EmailIcon color="primary" fontSize="small" />
            <Box>
              <Typography
                variant="caption"
                color="text.secondary"
                display="block"
              >
                Business Enquiries
              </Typography>
              <Typography
                component="a"
                href="mailto:hello@praesto.cloud"
                variant="body2"
                fontWeight={500}
                sx={{
                  color: "primary.main",
                  textDecoration: "none",
                  "&:hover": { textDecoration: "underline" },
                }}
              >
                hello@praesto.cloud
              </Typography>
            </Box>
          </Box>
        </Box>
      </Paper>

      <Paper
        elevation={2}
        sx={{
          borderRadius: { xs: 2, sm: 3 },
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <Box
          sx={{
            bgcolor: theme === "light" ? "" : "#212e35",
            color: "primary.contrastText",
            p: { xs: 2, sm: 2 },
          }}
        >
          <Typography
            variant="h5"
            fontWeight={600}
            gutterBottom
            sx={{
              color: theme === "light" ? "" : "#A5A9AB",
              fontSize: { xs: "1.25rem", sm: "1.5rem" },
            }}
          >
            Keyboard Shortcuts
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: theme === "light" ? "" : "#A5A9AB",
              fontSize: { xs: "0.85rem", sm: "0.875rem" },
            }}
          >
            Master these shortcuts to boost your productivity
          </Typography>
        </Box>

        {/* Content */}
        <Box sx={{ p: { xs: 1.5, sm: 2 } }}>
          <Stack spacing={{ xs: 2.5, sm: 3 }}>
            {Object.entries(groupedShortcuts).map(([category, shortcuts]) => (
              <Box key={category}>
                <Typography
                  variant="h6"
                  fontWeight={600}
                  color="text.primary"
                  sx={{
                    mb: { xs: 0.75, sm: 1 },
                    display: "flex",
                    alignItems: "center",
                    fontSize: { xs: "1rem", sm: "1.25rem" },
                  }}
                >
                  {category}
                  <Box
                    sx={{
                      ml: { xs: 1.5, sm: 2 },
                      height: 1,
                      bgcolor: "divider",
                      flex: 1,
                    }}
                  />
                </Typography>

                <Stack spacing={{ xs: 0.75, sm: 0.5 }}>
                  {shortcuts.map((shortcut, index) => (
                    <Card
                      key={index}
                      variant="outlined"
                      sx={{
                        transition: "all 0.2s ease-in-out",
                        "&:hover": {
                          bgcolor: "action.hover",
                          transform: "translateY(-1px)",
                          boxShadow: 1,
                        },
                      }}
                    >
                      <CardContent
                        sx={{
                          p: { xs: 1.25, sm: 1 },
                          "&:last-child": { pb: { xs: 1.25, sm: 1 } },
                        }}
                      >
                        <Box
                          sx={{
                            display: "flex",
                            flexDirection: { xs: "column", sm: "row" },
                            alignItems: { xs: "flex-start", sm: "center" },
                            justifyContent: "space-between",
                            gap: { xs: 1.5, sm: 2 },
                          }}
                        >
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: { xs: 1, sm: 0.5 },
                              flex: 1,
                              width: { xs: "100%", sm: "auto" },
                            }}
                          >
                            <Box
                              sx={{
                                color: "primary.main",
                                display: "flex",
                                alignItems: "center",
                                "& svg": {
                                  fontSize: { xs: "1.25rem", sm: "1.5rem" },
                                },
                              }}
                            >
                              {shortcut.icon}
                            </Box>
                            <Box sx={{ flex: 1 }}>
                              <Typography
                                variant="subtitle2"
                                fontWeight={600}
                                color="text.primary"
                                sx={{
                                  fontSize: { xs: "0.9rem", sm: "0.875rem" },
                                }}
                              >
                                {shortcut.title}
                              </Typography>
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{
                                  display: "block",
                                  mt: 0.5,
                                  fontSize: { xs: "0.75rem", sm: "0.75rem" },
                                  lineHeight: 1.4,
                                }}
                              >
                                {shortcut.description}
                              </Typography>
                            </Box>
                          </Box>

                          <Box
                            sx={{
                              flexShrink: 0,
                              width: { xs: "100%", sm: "auto" },
                              display: "flex",
                              justifyContent: {
                                xs: "flex-start",
                                sm: "flex-end",
                              },
                              pl: { xs: 4.5, sm: 0 },
                            }}
                          >
                            {renderShortcutKeys(shortcut.keys)}
                          </Box>
                        </Box>
                      </CardContent>
                    </Card>
                  ))}
                </Stack>
              </Box>
            ))}
          </Stack>
        </Box>

        {/* Footer */}
        <Box
          sx={{
            p: { xs: 1.5, sm: 2 },
            textAlign: "center",
            borderTop: 1,
            borderColor: "divider",
          }}
        >
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontSize: { xs: "0.75rem", sm: "0.75rem" } }}
          >
            {isMac ? "macOS" : "Windows/Linux"} shortcuts detected automatically
          </Typography>
        </Box>
      </Paper>
    </Container>
  );
}

export default memo(Help);
