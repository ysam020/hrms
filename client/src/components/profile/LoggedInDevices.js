import React, { useMemo } from "react";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import Divider from "@mui/material/Divider";
import ListItemText from "@mui/material/ListItemText";
import { Skeleton } from "@mui/material";
import { getDeviceInfo } from "../../utils/getDeviceInfo";

function DeviceInfo({ userAgent, location, loginAt, expiresAt }) {
  const deviceInfo = getDeviceInfo(userAgent);

  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      <List sx={{ width: "100%" }}>
        <ListItem>
          <ListItemText primary="Device Info" />
          <ListItemText secondary={deviceInfo || <Skeleton width="50%" />} />
        </ListItem>
        <Divider variant="inset" component="li" />
        <ListItem>
          <ListItemText primary="Location" />
          <ListItemText secondary={location || <Skeleton />} />
        </ListItem>
        <Divider variant="inset" component="li" />
        <ListItem>
          <ListItemText primary="Logged in at" />
          <ListItemText secondary={loginAt || <Skeleton />} />
        </ListItem>
        <Divider variant="inset" component="li" />
        <ListItem>
          <ListItemText primary="Expires at" />
          <ListItemText secondary={expiresAt || <Skeleton />} />
        </ListItem>
      </List>
    </div>
  );
}

function LoggedInDevices({ loading, geolocation }) {
  const formatDate = useMemo(
    () => (dateString) => {
      const date = new Date(dateString);
      const day = String(date.getDate()).padStart(2, "0");
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const year = date.getFullYear();
      const hours = String(date.getHours()).padStart(2, "0");
      const minutes = String(date.getMinutes()).padStart(2, "0");
      const seconds = String(date.getSeconds()).padStart(2, "0");
      return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
    },
    []
  );

  const deviceList = useMemo(() => {
    if (loading) {
      return [
        <DeviceInfo
          key="loading"
          userAgent={null}
          location={null}
          loginAt={null}
          expiresAt={null}
        />,
      ];
    }

    return geolocation.map((location, id) => {
      const locationDetails = location.locationError
        ? location.locationError
        : [
            location.village,
            location.suburb,
            location.stateDistrict,
            location.state,
            location.postcode,
            location.country,
          ]
            .filter(Boolean)
            .join(", ");

      return (
        <div key={id} className="profile-container">
          <DeviceInfo
            userAgent={location}
            location={locationDetails}
            loginAt={formatDate(location?.loginAt)}
            expiresAt={formatDate(location?.expiresAt)}
          />
          {id !== geolocation.length - 1 && (
            <Divider variant="fullWidth" sx={{ opacity: 1 }} />
          )}
        </div>
      );
    });
  }, [loading, geolocation, formatDate]);

  return <>{deviceList}</>;
}

export default React.memo(LoggedInDevices);
