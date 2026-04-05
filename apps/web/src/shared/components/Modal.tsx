import React from "react";
import Modal from "@mui/material/Modal";
import Paper from "@mui/material/Paper";
import Backdrop from "@mui/material/Backdrop";
import Fade from "@mui/material/Fade";

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
  theme = "light",
  ...props
}: {
  open: any;
  handleClose: any;
  children: any;
  theme?: "light" | "dark";
  [key: string]: any;
}) {
  const defaultModalStyle = {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: { xs: "90%", sm: 520 },
    maxHeight: "90vh",
    overflow: "auto",
    outline: 0,
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

  const defaultPaperProps = {
    elevation: 8,
    sx: {
      borderRadius: 3,
      backgroundColor: "background.paper",
      border: theme === "light" ? "1px solid #e5e7eb" : "1px solid #374151",
      ...paperProps.sx,
    },
    ...paperProps,
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      closeAfterTransition
      disablePortal={disablePortal}
      disableEscapeKeyDown={disableEscapeKeyDown}
      BackdropComponent={Backdrop}
      BackdropProps={defaultBackdropProps}
      {...props}
    >
      <Fade in={open} timeout={fadeTimeout}>
        <Paper
          {...defaultPaperProps}
          sx={{
            ...defaultModalStyle,
            ...modalStyle,
            ...defaultPaperProps.sx,
          }}
        >
          {children}
        </Paper>
      </Fade>
    </Modal>
  );
}

export default React.memo(CustomModal);
