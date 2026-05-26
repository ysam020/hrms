import React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import DevicesIcon from "@mui/icons-material/Devices";
import SmartphoneIcon from "@mui/icons-material/Smartphone";
import ComputerIcon from "@mui/icons-material/Computer";
import TabletIcon from "@mui/icons-material/Tablet";

function DeviceListItem({
  device,
  isCurrentDevice = false,
  theme = "light",
  actions,
  onClick,
}: {
  device: any;
  isCurrentDevice?: boolean;
  theme?: "light" | "dark";
  actions?: React.ReactNode;
  onClick?: () => void;
}) {
  const getDeviceIcon = (deviceType: string | undefined) => {
    switch (deviceType?.toLowerCase()) {
      case "mobile":
      case "smartphone":
        return (
          <SmartphoneIcon sx={{ fontSize: 18, color: "text.secondary" }} />
        );
      case "tablet":
        return <TabletIcon sx={{ fontSize: 18, color: "text.secondary" }} />;
      case "desktop":
      case "computer":
        return <ComputerIcon sx={{ fontSize: 18, color: "text.secondary" }} />;
      default:
        return <DevicesIcon sx={{ fontSize: 18, color: "text.secondary" }} />;
    }
  };

  const getDeviceTypeDisplay = (deviceInfo: any) => {
    if (!deviceInfo) return "Unknown Device";

    const { deviceType, browser, os } = deviceInfo;
    let display = deviceType || "Unknown";

    if (browser && browser !== "Unknown") {
      display += ` • ${browser}`;
    }

    if (os && os !== "Unknown") {
      display += ` • ${os}`;
    }

    return display;
  };

  const getThemedStyles = () => {
    return {
      border: `1px solid ${
        theme === "light" ? "#e0e0e0" : "rgba(255, 255, 255, 0.12)"
      }`,
      borderRadius: "8px",
      mb: 1,
      p: 2,
      backgroundColor: isCurrentDevice
        ? theme === "light"
          ? "#E3F2FD"
          : "#16394f"
        : theme === "light"
          ? "#ffffff"
          : "#212E35",
      transition: "background-color 0.2s",
      cursor: onClick ? "pointer" : "default",
      "&:hover": onClick
        ? {
            backgroundColor: isCurrentDevice
              ? theme === "light"
                ? "#BBDEFB"
                : "#0B3F61"
              : theme === "light"
                ? "#f5f5f5"
                : "#2A3A42",
          }
        : {},
    };
  };

  const formatLastUsed = (timestamp: string | number | undefined) => {
    if (!timestamp) return "Unknown";
    return new Date(timestamp).toLocaleString();
  };

  return (
    <Box
      sx={getThemedStyles()}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      aria-label={
        onClick
          ? `View details for ${device?.deviceInfo?.deviceType ?? "device"}`
          : undefined
      }
    >
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 2 }}>
        <Box sx={{ mt: 0.5 }}>
          {getDeviceIcon(device?.deviceInfo?.deviceType)}
        </Box>

        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
            <Typography
              variant="body2"
              sx={{
                fontWeight: 600,
                color: "text.primary",
                flexGrow: 1,
              }}
            >
              {getDeviceTypeDisplay(device?.deviceInfo)}
            </Typography>
            {isCurrentDevice && (
              <Chip
                label="Current"
                size="small"
                color="primary"
                sx={{
                  height: 20,
                  fontSize: "0.65rem",
                  fontWeight: 600,
                }}
              />
            )}
          </Box>

          <Typography
            variant="caption"
            sx={{
              color: "text.secondary",
              display: "block",
              fontSize: "0.75rem",
            }}
          >
            Last used: {formatLastUsed(device?.lastUsed || device?.createdAt)}
          </Typography>

          {device?.location && (
            <Typography
              variant="caption"
              sx={{
                color: "text.secondary",
                display: "block",
                fontSize: "0.75rem",
              }}
            >
              Location: {device.location}
            </Typography>
          )}
        </Box>

        {actions && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            {actions}
          </Box>
        )}
      </Box>
    </Box>
  );
}

export default React.memo(DeviceListItem);
