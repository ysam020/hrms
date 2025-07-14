import React, { Suspense, useMemo } from "react";
import Drawer from "@mui/material/Drawer";
import Box from "@mui/material/Box";
import { SwipeableDrawer } from "@mui/material";
const Sidebar = React.lazy(() => import("./Sidebar"));

const drawerWidth = 60;

function DrawerComponent(props) {
  const drawerPaperStyles = useMemo(
    () => ({
      backgroundColor: "#111b21",
      backgroundImage: `url(/assets/images/sidebar-bg.webp)`,
      backgroundAttachment: "fixed",
      backgroundPosition: "left 0 bottom 0 !important",
      backgroundSize: "250px !important",
      backgroundRepeat: "no-repeat",
      padding: "0 10px",
    }),
    []
  );

  const drawerStyles = useMemo(
    () => ({
      "& .MuiDrawer-paper": {
        boxSizing: "border-box",
        width: drawerWidth,
      },
    }),
    []
  );

  return (
    <Box
      component="nav"
      sx={{ width: { lg: drawerWidth }, flexShrink: { lg: 0 } }}
      aria-label="mailbox folders"
      className="sameer"
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
          keepMounted: true,
        }}
        sx={{ ...drawerStyles, display: { xs: "block", lg: "none" } }}
      >
        <Suspense fallback={<div>Loading...</div>}>
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
