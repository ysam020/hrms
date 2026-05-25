import { memo, useContext } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import WarningIcon from "@mui/icons-material/Warning";
import CustomModal from "@web/shared/components/Modal";
import { UserContext } from "@web/app/providers/UserContext";

function BroadcastModal(props) {
  const { handleLogout } = useContext(UserContext);
  const modalStyle = {
    width: { xs: "90%", sm: 480, md: 520 },
    maxWidth: 600,
  };

  return (
    <CustomModal
      open={props.open}
      handleClose={props.handleClose}
      modalStyle={modalStyle}
      disableEscapeKeyDown
    >
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          p: 3,
          pb: 2,
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 40,
              height: 40,
              borderRadius: 2,
              bgcolor: "warning.light",
              color: "warning.dark",
            }}
          >
            <WarningIcon />
          </Box>
          <Typography
            variant="h6"
            sx={{
              fontWeight: 600,
              color: "text.primary",
            }}
          >
            Multiple Sessions Detected
          </Typography>
        </Box>
      </Box>

      {/* Content */}
      <Box sx={{ p: 3 }}>
        <Typography
          variant="h6"
          sx={{
            color: "text.secondary",
            mb: 3,
            fontSize: "0.875rem",
          }}
        >
          To avoid conflicts and ensure data consistency, please choose one of
          the options below:
        </Typography>

        {/* Action Buttons */}
        <Stack direction="row" spacing={2} sx={{ justifyContent: "flex-end" }}>
          <Button
            variant="outlined"
            onClick={handleLogout}
            sx={{
              textTransform: "none",
              fontWeight: 500,
            }}
          >
            Logout All Sessions
          </Button>
          <Button
            variant="contained"
            onClick={props.handleUseInThisTab}
            sx={{
              textTransform: "none",
              fontWeight: 500,
              bgcolor: "primary.main",
              "&:hover": {
                bgcolor: "primary.dark",
              },
            }}
          >
            Continue Here
          </Button>
        </Stack>
      </Box>
    </CustomModal>
  );
}

export default memo(BroadcastModal);
