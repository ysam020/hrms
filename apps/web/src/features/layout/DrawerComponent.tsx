import React, { Suspense, useMemo } from "react";
import Drawer from "@mui/material/Drawer";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import SwipeableDrawer from "@mui/material/SwipeableDrawer";
const Sidebar = React.lazy(() => import("./Sidebar"));

const drawerWidth = 60;
const mobileDrawerWidth = 240;

function DrawerComponent(props) {
  const drawerPaperStyles = useMemo(
    () => ({
      backgroundColor: "#111b21",
      padding: "0 10px",
    }),
    [],
  );

  // The mobile SwipeableDrawer renders in a MUI Modal portal — outside the
  // #light / #dark root div — so the sidebar.scss ID-scoped icon colour rules
  // don't reach it.  Apply them directly to the paper instead.
  // Also override .sidebar (hidden by media query on mobile) and .appbar-links
  // (clamped to 48px by !important rules) so the full-width list layout works.
  const mobileDrawerPaperStyles = useMemo(
    () => ({
      backgroundColor: "#111b21",
      width: mobileDrawerWidth,
      "& .MuiSvgIcon-root": { color: "#b2b6bd" },
      "& .appbar-links.active .MuiSvgIcon-root": { color: "#6366f1" },
      "& .appbar-links:hover .MuiSvgIcon-root": { color: "#818cf8" },
      // sidebar.scss hides .sidebar on ≤899px; show it inside the drawer
      "& .sidebar": {
        display: "flex !important",
        position: "relative",
        width: "100%",
        height: "100%",
        zIndex: "auto",
        padding: "16px 8px",
        alignItems: "stretch",
      },
      "& .nav-wrapper": {
        alignItems: "stretch",
      },
      // .appbar-links has many !important rules for the icon-only layout; reset them
      "& .appbar-links": {
        maxWidth: "unset !important",
        maxHeight: "unset !important",
        minHeight: "unset !important",
        minWidth: "unset !important",
        width: "100% !important",
        height: "auto !important",
        justifyContent: "flex-start !important",
        padding: "8px 12px !important",
        borderRadius: "8px !important",
        gap: "12px !important",
      },
      "& .appbar-links.active": {
        backgroundColor: "rgba(99, 102, 241, 0.12) !important",
        borderLeft: "3px solid #6366f1",
        paddingLeft: "9px !important",
      },
      "& .appbar-links:hover:not(.active)": {
        backgroundColor: "rgba(99, 102, 241, 0.06) !important",
      },
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
      sx={{ width: { md: drawerWidth }, flexShrink: { md: 0 } }}
      aria-label="mailbox folders"
    >
      {/* Drawer mobile */}
      <SwipeableDrawer
        PaperProps={{
          sx: mobileDrawerPaperStyles,
        }}
        variant="temporary"
        open={props.mobileOpen}
        onOpen={() => props.setMobileOpen(!props.mobileOpen)}
        onClose={() => props.setMobileOpen(!props.mobileOpen)}
        ModalProps={{
          keepMounted: false,
        }}
        sx={{ display: { xs: "block", md: "none" } }}
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
          <Sidebar isMobile />
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
          display: { xs: "none", md: "block" },
        }}
        open
      >
        <Sidebar />
      </Drawer>
    </Box>
  );
}

export default React.memo(DrawerComponent);
