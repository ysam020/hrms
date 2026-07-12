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

function SubscriptionExpiredDialog({
  open,
  onLogout,
  theme = undefined,
}: {
  open: boolean;
  onLogout: () => void;
  theme?: "light" | "dark";
}) {
  const appTheme = useContext(ThemeContext).theme;
  theme = theme ?? appTheme ?? "light";

  return (
    <Dialog
      open={open}
      // Intentionally no onClose — this modal blocks the app until the
      // subscription is renewed by an owner/admin. Backdrop clicks and the
      // Escape key must not dismiss it; logging out is the only way out.
      disableEscapeKeyDown
      disablePortal
      slots={{ transition: SlideUpTransition }}
      transitionDuration={{ enter: 280, exit: 200 }}
      aria-labelledby="subscription-expired-dialog-title"
      aria-describedby="subscription-expired-dialog-description"
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
      <DialogTitle id="subscription-expired-dialog-title" sx={{ pb: 1 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <WarningAmberIcon sx={{ color: "warning.main", fontSize: 22 }} />
          Subscription Expired
        </Box>
      </DialogTitle>

      <DialogContent>
        <DialogContentText id="subscription-expired-dialog-description">
          Your organisation&apos;s subscription has expired. Please contact your
          admin to renew it.
        </DialogContentText>
      </DialogContent>

      <DialogActions sx={{ p: 2, pt: 1 }}>
        <Button onClick={onLogout} variant="primary">
          Log out
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default React.memo(SubscriptionExpiredDialog);
