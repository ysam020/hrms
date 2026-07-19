import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useFormik } from "formik";
import { z } from "zod";
import { toFormikValidationSchema } from "zod-formik-adapter";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import Button from "@web/shared/components/Button";
import IconButton from "@mui/material/IconButton";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import Divider from "@mui/material/Divider";
import Chip from "@mui/material/Chip";
import ArrowBack from "@mui/icons-material/ArrowBack";
import People from "@mui/icons-material/People";
import UploadFile from "@mui/icons-material/UploadFile";
import CheckCircle from "@mui/icons-material/CheckCircle";
import Group from "@mui/icons-material/Group";
import Star from "@mui/icons-material/Star";
import AttachMoney from "@mui/icons-material/AttachMoney";
import CalendarToday from "@mui/icons-material/CalendarToday";
import apiClient from "@web/core/http/axiosConfig";
import { API_ENDPOINTS } from "@web/shared/constants";

const validationSchema = toFormikValidationSchema(
  z.object({
    name: z
      .string()
      .min(2, "At least 2 characters")
      .max(50, "Max 50 characters"),
    mobile: z.string().regex(/^[0-9]{10}$/, "Must be exactly 10 digits"),
    email: z.string().email("Invalid email address"),
    aadharNo: z.string().regex(/^[0-9]{12}$/, "Must be exactly 12 digits"),
    jobTitle: z.string().min(1, "Job title is required"),
    resume: z.string().min(1, "Resume is required"),
  }),
);

const formatBudgetRange = (budget: number[] | undefined) =>
  budget?.[0] && budget?.[1] ? `${budget[0]}-${budget[1]} LPA` : null;

const formatDeadline = (deadline: string | undefined) =>
  deadline
    ? new Date(deadline).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

