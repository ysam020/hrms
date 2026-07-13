import React, { useContext } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import DialogContentText from "@mui/material/DialogContentText";
import Button from "./Button";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import Box from "@mui/material/Box";
import SlideUpTransition from "./SlideUpTransition";
import { ThemeContext } from "@web/app/providers/ThemeContext";

function ConfirmationDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  description = undefined,
  confirmText = "Confirm",
  cancelText = "Cancel",
  loading = false,
  theme = undefined,
  variant = "default",
  autoFocusConfirm = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: React.ReactNode;
  message: React.ReactNode;
  description?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  loading?: boolean;
  theme?: "light" | "dark";
  variant?: "default" | "danger";
  // Off by default: most confirmations here are destructive (delete, reject,
  // etc.) and auto-focusing that button would make a stray Enter press
  // trigger it. Opt in per-usage where landing on Enter is the point (e.g.
  // logout).
  autoFocusConfirm?: boolean;
}) {
  const appTheme = useContext(ThemeContext).theme;
  theme = theme ?? appTheme ?? "light";
  const isDanger = variant === "danger";

  return (
    <Dialog
      open={open}
      onClose={!loading ? onClose : undefined}
      disablePortal
      slots={{ transition: SlideUpTransition }}
      transitionDuration={{ enter: 280, exit: 200 }}
      aria-labelledby="confirmation-dialog-title"
      aria-describedby="confirmation-dialog-description"
      slotProps={{
        paper: {
          sx: {
            backgroundColor: theme === "light" ? "#ffffff" : "#212e35",
            borderRadius: 3,
            minWidth: { xs: "90vw", sm: 400 },
            maxWidth: { xs: "95vw", sm: 500 },
          },
        },
      }}
    >
      <DialogTitle id="confirmation-dialog-title" sx={{ pb: 1 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          {isDanger && (
            <WarningAmberIcon sx={{ color: "error.main", fontSize: 22 }} />
          )}
          {title}
        </Box>
      </DialogTitle>

      <DialogContent>
        <DialogContentText
          id="confirmation-dialog-description"
          sx={{ mb: description ? 1 : 0 }}
        >
          {message}
        </DialogContentText>
        {description && (
          <DialogContentText
            sx={{
              fontSize: "0.875rem",
              color: "text.secondary",
              mt: 1,
            }}
          >
            {description}
          </DialogContentText>
        )}
      </DialogContent>

      <DialogActions sx={{ p: 2, pt: 1, gap: 1 }}>
        <Button onClick={onClose} disabled={loading} variant="ghost">
          {cancelText}
        </Button>
        <Button
          onClick={onConfirm}
          disabled={loading}
          loading={loading}
          variant={isDanger ? "danger" : "primary"}
          loadingText="Processing..."
          autoFocus={autoFocusConfirm}
        >
          {confirmText}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default React.memo(ConfirmationDialog);
