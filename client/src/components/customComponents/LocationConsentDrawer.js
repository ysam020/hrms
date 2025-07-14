import React from "react";
import Drawer from "@mui/material/Drawer";
import Box from "@mui/material/Box";

function LocationConsentDrawer({
  showConsentDrawer,
  setShowConsentDrawer,
  onAllowLocation,
  onDenyLocation,
}) {
  const handleAllow = async () => {
    setShowConsentDrawer(false);
    if (onAllowLocation) {
      try {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            // Successfully got location, pass it to the callback
            onAllowLocation({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            });
          },
          (error) => {
            // Handle errors in getting location after user allowed in our UI
            onDenyLocation({
              locationUnavailable: true,
              reason: `error-${error.code}`,
            });
          },
          {
            timeout: 10000,
            maximumAge: 60000,
            enableHighAccuracy: false,
          }
        );
      } catch (error) {
        onDenyLocation({ locationUnavailable: true, reason: "unknown-error" });
      }
    }
  };

  const handleDeny = () => {
    setShowConsentDrawer(false);
    if (onDenyLocation) {
      onDenyLocation({ locationUnavailable: true, reason: "user-denied" });
    }
  };

  return (
    <Drawer
      anchor="bottom"
      open={showConsentDrawer}
      onClose={() => setShowConsentDrawer(false)}
      ModalProps={{ disablePortal: true }}
    >
      <Box sx={{ width: "auto", p: 3 }} role="presentation">
        <h2
          id="modal-modal-title"
          style={{
            fontSize: "1.5rem",
            fontWeight: "bold",
            marginBottom: "1rem",
          }}
        >
          Location Access Required
        </h2>
        <p id="modal-modal-description" style={{ fontSize: "1rem" }}>
          To enhance your account security and ensure accurate attendance
          records, we request access to your current location.
        </p>

        <div style={{ margin: "1.2rem" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              marginBottom: "0.5rem",
            }}
          >
            <span
              role="img"
              aria-label="lock"
              style={{ marginRight: "0.5rem" }}
            >
              🔐
            </span>
            <span>
              Verify where you're logging in from to detect suspicious activity
            </span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              marginBottom: "0.5rem",
            }}
          >
            <span
              role="img"
              aria-label="location-pin"
              style={{ marginRight: "0.5rem" }}
            >
              📍
            </span>
            <span>
              Record your attendance based on location when applicable
            </span>
          </div>
        </div>

        <div style={{ margin: "1.2rem 0" }}>
          <p style={{ fontSize: "1rem" }}>
            Your location is stored securely as part of your session data and is{" "}
            <strong>never shared with any third parties</strong>.
          </p>
        </div>

        <div style={{ margin: "1.2rem 0" }}>
          <p style={{ fontSize: "1rem" }}>
            Please click <strong>“Allow”</strong> when your browser asks for
            location permission. If you deny access, you can still log in, but
            some features like attendance tracking may be limited.
          </p>
        </div>

        <div className="flex-div">
          <button
            className="btn"
            style={{ marginRight: "10px" }}
            onClick={handleAllow}
          >
            Allow Location
          </button>
          <button className="btn" onClick={handleDeny}>
            Deny Location
          </button>
        </div>
      </Box>
    </Drawer>
  );
}

export default React.memo(LocationConsentDrawer);
