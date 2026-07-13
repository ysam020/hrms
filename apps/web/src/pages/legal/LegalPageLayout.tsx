import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import ArrowBack from "@mui/icons-material/ArrowBack";
import Gavel from "@mui/icons-material/Gavel";

function LegalPageLayout({
  title,
  lastUpdated,
  children,
}: {
  title: string;
  lastUpdated: string;
  children: ReactNode;
}) {
  const navigate = useNavigate();

  return (
    <Box
      sx={{
        // body has overflow:hidden globally for the authenticated app
        // shell's internal scroll regions — this page needs its own
        // scroll container since it isn't nested inside one.
        height: "100vh",
        overflowY: "auto",
        backgroundColor: "var(--card-background-primary, #f9fafb)",
        color: "var(--text-color, #111)",
      }}
    >
      {/* Header */}
      <Box
        sx={{
          px: { xs: 2, md: 6 },
          py: 2.5,
          display: "flex",
          alignItems: "center",
          gap: 2,
          borderBottom: "1px solid var(--text-input-border, #e0e0e0)",
          backgroundColor: "var(--card-background-secondary, #fff)",
        }}
      >
        <IconButton
          onClick={() => navigate(-1)}
          size="small"
          aria-label="Go back"
        >
          <ArrowBack aria-hidden="true" />
        </IconButton>
        <Gavel sx={{ fontSize: 24, color: "#2196f3" }} />
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          {title}
        </Typography>
      </Box>

      {/* Content */}
      <Box
        sx={{
          maxWidth: 780,
          mx: "auto",
          px: { xs: 2, md: 4 },
          py: { xs: 4, md: 6 },
        }}
      >
        <Typography
          variant="caption"
          sx={{ display: "block", mb: 3, opacity: 0.6 }}
        >
          Last updated: {lastUpdated}
        </Typography>

        <Box
          sx={{
            "& h2": {
              fontSize: "1.1rem",
              fontWeight: 700,
              mt: 4,
              mb: 1.5,
              "&:first-of-type": { mt: 0 },
            },
            "& p": {
              fontSize: "0.9rem",
              lineHeight: 1.75,
              opacity: 0.85,
              mb: 1.5,
            },
            "& ul": {
              fontSize: "0.9rem",
              lineHeight: 1.75,
              opacity: 0.85,
              mb: 1.5,
              pl: 3,
            },
            "& li": { mb: 0.5 },
            "& a": { color: "var(--link-color, #2196f3)" },
          }}
        >
          {children}
        </Box>
      </Box>
    </Box>
  );
}

export default LegalPageLayout;
