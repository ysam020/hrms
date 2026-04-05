import React, { Suspense, useMemo } from "react";
import Drawer from "@mui/material/Drawer";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import SwipeableDrawer from "@mui/material/SwipeableDrawer";
const Sidebar = React.lazy(() => import("./Sidebar"));

const drawerWidth = 60;

function DrawerComponent(props) {
  const drawerPaperStyles = useMemo(
    () => ({
      backgroundColor: "#111b21",
      padding: "0 10px",
    }),
    [],
  );

  const drawerStyles = useMemo(
    () => ({
      "& .MuiDrawer-paper": {
        boxSizing: "border-box",
        width: drawerWidth,
        p: 0,
      },
    }),
    [],
  );

  return (
    <Box
      component="nav"
      sx={{ width: { lg: drawerWidth }, flexShrink: { lg: 0 } }}
      aria-label="mailbox folders"
    >
      {/* Drawer mobile */}
      <SwipeableDrawer
        PaperProps={{
          sx: drawerPaperStyles,
        }}
        variant="temporary"
        open={props.mobileOpen}
        onOpen={() => props.setMobileOpen(!props.mobileOpen)}
        onClose={() => props.setMobileOpen(!props.mobileOpen)}
        ModalProps={{
          keepMounted: false,
        }}
        sx={{ ...drawerStyles, display: { xs: "block", lg: "none" } }}
      >
        <Suspense
          fallback={
            <Box
              sx={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                p: 4,
              }}
            >
              <CircularProgress size={24} />
            </Box>
          }
        >
          <Sidebar />
        </Suspense>
      </SwipeableDrawer>

      {/* Drawer desktop */}
      <Drawer
        PaperProps={{
          sx: drawerPaperStyles,
        }}
        variant="permanent"
        sx={{
          ...drawerStyles,
          display: { xs: "none", lg: "block" },
        }}
        open
      >
        <Sidebar />
      </Drawer>
    </Box>
  );
}

export default React.memo(DrawerComponent);
