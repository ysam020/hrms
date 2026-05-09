import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid2";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import ArrowBack from "@mui/icons-material/ArrowBack";
import WorkOutline from "@mui/icons-material/WorkOutline";
import Search from "@mui/icons-material/Search";
import People from "@mui/icons-material/People";
import CalendarToday from "@mui/icons-material/CalendarToday";
import AttachMoney from "@mui/icons-material/AttachMoney";
import Star from "@mui/icons-material/Star";
import Group from "@mui/icons-material/Group";
import ArrowForward from "@mui/icons-material/ArrowForward";
import apiClient from "@web/core/http/axiosConfig";
import { API_ENDPOINTS } from "@web/shared/constants";

function CareersPage() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    apiClient
      .get(API_ENDPOINTS.GET_ALL_JOB_OPENINGS, { params: { status: "Active" } })
      .then((res) => {
        const data = res.data?.data ?? res.data ?? [];
        setJobs(Array.isArray(data) ? data : []);
      })
      .catch(() => setJobs([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = jobs.filter(
    (job) =>
      !search ||
      job.jobTitle?.toLowerCase().includes(search.toLowerCase()) ||
      job.requiredSkills?.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <Box
      sx={{
        minHeight: "100vh",
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
        <IconButton onClick={() => navigate(-1)} size="small">
          <ArrowBack />
        </IconButton>
        <People sx={{ fontSize: 26, color: "#2196f3" }} />
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          Careers
        </Typography>
      </Box>

      {/* Hero */}
      <Box sx={{ textAlign: "center", py: { xs: 4, md: 6 }, px: 2 }}>
        <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
          Join Our Team
        </Typography>

        <TextField
          placeholder="Search by title or skills…"
          size="small"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ width: { xs: "100%", sm: 400 } }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search sx={{ fontSize: 18 }} />
              </InputAdornment>
            ),
          }}
        />
      </Box>

      {/* Job list */}
      <Box sx={{ maxWidth: 860, mx: "auto", px: { xs: 2, md: 4 }, pb: 8 }}>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
            <CircularProgress />
          </Box>
        ) : filtered.length === 0 ? (
          <Box sx={{ textAlign: "center", py: 8, opacity: 0.5 }}>
            <WorkOutline sx={{ fontSize: 48, mb: 2 }} />
            <Typography variant="body1">
              {search
                ? "No matching positions found."
                : "No open positions at the moment. Check back soon!"}
            </Typography>
          </Box>
        ) : (
          <Grid container spacing={2}>
            {filtered.map((job) => {
              const jobId = job._id || job.id;
              return (
                <Grid size={12} key={jobId}>
                  <Box
                    onClick={() => navigate(`/careers/apply/${jobId}`)}
                    sx={{
                      p: 3,
                      borderRadius: 2,
                      border: "1px solid var(--text-input-border, #e0e0e0)",
                      backgroundColor: "var(--card-background-secondary, #fff)",
                      cursor: "pointer",
                      transition: "box-shadow 0.18s, border-color 0.18s",
                      "&:hover": {
                        boxShadow: "0 4px 18px rgba(0,0,0,0.10)",
                        borderColor: "var(--link-color, #2196f3)",
                      },
                    }}
                  >
                    {/* Top row: title + Apply button */}
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        gap: 2,
                        flexWrap: "wrap",
                      }}
                    >
                      <Box>
                        <Typography
                          variant="subtitle1"
                          sx={{
                            fontWeight: 700,
                            textTransform: "capitalize",
                            fontSize: "1rem",
                          }}
                        >
                          {job.jobTitle}
                        </Typography>
                        {job.hiringManager && (
                          <Typography variant="caption" sx={{ opacity: 0.55 }}>
                            Hiring Manager: {job.hiringManager}
                          </Typography>
                        )}
                      </Box>
                      <Button
                        size="small"
                        variant="contained"
                        endIcon={<ArrowForward sx={{ fontSize: 15 }} />}
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/careers/apply/${jobId}`);
                        }}
                        sx={{
                          textTransform: "none",
                          fontWeight: 600,
                          borderRadius: "6px",
                          flexShrink: 0,
                          backgroundColor: "var(--btn-bg)",
                          color: "var(--btn-color)",
                          boxShadow: "none",
                          "&:hover": { boxShadow: "none" },
                        }}
                      >
                        Apply Now
                      </Button>
                    </Box>

                    {/* Meta chips row */}
                    <Box
                      sx={{
                        display: "flex",
                        gap: 1,
                        mt: 1.5,
                        flexWrap: "wrap",
                        alignItems: "center",
                      }}
                    >
                      {job.numberOfVacancies && (
                        <Chip
                          icon={<Group sx={{ fontSize: 13 }} />}
                          label={`${job.numberOfVacancies} ${job.numberOfVacancies === 1 ? "vacancy" : "vacancies"}`}
                          size="small"
                          variant="outlined"
                          sx={{ fontSize: 11 }}
                        />
                      )}
                      {job.experience != null && (
                        <Chip
                          icon={<Star sx={{ fontSize: 13 }} />}
                          label={`${job.experience}+ yrs exp`}
                          size="small"
                          variant="outlined"
                          sx={{ fontSize: 11 }}
                        />
                      )}
                      {job.budgetRange && (
                        <Chip
                          icon={<AttachMoney sx={{ fontSize: 13 }} />}
                          label={job.budgetRange}
                          size="small"
                          variant="outlined"
                          sx={{ fontSize: 11 }}
                        />
                      )}
                      {job.formattedDeadline && (
                        <Chip
                          icon={<CalendarToday sx={{ fontSize: 12 }} />}
                          label={`Apply by ${job.formattedDeadline}`}
                          size="small"
                          variant="outlined"
                          sx={{ fontSize: 11 }}
                        />
                      )}
                    </Box>

                    {/* Description */}
                    {job.jobDescription && (
                      <>
                        <Divider
                          sx={{
                            my: 1.5,
                            borderColor: "var(--text-input-border)",
                          }}
                        />
                        <Typography
                          variant="body2"
                          sx={{
                            opacity: 0.75,
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                            lineHeight: 1.6,
                          }}
                        >
                          {job.jobDescription}
                        </Typography>
                      </>
                    )}

                    {/* Skills */}
                    {job.requiredSkills && (
                      <Typography
                        variant="caption"
                        sx={{ display: "block", mt: 1, opacity: 0.6 }}
                      >
                        Skills: {job.requiredSkills}
                      </Typography>
                    )}
                  </Box>
                </Grid>
              );
            })}
          </Grid>
        )}
      </Box>
    </Box>
  );
}

export default CareersPage;
