import { memo } from "react";
import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import useTheme from "@mui/material/styles/useTheme";
import useMediaQuery from "@mui/material/useMediaQuery";
import Notifications from "@web/features/dashboard/Notifications";

function NotificationDrawer(props) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const isTablet = useMediaQuery(theme.breakpoints.between("sm", "md"));

  // Determine drawer width based on screen size
  const drawerWidth = isMobile ? "90%" : isTablet ? 400 : 500;

  return (
    <Drawer
      anchor="right"
      open={props.open}
      onClose={props.toggleDrawer(false)}
      ModalProps={{ disablePortal: true }}
      disablePortal={true}
      aria-label="Notifications"
      PaperProps={{
        sx: {
          width: drawerWidth,
          maxWidth: "100vw",
        },
      }}
    >
      <Box
        sx={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <Box sx={{ flex: 1, overflowY: "auto", p: { xs: 2, sm: 2.5 } }}>
          <Notifications />
        </Box>
      </Box>
    </Drawer>
  );
}

export default memo(NotificationDrawer);
