export const getGeolocation = async (setAlert, setShowConsentDrawer) => {
  try {
    // Check if geolocation is supported
    if (!navigator.geolocation) {
      setAlert({
        open: true,
        message:
          "Geolocation isn't supported by your browser. Proceeding with login without location.",
        severity: "warning",
      });
      return { locationUnavailable: true, reason: "browser-unsupported" };
    }

    // Check current permission status
    const permissionStatus = await navigator.permissions.query({
      name: "geolocation",
    });

    // Handle different permission states
    if (permissionStatus.state === "granted") {
      // Permission already granted, directly get location
      try {
        const position = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            (position) => resolve(position),
            (error) => reject(error),
            {
              timeout: 10000,
              maximumAge: 60000,
              enableHighAccuracy: false,
            }
          );
        });

        return {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
      } catch (posError) {
        // Handle errors even when permission is granted
        return handleGeolocationError(posError, setAlert);
      }
    } else if (permissionStatus.state === "prompt") {
      setShowConsentDrawer(true);
      return null;
    } else if (permissionStatus.state === "denied") {
      // User has explicitly denied permission
      setAlert({
        open: true,
        message:
          "Location access is blocked. You can change this in your browser settings. Proceeding without location.",
        severity: "warning",
      });
      return { locationUnavailable: true, reason: "permission-denied" };
    }
  } catch (error) {
    console.error("Error checking geolocation permissions:", error);
    setAlert({
      open: true,
      message:
        "Error checking location permissions. Proceeding without location.",
      severity: "warning",
    });
    return { locationUnavailable: true, reason: "permission-error" };
  }
};

// Helper function to handle geolocation errors
const handleGeolocationError = (error, setAlert) => {
  let errorMessage;
  let reason = "unknown";

  if (error.code === 1) {
    reason = "permission-denied";
    errorMessage =
      "Location access denied. You can still log in, but your session location won't be recorded.";
  } else if (error.code === 2) {
    reason = "position-unavailable";
    errorMessage =
      "Unable to determine your location. You can still proceed with login.";
  } else if (error.code === 3) {
    reason = "timeout";
    errorMessage = "Location request timed out. Proceeding with login anyway.";
  } else {
    errorMessage = "Location unavailable. Continuing with login.";
  }

  setAlert({
    open: true,
    message: errorMessage,
    severity: "warning",
  });
  console.error("Error fetching geolocation:", error);

  return { locationUnavailable: true, reason: reason };
};
