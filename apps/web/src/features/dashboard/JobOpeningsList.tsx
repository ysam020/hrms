import React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Skeleton from "@mui/material/Skeleton";
import WorkIcon from "@mui/icons-material/Work";
import WorkOffIcon from "@mui/icons-material/WorkOff";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import EventIcon from "@mui/icons-material/Event";
import PeopleAltIcon from "@mui/icons-material/PeopleAlt";
import { useNavigate } from "react-router-dom";
import { useDashboard } from "@web/app/providers/DashboardContext";

function formatDeadline(dateStr) {
  const deadline = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysLeft = Math.ceil(
    (deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (daysLeft < 0) return { text: "Expired", color: "#ef4444" };
  if (daysLeft === 0) return { text: "Today", color: "#ef4444" };
  if (daysLeft <= 7) return { text: `${daysLeft}d left`, color: "#f97316" };
  if (daysLeft <= 14) return { text: `${daysLeft}d left`, color: "#f59e0b" };
  return {
    text: deadline.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
    color: null,
  };
}

function JobOpeningsList() {
  const navigate = useNavigate();
  const { data, loading } = useDashboard();
  const isLoading = loading.jobOpenings;
  const jobs = Array.isArray(data.jobOpenings)
    ? data.jobOpenings.filter((j) => j.status === "Active").slice(0, 5)
    : [];

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <Box
        sx={{
          px: 1.5,
          py: 0.75,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: 1,
          borderColor: "divider",
          flexShrink: 0,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
          <WorkIcon sx={{ fontSize: 14, color: "text.secondary" }} />
          <Typography
            variant="subtitle2"
            fontWeight={700}
            sx={{ fontSize: "0.8rem" }}
          >
            Open Positions
          </Typography>
        </Box>
        {!isLoading && jobs.length > 0 && (
          <Chip
            size="small"
            label={jobs.length}
            color="primary"
            sx={{
              height: 18,
              fontSize: "0.65rem",
              "& .MuiChip-label": { px: 0.75 },
            }}
          />
        )}
      </Box>

      {/* List */}
      <Box sx={{ flex: 1, overflow: "auto" }}>
        {isLoading ? (
          [...Array(4)].map((_, i) => (
            <Box
              key={i}
              sx={{
                px: 1.5,
                py: 0.85,
                borderBottom: "1px solid",
                borderColor: "divider",
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  mb: 0.4,
                }}
              >
                <Skeleton height={13} width="55%" />
                <Skeleton height={13} width="18%" sx={{ borderRadius: 1 }} />
              </Box>
              <Box sx={{ display: "flex", gap: 1.5 }}>
                <Skeleton height={11} width="35%" />
                <Skeleton height={11} width="25%" />
              </Box>
            </Box>
          ))
        ) : jobs.length === 0 ? (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              gap: 0.5,
              color: "text.disabled",
            }}
          >
            <WorkOffIcon sx={{ fontSize: 26, opacity: 0.4 }} />
            <Typography variant="caption" sx={{ fontSize: "0.7rem" }}>
              No open positions
            </Typography>
          </Box>
        ) : (
          jobs.map((job, i) => {
            const deadline = job.applicationDeadline
              ? formatDeadline(job.applicationDeadline)
              : null;

            return (
              <Box
                key={job._id || i}
                onClick={() => navigate("/job-openings/view-job-openings")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    navigate("/job-openings/view-job-openings");
                  }
                }}
                role="button"
                tabIndex={0}
                aria-label={`View job opening: ${job.jobTitle || job.title || "Untitled"}`}
                sx={{
                  px: 1.5,
                  py: 0.85,
                  borderBottom: i < jobs.length - 1 ? "1px solid" : "none",
                  borderColor: "divider",
                  cursor: "pointer",
                  "&:hover": { bgcolor: "action.hover" },
                }}
              >
                {/* Row 1: title + vacancies */}
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Typography
                    sx={{
                      fontSize: "0.78rem",
                      fontWeight: 600,
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {job.jobTitle || job.title || "Untitled"}
                  </Typography>
                  {job.numberOfVacancies != null && (
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 0.3,
                        flexShrink: 0,
                        bgcolor: "primary.main",
                        color: "#fff",
                        borderRadius: 99,
                        px: 0.75,
                        py: 0.1,
                      }}
                    >
                      <PeopleAltIcon sx={{ fontSize: 9 }} />
                      <Typography
                        sx={{
                          fontSize: "0.6rem",
                          fontWeight: 700,
                          lineHeight: 1.6,
                        }}
                      >
                        {job.numberOfVacancies}
                      </Typography>
                    </Box>
                  )}
                </Box>

                {/* Row 2: hiring manager + deadline */}
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1.5,
                    mt: 0.35,
                  }}
                >
                  {job.hiringManager && (
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 0.3,
                        minWidth: 0,
                      }}
                    >
                      <PersonOutlineIcon
                        sx={{
                          fontSize: 11,
                          color: "text.secondary",
                          flexShrink: 0,
                        }}
                      />
                      <Typography
                        sx={{
                          fontSize: "0.63rem",
                          color: "text.secondary",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {job.hiringManager}
                      </Typography>
                    </Box>
                  )}
                  {deadline && (
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 0.3,
                        flexShrink: 0,
                        ml: "auto",
                      }}
                    >
                      <EventIcon
                        sx={{
                          fontSize: 11,
                          color: deadline.color || "text.secondary",
                          flexShrink: 0,
                        }}
                      />
                      <Typography
                        sx={{
                          fontSize: "0.63rem",
                          color: deadline.color || "text.secondary",
                          fontWeight: deadline.color ? 600 : 400,
                        }}
                      >
                        {deadline.text}
                      </Typography>
                    </Box>
                  )}
                </Box>
              </Box>
            );
          })
        )}
      </Box>
    </Box>
  );
}

export default React.memo(JobOpeningsList);
