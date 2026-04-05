import React from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";

function ThemedDialog({
  open,
  onClose,
  title,
  children,
  actions = undefined,
  theme = "light",
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
      slotProps={{
        paper: defaultPaperProps,
      }}
    >
      {title && (
        <DialogTitle
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
              onClick={onClose}
              size="small"
              sx={{ color: "text.secondary" }}
            >
              <CloseIcon />
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