function JobApplicationPage() {
  const navigate = useNavigate();
  const { slug, id } = useParams();
  const [resumeFileName, setResumeFileName] = useState("");
  // True while FileReader is still base64-encoding the selected file — the
  // filename is set synchronously but formik's "resume" field only updates
  // in reader.onloadend, asynchronously. A fast click on Submit right after
  // choosing a file could race ahead of that callback: the filename looks
  // set, but formik still sees an empty "resume" and rejects with "Resume is
  // required" even though the applicant just picked one.
  const [resumeReading, setResumeReading] = useState(false);
  const [resumeFileError, setResumeFileError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState("");
  const [job, setJob] = useState<any>(null);
  const [jobLoading, setJobLoading] = useState(true);
  const [jobError, setJobError] = useState("");

  useEffect(() => {
    if (!slug || !id) {
      setJobLoading(false);
      return;
    }
    apiClient
      .get(API_ENDPOINTS.GET_PUBLIC_JOB_OPENING(slug, id))
      .then((res) => {
        setJob(res.data?.data ?? null);
      })
      .catch((err) => {
        setJobError(
          err.response?.data?.message ?? "This job opening could not be found.",
        );
      })
      .finally(() => setJobLoading(false));
  }, [slug, id]);

  const formik = useFormik({
    initialValues: {
      name: "",
      mobile: "",
      email: "",
      aadharNo: "",
      jobTitle: id ?? "",
      resume: "",
    },
    validationSchema,
    onSubmit: async (values) => {
      setServerError("");
      if (!slug) {
        setServerError("This careers link is invalid.");
        return;
      }
      try {
        await apiClient.post(API_ENDPOINTS.APPLY_FOR_JOB(slug), values);
        setSubmitted(true);
      } catch (err) {
        setServerError(
          err.response?.data?.message ?? "Submission failed. Please try again.",
        );
      }
    },
  });

  const MAX_RESUME_SIZE_BYTES = 5 * 1024 * 1024; // 5MB — base64 (~+33%) still comfortably under the 10mb JSON body limit

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // "accept=.pdf" on the input is a UI hint only — browsers don't enforce
    // it, so an unauthenticated caller could otherwise base64-encode any
    // file/size into this public endpoint's JSON body.
    if (file.type !== "application/pdf") {
      setResumeFileError("Only PDF files are accepted.");
      e.target.value = "";
      return;
    }
    if (file.size > MAX_RESUME_SIZE_BYTES) {
      setResumeFileError("Resume must be smaller than 5MB.");
      e.target.value = "";
      return;
    }

    setResumeFileError("");
    setResumeFileName(file.name);
    setResumeReading(true);
    const reader = new FileReader();
    reader.onloadend = () => {
      formik.setFieldValue("resume", reader.result);
      setResumeReading(false);
    };
    reader.onerror = () => {
      setResumeFileError("Couldn't read that file. Please try again.");
      setResumeFileName("");
      setResumeReading(false);
    };
    reader.readAsDataURL(file);
  };

  const resumeHasError =
    Boolean(resumeFileError) ||
    Boolean(formik.touched.resume && formik.errors.resume);

  if (submitted) {
    return (
      <Box
        sx={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 2,
          px: 2,
          backgroundColor: "var(--card-background-primary, #f9fafb)",
          color: "var(--text-color, #111)",
          textAlign: "center",
        }}
      >
        <CheckCircle sx={{ fontSize: 64, color: "#4caf50" }} />
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          Application Submitted!
        </Typography>
        <Typography variant="body2" sx={{ opacity: 0.65, maxWidth: 360 }}>
          Thank you for applying. We'll review your application and get back to
          you soon.
        </Typography>
        <Button
          variant="outline"
          onClick={() => navigate(`/careers/${slug}`, { replace: true })}
          style={{ marginTop: 16, borderRadius: "8px" }}
        >
          View More Openings
        </Button>
      </Box>
    );
  }

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
        <People sx={{ fontSize: 26, color: "#2196f3" }} />
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          Apply for Position
        </Typography>
      </Box>

      <Box
        sx={{
          maxWidth: 1100,
          mx: "auto",
          px: { xs: 2, md: 4 },
          py: { xs: 4, md: 6 },
        }}
      >
        <Box
          sx={{
            display: "flex",
            flexDirection: { xs: "column", md: "row" },
            alignItems: "flex-start",
            gap: 3,
          }}
        >
          {/* Job details */}
          <Box sx={{ width: "100%", flex: 1, minWidth: 0 }}>
            {jobLoading ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
                <CircularProgress size={28} />
              </Box>
            ) : jobError ? (
              <Alert severity="warning">{jobError}</Alert>
            ) : job ? (
              <Box
                sx={{
                  backgroundColor: "var(--card-background-secondary, #fff)",
                  border: "1px solid var(--text-input-border, #e0e0e0)",
                  borderRadius: 2,
                  p: { xs: 3, md: 4 },
                  position: { md: "sticky" },
                  top: { md: 24 },
                }}
              >
                <Typography
                  variant="h6"
                  sx={{ fontWeight: 700, textTransform: "capitalize" }}
                >
                  {job.jobTitle}
                </Typography>
                {job.hiringManager && (
                  <Typography variant="caption" sx={{ opacity: 0.55 }}>
                    Hiring Manager: {job.hiringManager}
                  </Typography>
                )}

                <Box
                  sx={{ display: "flex", gap: 1, mt: 1.5, flexWrap: "wrap" }}
                >
                  {!!job.numberOfVacancies && (
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
                  {formatBudgetRange(job.budget) && (
                    <Chip
                      icon={<AttachMoney sx={{ fontSize: 13 }} />}
                      label={formatBudgetRange(job.budget)}
                      size="small"
                      variant="outlined"
                      sx={{ fontSize: 11 }}
                    />
                  )}
                  {formatDeadline(job.applicationDeadline) && (
                    <Chip
                      icon={<CalendarToday sx={{ fontSize: 12 }} />}
                      label={`Apply by ${formatDeadline(job.applicationDeadline)}`}
                      size="small"
                      variant="outlined"
                      sx={{ fontSize: 11 }}
                    />
                  )}
                </Box>

                {job.jobDescription && (
                  <>
                    <Divider
                      sx={{ my: 1.5, borderColor: "var(--text-input-border)" }}
                    />
                    <Typography
                      variant="body2"
                      sx={{
                        opacity: 0.8,
                        whiteSpace: "pre-wrap",
                        lineHeight: 1.6,
                      }}
                    >
                      {job.jobDescription}
                    </Typography>
                  </>
                )}

                {job.requiredSkills && (
                  <Typography
                    variant="caption"
                    sx={{ display: "block", mt: 1.5, opacity: 0.6 }}
                  >
                    Skills: {job.requiredSkills}
                  </Typography>
                )}
              </Box>
            ) : null}
          </Box>

          {/* Form */}
          <Box sx={{ width: "100%", flex: 1, minWidth: 0 }}>
            <Box
              sx={{
                backgroundColor: "var(--card-background-secondary, #fff)",
                border: "1px solid var(--text-input-border, #e0e0e0)",
                borderRadius: 2,
                p: { xs: 3, md: 4 },
              }}
            >
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
                Personal Details
              </Typography>

              {serverError && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {serverError}
                </Alert>
              )}

              <Box
                component="form"
                onSubmit={formik.handleSubmit}
                sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}
              >
                <TextField
                  fullWidth
                  id="name"
                  name="name"
                  label="Full Name"
                  size="small"
                  value={formik.values.name}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  error={formik.touched.name && Boolean(formik.errors.name)}
                  helperText={formik.touched.name && formik.errors.name}
                />

                <TextField
                  fullWidth
                  id="mobile"
                  name="mobile"
                  label="Mobile Number"
                  size="small"
                  inputProps={{ maxLength: 10 }}
                  value={formik.values.mobile}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  error={formik.touched.mobile && Boolean(formik.errors.mobile)}
                  helperText={formik.touched.mobile && formik.errors.mobile}
                />

                <TextField
                  fullWidth
                  id="email"
                  name="email"
                  label="Email Address"
                  size="small"
                  value={formik.values.email}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  error={formik.touched.email && Boolean(formik.errors.email)}
                  helperText={formik.touched.email && formik.errors.email}
                />

                <TextField
                  fullWidth
                  id="aadharNo"
                  name="aadharNo"
                  label="Aadhar Number"
                  size="small"
                  inputProps={{ maxLength: 12 }}
                  value={formik.values.aadharNo}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  error={
                    formik.touched.aadharNo && Boolean(formik.errors.aadharNo)
                  }
                  helperText={formik.touched.aadharNo && formik.errors.aadharNo}
                />

                <Divider sx={{ borderColor: "var(--text-input-border)" }} />

                {/* Resume upload */}
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                    Resume <span style={{ color: "#f44336" }}>*</span>
                  </Typography>
                  <Box
                    component="label"
                    htmlFor="resume-upload"
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1.5,
                      border: "1.5px dashed",
                      borderColor: resumeHasError
                        ? "#f44336"
                        : "var(--text-input-border, #ccc)",
                      borderRadius: "8px",
                      p: 2,
                      cursor: "pointer",
                      transition: "border-color 0.2s",
                      "&:hover": {
                        borderColor: "var(--link-color, #2196f3)",
                      },
                    }}
                  >
                    <UploadFile sx={{ opacity: 0.5 }} />
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {resumeFileName || "Click to upload PDF"}
                      </Typography>
                      <Typography variant="caption" sx={{ opacity: 0.5 }}>
                        PDF only, up to 5MB
                      </Typography>
                    </Box>
                    <input
                      id="resume-upload"
                      type="file"
                      accept=".pdf"
                      style={{ display: "none" }}
                      onChange={handleFileChange}
                      aria-invalid={resumeHasError}
                      aria-describedby={
                        resumeHasError ? "resume-error" : undefined
                      }
                    />
                  </Box>
                  {resumeHasError && (
                    <Typography
                      id="resume-error"
                      variant="caption"
                      sx={{ color: "#f44336", mt: 0.5, display: "block" }}
                    >
                      {resumeFileError || formik.errors.resume}
                    </Typography>
                  )}
                </Box>

                <Button
                  type="submit"
                  fullWidth
                  variant="primary"
                  disabled={formik.isSubmitting || resumeReading}
                  loading={formik.isSubmitting}
                  style={{
                    marginTop: 8,
                    paddingTop: 11.2,
                    paddingBottom: 11.2,
                    fontWeight: 600,
                    borderRadius: "8px",
                    backgroundColor: "var(--btn-bg)",
                    color: "var(--btn-color)",
                    boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
                  }}
                >
                  Submit Application
                </Button>
              </Box>
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

export default JobApplicationPage;
