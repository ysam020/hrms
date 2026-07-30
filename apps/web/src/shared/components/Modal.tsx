import React, { useContext } from "react";
import Modal from "@mui/material/Modal";
import Paper from "@mui/material/Paper";
import Backdrop from "@mui/material/Backdrop";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";
import { motion } from "framer-motion";
import { ThemeContext } from "@web/app/providers/ThemeContext";

/**
 * CustomModal — centered modal with blur backdrop and slide-up entry animation.
 *
 * Centering is done via flexbox (not transform: translate(-50%,-50%)) so
 * framer-motion's `y` animation never conflicts with the centering transform.
 *
 * Pointer-events on the outer Box are set to "none" so backdrop clicks still
 * reach MUI's backdrop handler; that handler is filtered below to ignore
 * backdropClick, so the modal only closes via the close icon or Escape.
 */
function CustomModal({
  open,
  handleClose,
  children,
  modalStyle = {},
  disableEscapeKeyDown = false,
  disablePortal = false,
  backdropProps = {} as any,
  paperProps = {} as any,
  fadeTimeout = 200,
  theme = undefined,
  hideCloseButton = false,
  ...props
}: {
  open: any;
  handleClose: any;
  children: any;
  theme?: "light" | "dark";
  hideCloseButton?: boolean;
  [key: string]: any;
}) {
  const appTheme = useContext(ThemeContext).theme;
  theme = theme ?? appTheme ?? "light";

  const handleModalClose = (event?: unknown, reason?: string) => {
    if (reason === "backdropClick") return;
    handleClose(event, reason);
  };

  const defaultBackdropProps = {
    timeout: fadeTimeout,
    sx: {
      backgroundColor: "rgba(0, 0, 0, 0.4)",
      backdropFilter: "blur(8px)",
      WebkitBackdropFilter: "blur(8px)",
      ...backdropProps.sx,
    },
    ...backdropProps,
  };

  const defaultPaperSx = {
    borderRadius: 3,
    backgroundColor: "background.paper",
    border: theme === "light" ? "1px solid #e5e7eb" : "1px solid #374151",
    // Default dimensions — callers override via modalStyle
    width: { xs: "90%", sm: 520 },
    maxHeight: "90vh",
    overflow: "auto",
    outline: 0,
    position: "relative",
    // Caller overrides
    ...modalStyle,
    ...paperProps?.sx,
  };

  return (
    <Modal
      open={open}
      onClose={handleModalClose}
      disablePortal={disablePortal}
      disableEscapeKeyDown={disableEscapeKeyDown}
      BackdropComponent={Backdrop}
      BackdropProps={defaultBackdropProps}
      {...props}
    >
      {/*
        Full-screen flex container for centering.
        pointer-events:none — clicks on the invisible overlay fall through
        to MUI's backdrop so onClose still fires.
      */}
      <Box
        tabIndex={-1}
        sx={{
          position: "fixed",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
          outline: "none",
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{
            type: "spring",
            stiffness: 340,
            damping: 28,
            mass: 0.8,
          }}
          style={{ pointerEvents: "auto" }}
        >
          <Paper elevation={8} {...paperProps} sx={defaultPaperSx}>
            {!hideCloseButton && (
              // height:0 + sticky keeps the button pinned to the visible
              // top-right corner even when Paper's content scrolls, without
              // reserving layout space that would push content down.
              <Box sx={{ position: "sticky", top: 0, height: 0, zIndex: 1 }}>
                <IconButton
                  aria-label="Close"
                  onClick={() => handleClose()}
                  size="small"
                  sx={{
                    position: "absolute",
                    top: 8,
                    right: 8,
                    color: "text.secondary",
                    bgcolor: "background.paper",
                    "&:hover": { bgcolor: "action.hover" },
                  }}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Box>
            )}
            {children}
          </Paper>
        </motion.div>
      </Box>
    </Modal>
  );
}

export default React.memo(CustomModal);
