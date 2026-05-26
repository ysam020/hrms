import React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Divider from "@mui/material/Divider";
import Rating from "@mui/material/Rating";
import Avatar from "@mui/material/Avatar";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import CloseIcon from "@mui/icons-material/Close";
import PersonIcon from "@mui/icons-material/Person";
import StarIcon from "@mui/icons-material/Star";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import CustomModal from "@web/shared/components/Modal";

function ViewResignationFeedbackModal(props) {
  const { theme } = React.useContext(ThemeContext);
  const {
    username,
    reason,
    job_satisfaction,
    quality_of_communication,
    support_from_manager,
    appreciation_for_work,
    collaboration_within_the_team,
    overall_company_culture,
    suggestions,
  } = props.resignationData || {};

  const display = (value) => value || "Not provided";

  const modalStyle = {
    width: { xs: "95%", sm: 560, md: 640 },
    overflow: "hidden",
  };

  const FeedbackRow = ({ label, value, showDivider = true }) => (
    <>
      <Box sx={{ py: 1.5, px: 0 }}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 2,
          }}
        >
          <Typography
            variant="body2"
            sx={{
              fontWeight: 500,
              color: "text.secondary",
              minWidth: "140px",
              flexShrink: 0,
            }}
          >
            {label}
          </Typography>
          <Typography
            variant="body2"
            sx={{
              textAlign: "right",
              color:
                display(value) === "Not provided"
                  ? "text.disabled"
                  : "text.primary",
              fontStyle:
                display(value) === "Not provided" ? "italic" : "normal",
              lineHeight: 1.4,
            }}
          >
            {display(value)}
          </Typography>
        </Box>
      </Box>
      {showDivider && <Divider sx={{ opacity: 0.6 }} />}
    </>
  );

  const RatingRow = ({ label, value }) => (
    <>
      <Box sx={{ py: 1.5, px: 0 }}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 2,
          }}
        >
          <Typography
            variant="body2"
            sx={{ fontWeight: 500, color: "text.secondary", minWidth: "140px" }}
          >
            {label}
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ minWidth: "24px" }}
            >
              {value || "N/A"}
            </Typography>
          </Box>
        </Box>
      </Box>
      <Divider sx={{ opacity: 0.6 }} />
    </>
  );

  return (
    <CustomModal
      open={props.open}
      handleClose={props.handleClose}
      modalStyle={modalStyle}
      disablePortal
      fadeTimeout={300}
      paperProps={{
        elevation: 24,
        sx: {
          boxShadow:
            theme === "light"
              ? "0 25px 50px -12px rgba(0, 0, 0, 0.25)"
              : "0 25px 50px -12px rgba(0, 0, 0, 0.6)",
          border:
            theme === "light"
              ? "1px solid rgba(0, 0, 0, 0.05)"
              : "1px solid rgba(255, 255, 255, 0.1)",
        },
      }}
    >
      {/* Compact Header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          p: 2.5,
          pb: 2,
          backgroundColor: "background.paper",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Avatar
            sx={{
              width: 40,
              height: 40,
              bgcolor: "error.main",
              color: "white",
            }}
          >
            <TrendingDownIcon fontSize="small" />
          </Avatar>
          <Box>
            <Typography
              variant="h6"
              fontWeight={600}
              sx={{ fontSize: "1.1rem", mb: 0.25 }}
            >
              Exit Feedback
            </Typography>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <PersonIcon sx={{ fontSize: 14, color: "text.secondary" }} />
              <Typography
                variant="caption"
                color="text.secondary"
                fontWeight={500}
              >
                {display(username)}
              </Typography>
            </Box>
          </Box>
        </Box>
        <IconButton
          onClick={props.handleClose}
          size="small"
          aria-label="Close feedback"
          sx={{
            color: "text.secondary",
            "&:hover": { bgcolor: "action.hover" },
          }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* Content with scroll */}
      <Box
        sx={{
          maxHeight: "calc(95vh - 80px)",
          overflow: "auto",
          px: 2.5,
          pb: 2.5,
        }}
      >
        <Stack spacing={0}>
          {/* Overall Rating - Prominent */}
          <Box sx={{ py: 2, textAlign: "center" }}>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 1,
                mb: 1,
              }}
            >
              <StarIcon sx={{ color: "warning.main", fontSize: 18 }} />
              <Typography
                variant="subtitle2"
                fontWeight={600}
                color="text.secondary"
              >
                Overall Job Satisfaction
              </Typography>
            </Box>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 1.5,
              }}
            >
              <Rating value={job_satisfaction || 0} readOnly />
              <Typography variant="h6" fontWeight={600} color="primary.main">
                {job_satisfaction || 0}/5
              </Typography>
            </Box>
          </Box>

          <Divider sx={{ my: 1 }} />

          {/* Compact feedback items */}
          <FeedbackRow label="Exit Reason" value={reason} />
          <RatingRow
            label="Quality of Communication"
            value={quality_of_communication}
          />
          <RatingRow label="Manager Support" value={support_from_manager} />
          <RatingRow label="Work Appreciation" value={appreciation_for_work} />
          <RatingRow
            label="Team Collaboration"
            value={collaboration_within_the_team}
          />
          <FeedbackRow
            label="Company Culture"
            value={overall_company_culture}
          />
          <FeedbackRow
            label="Suggestions"
            value={suggestions}
            showDivider={false}
          />
        </Stack>
      </Box>
    </CustomModal>
  );
}

export default React.memo(ViewResignationFeedbackModal);
