import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useFormik } from "formik";
import { z } from "zod";
import { toFormikValidationSchema } from "zod-formik-adapter";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import Divider from "@mui/material/Divider";
import ArrowBack from "@mui/icons-material/ArrowBack";
import People from "@mui/icons-material/People";
import UploadFile from "@mui/icons-material/UploadFile";
import CheckCircle from "@mui/icons-material/CheckCircle";
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

function JobApplicationPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [resumeFileName, setResumeFileName] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState("");

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
      try {
        await apiClient.post(API_ENDPOINTS.APPLY_FOR_JOB, values);
        setSubmitted(true);
      } catch (err) {
        setServerError(
          err.response?.data?.message ?? "Submission failed. Please try again.",
        );
      }
    },
  });

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setResumeFileName(file.name);
    const reader = new FileReader();
    reader.onloadend = () => formik.setFieldValue("resume", reader.result);
    reader.readAsDataURL(file);
  };

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
          variant="outlined"
          onClick={() => navigate("/careers", { replace: true })}
          sx={{ mt: 2, textTransform: "none", borderRadius: "8px" }}
        >
          View More Openings
        </Button>
      </Box>
    );
  }

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
          Apply for Position
        </Typography>
      </Box>

      {/* Form */}
      <Box
        sx={{
          maxWidth: 560,
          mx: "auto",
          px: { xs: 2, md: 4 },
          py: { xs: 4, md: 6 },
        }}
      >
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
              error={formik.touched.aadharNo && Boolean(formik.errors.aadharNo)}
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
                  borderColor:
                    formik.touched.resume && formik.errors.resume
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
                    PDF only
                  </Typography>
                </Box>
                <input
                  id="resume-upload"
                  type="file"
                  accept=".pdf"
                  style={{ display: "none" }}
                  onChange={handleFileChange}
                />
              </Box>
              {formik.touched.resume && formik.errors.resume && (
                <Typography
                  variant="caption"
                  sx={{ color: "#f44336", mt: 0.5, display: "block" }}
                >
                  {formik.errors.resume}
                </Typography>
              )}
            </Box>

            <Button
              type="submit"
              fullWidth
              variant="contained"
              disabled={formik.isSubmitting}
              sx={{
                mt: 1,
                py: 1.4,
                textTransform: "none",
                fontWeight: 600,
                borderRadius: "8px",
                backgroundColor: "var(--btn-bg)",
                color: "var(--btn-color)",
                boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
                "&:hover": { boxShadow: "0 4px 18px rgba(0,0,0,0.22)" },
              }}
            >
              {formik.isSubmitting ? (
                <CircularProgress size={20} sx={{ color: "inherit" }} />
              ) : (
                "Submit Application"
              )}
            </Button>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

export default JobApplicationPage;
