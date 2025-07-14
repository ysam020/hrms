import React, { useContext } from "react";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import Grid from "@mui/material/Grid2";
import Box from "@mui/material/Box";
import { AlertContext } from "../../contexts/AlertContext";

function PushNotifications() {
  const { setAlert } = useContext(AlertContext);

  const handleEnablePushNotifications = async () => {
    const { generateToken } = await import(
      "../../utils/pushNotifications/generateFcmToken"
    );
    generateToken(setAlert);
  };

  const handleDisablePushNotifications = async () => {
    const { disablePushNotifications } = await import(
      "../../utils/pushNotifications/disablePushNotifications"
    );
    disablePushNotifications(setAlert);
  };

  return (
    <Grid container>
      <Grid size={12}>
        <List sx={{ width: "100%" }}>
          <ListItem
            alignItems="flex-start"
            sx={{ display: "flex", justifyContent: "space-between" }}
          >
            <ListItemText primary="Push Notifications" />
            <Box sx={{ display: "flex", alignItems: "center" }}>
              <button className="btn" onClick={handleEnablePushNotifications}>
                Enable on this device
              </button>
              <button
                className="btn"
                sx={{ ml: 2 }}
                style={{ marginLeft: "10px" }}
                onClick={handleDisablePushNotifications}
              >
                Disable
              </button>
            </Box>
          </ListItem>
        </List>
      </Grid>
    </Grid>
  );
}

export default React.memo(PushNotifications);
