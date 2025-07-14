import * as React from "react";
import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import Notifications from "../dashboard/Notifications";

function NotificationDrawer(props) {
  return (
    <Drawer
      anchor="right"
      open={props.open}
      onClose={props.toggleDrawer(false)}
      ModalProps={{ disablePortal: true }}
    >
      <Box
        sx={{
          width: 500,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          p: 3,
        }}
      >
        <Notifications />
      </Box>
    </Drawer>
  );
}

export default React.memo(NotificationDrawer);
