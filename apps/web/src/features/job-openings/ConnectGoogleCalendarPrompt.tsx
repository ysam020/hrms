import { memo } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Avatar from "@mui/material/Avatar";
import EventIcon from "@mui/icons-material/Event";
import Button from "@web/shared/components/Button";
import CustomModal from "@web/shared/components/Modal";

/**
 * Shown in place of a bare error toast when scheduling/rescheduling an
 * interview hits CALENDAR_NOT_CONNECTED — lets the user connect their
 * Google Calendar right where they are, instead of being blocked with no
 * way to act on it. See useConnectGoogleCalendar for the popup + retry flow
 * this triggers.
 */
function ConnectGoogleCalendarPrompt({
  open,
  onConnect,
  onClose,
}: {
  open: boolean;
  onConnect: () => void;
  onClose: () => void;
}) {
  return (
    <CustomModal
      open={open}
      handleClose={onClose}
      modalStyle={{ width: { xs: "90%", sm: 440 } }}
    >
      <Box sx={{ p: 3 }}>
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
          <Avatar sx={{ bgcolor: "info.main", color: "white" }}>
            <EventIcon fontSize="small" />
          </Avatar>
          <Typography variant="h6" fontWeight={600} sx={{ fontSize: "1.1rem" }}>
            Connect Google Calendar
          </Typography>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          You need to connect your Google Calendar to add this interview to your
          Google Calendar. This only needs to be done once.
        </Typography>
        <Stack
          direction="row"
          spacing={1.5}
          justifyContent="flex-end"
          sx={{ mt: 2 }}
        >
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onConnect}>
            Connect Google Calendar
          </Button>
        </Stack>
      </Box>
    </CustomModal>
  );
}

export default memo(ConnectGoogleCalendarPrompt);
