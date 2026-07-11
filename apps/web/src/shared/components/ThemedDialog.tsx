import React, { useContext } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";
import SlideUpTransition from "./SlideUpTransition";
import { ThemeContext } from "@web/app/providers/ThemeContext";

function ThemedDialog({
  open,
  onClose,
  title,
  children,
  actions = undefined,
  theme = undefined,
  maxWidth = "sm" as any,
  fullWidth = true,
  showCloseButton = false,
  paperProps = {} as any,
}: {
  open: any;
  onClose: any;
  title: any;
  children: any;
  [key: string]: any;
}) {
  const appTheme = useContext(ThemeContext).theme;
  theme = theme ?? appTheme ?? "light";

  const defaultPaperProps = {
    sx: {
      backgroundColor: theme === "light" ? "#ffffff" : "#212e35",
      borderRadius: 3,
      ...paperProps.sx,
    },
    ...paperProps,
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={maxWidth}
      fullWidth={fullWidth}
      slots={{ transition: SlideUpTransition }}
      transitionDuration={{ enter: 280, exit: 200 }}
      aria-labelledby={title ? "themed-dialog-title" : undefined}
      slotProps={{
        paper: defaultPaperProps,
      }}
    >
      {title && (
        <DialogTitle
          id="themed-dialog-title"
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            pb: 1,
          }}
        >
          {title}
          {showCloseButton && (
            <IconButton
              aria-label="Close dialog"
              onClick={onClose}
              size="small"
              sx={{ color: "text.secondary" }}
            >
              <CloseIcon aria-hidden="true" />
            </IconButton>
          )}
        </DialogTitle>
      )}

      {children && <DialogContent>{children}</DialogContent>}

      {actions && <DialogActions sx={{ p: 2, pt: 1 }}>{actions}</DialogActions>}
    </Dialog>
  );
}

export default React.memo(ThemedDialog);
