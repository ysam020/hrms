import React from "react";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Box from "@mui/material/Box";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";

function InfoCard({
  label,
  value,
  icon,
  accentColor = "#6C5DFC",
  theme = "light",
  link,
  onClick,
}: {
  label: any;
  value: any;
  icon: any;
  accentColor?: string;
  theme?: string;
  link?: any;
  onClick?: any;
}) {
  const colors = {
    text: theme === "light" ? "#2e2e2e" : "#ffffff",
    secondary: theme === "light" ? "#666666" : "#cccccc",
  };

  return (
    <Stack
      direction="row"
      spacing={1.5}
      // When the card is clickable make it keyboard-accessible
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick(e as any);
              }
            }
          : undefined
      }
      sx={{
        p: 1.5,
        borderRadius: 2,
        backgroundColor: `${accentColor}08`,
        border: `1px solid ${accentColor}20`,
        transition: "all 0.2s ease",
        cursor: onClick ? "pointer" : "default",
        "&:hover": onClick
          ? {
              backgroundColor: `${accentColor}12`,
              borderColor: `${accentColor}30`,
            }
          : {},
      }}
      onClick={onClick}
    >
      <Box
        sx={{
          p: 0.5,
          borderRadius: 1,
          backgroundColor: `${accentColor}15`,
          color: accentColor,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 28,
          height: 28,
        }}
      >
        {React.cloneElement(icon, { sx: { fontSize: 14 } })}
      </Box>

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          variant="caption"
          sx={{
            color: accentColor,
            fontWeight: 600,
            fontSize: "0.65rem",
            textTransform: "uppercase",
            letterSpacing: 0.5,
            lineHeight: 1,
          }}
        >
          {label}
        </Typography>
        <Typography
          variant="body2"
          sx={{
            color: colors.text,
            fontWeight: 500,
            mt: 0.25,
            fontSize: "0.8rem",
            lineHeight: 1.3,
          }}
        >
          {value}
        </Typography>
      </Box>

      {link && (
        <IconButton
          size="small"
          aria-label={`Open ${label} in a new tab`}
          onClick={(e) => {
            e.stopPropagation();
            window.open(link, "_blank");
          }}
          sx={{
            color: accentColor,
            backgroundColor: `${accentColor}10`,
            "&:hover": { backgroundColor: `${accentColor}20` },
            width: 24,
            height: 24,
          }}
        >
          <OpenInNewIcon aria-hidden="true" sx={{ fontSize: 12 }} />
        </IconButton>
      )}
    </Stack>
  );
}

export default React.memo(InfoCard);
