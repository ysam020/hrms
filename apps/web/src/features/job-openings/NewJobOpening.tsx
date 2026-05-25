import { memo, useContext, useMemo } from "react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Slider from "@mui/material/Slider";
import Grid from "@mui/material/Grid2";
import Work from "@mui/icons-material/Work";
import Schedule from "@mui/icons-material/Schedule";
import Description from "@mui/icons-material/Description";
import AttachMoney from "@mui/icons-material/AttachMoney";
import Add from "@mui/icons-material/Add";
import { useFormik } from "formik";
import { jobOpeningValidationSchema as validationSchema } from "./schemas";
import Button from "@web/shared/components/Button";
import { AlertContext } from "@web/app/providers/AlertContext";
import apiClient from "@web/core/http/axiosConfig";
import useFetchData from "@web/shared/hooks/useFetchData";
import { Dropdown } from "primereact/dropdown";
import FormikInputWrapper from "@web/shared/components/InputWrapper";
import { jobTitles } from "@web/assets/data/jobTitles";
import { API_ENDPOINTS } from "@web/shared/constants";

function valuetext(value) {
  return `${value} LPA`;
}

const marks = [
  { value: 2, label: "2 LPA" },
  { value: 10, label: "10 LPA" },
];

// Dropdown wrapper component
const FormikDropdownWrapper = ({
  name,
  options,
  placeholder,
  formik,
  inputProps = {},
}) => {
  const hasError = formik.touched[name] && formik.errors[name];

  return (
    <div className="form-field-container">
      <Dropdown
        value={formik.values[name]}
        onChange={(e) => formik.setFieldValue(name, e.value)}
        options={options}
        onBlur={() => formik.setFieldTouched(name, true)}
        placeholder={placeholder}
        appendTo="self"
        className={hasError ? "p-invalid" : ""}
        style={{ width: "100%" }}
        {...inputProps}
      />
      {hasError && <small className="p-error">{formik.errors[name]}</small>}
    </div>
  );
};

function NewJobOpenings({ onSaved }) {
  const { setAlert } = useContext(AlertContext);

  // Fetch user names using custom hook
  const { data: usersData } = useFetchData(
    "/get-all-users?limit=1000",
    "get",
    [],
    null,
    null,
  );

  // Transform user data for dropdown
  const userList = useMemo(() => {
    if (!usersData || !Array.isArray(usersData)) return [];
    return usersData
      .map((user) => {
        const parts = [user?.firstName, user?.lastName].filter(
          (v) => v && v !== "null",
        );
        return parts.length > 0
          ? parts.join(" ").toUpperCase()
          : (user?.username?.toUpperCase() ?? "");
      })
      .filter(Boolean);
  }, [usersData]);

  const formik = useFormik({
    initialValues: {
      jobTitle: "",
      numberOfVacancies: "",
      jobPostingDate: new Date().toISOString().split("T")[0],
      applicationDeadline: "",
      jobDescription: "",
      requiredSkills: "",
      experience: "",
      budget: [2, 10],
      hiringManager: "",
    },
    validationSchema,
    onSubmit: async (values) => {
      try {
        const res = await apiClient.post(API_ENDPOINTS.ADD_JOB_OPENING, values);
        setAlert({
          open: true,
          message: res.data.message,
          severity: "success",
        });
        formik.resetForm();
        onSaved?.();
      } catch (error) {
        setAlert({
          open: true,
          message:
            error.message === "Network Error"
              ? "Network Error, your details will be submitted when you are back online"
              : error.response.data.message,
          severity: "error",
        });
      }
    },
  });

  const handleSliderChange = (event, newValue) => {
    formik.setFieldValue("budget", newValue);
    formik.setFieldTouched("budget", true);
  };

  return (
    <Card sx={{ maxWidth: 800, mx: "auto", boxShadow: 2 }}>
      <CardContent sx={{ p: 2 }}>
        {/* Header */}
        <Box display="flex" alignItems="center" gap={1} mb={2}>
          <Add color="primary" />
          <Typography variant="h6" fontWeight="600">
            New Job Opening
          </Typography>
        </Box>

        <form onSubmit={formik.handleSubmit}>
          <Grid container spacing={1}>
            {/* Job Details */}
            <Grid size={12}>
              <Paper sx={{ p: 1.5, bgcolor: "background.default" }}>
                <Box display="flex" alignItems="center" gap={1} mb={1}>
                  <Work sx={{ fontSize: 18, color: "text.secondary" }} />
                  <Typography variant="subtitle2" fontWeight="500">
                    Job Details
                  </Typography>
                </Box>
                <Grid container spacing={1.5}>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <FormikDropdownWrapper
                      name="jobTitle"
                      options={jobTitles}
                      placeholder="Job Title"
                      formik={formik}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <FormikInputWrapper
                      type="text"
                      name="numberOfVacancies"
                      placeholder="Number of Vacancies"
                      formik={formik}
                      inputProps={{ keyfilter: "int" }}
                    />
                  </Grid>
                  <Grid size={12}>
                    <FormikInputWrapper
                      type="text"
                      name="jobDescription"
                      placeholder="Job Description"
                      formik={formik}
                    />
                  </Grid>
                </Grid>
              </Paper>
            </Grid>

            {/* Timeline */}
            <Grid size={12}>
              <Paper sx={{ p: 1.5, bgcolor: "background.default" }}>
                <Box display="flex" alignItems="center" gap={1} mb={1}>
                  <Schedule sx={{ fontSize: 18, color: "text.secondary" }} />
                  <Typography variant="subtitle2" fontWeight="500">
                    Timeline
                  </Typography>
                </Box>
                <Grid container spacing={1.5}>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <FormikInputWrapper
                      type="date"
                      name="jobPostingDate"
                      placeholder="Job Posting Date"
                      formik={formik}
                      inputProps={{ showIcon: true, showButtonBar: true }}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <FormikInputWrapper
                      type="date"
                      name="applicationDeadline"
                      placeholder="Application Deadline"
                      formik={formik}
                      inputProps={{ showIcon: true, showButtonBar: true }}
                    />
                  </Grid>
                </Grid>
              </Paper>
            </Grid>

            {/* Requirements */}
            <Grid size={12}>
              <Paper sx={{ p: 1.5, bgcolor: "background.default" }}>
                <Box display="flex" alignItems="center" gap={1} mb={1}>
                  <Description sx={{ fontSize: 18, color: "text.secondary" }} />
                  <Typography variant="subtitle2" fontWeight="500">
                    Requirements
                  </Typography>
                </Box>
                <Grid container spacing={1.5}>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <FormikInputWrapper
                      type="text"
                      name="requiredSkills"
                      placeholder="Required Skills"
                      formik={formik}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <FormikInputWrapper
                      type="text"
                      name="experience"
                      placeholder="Experience (in years)"
                      formik={formik}
                      inputProps={{ keyfilter: "int" }}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    {/* Updated Hiring Manager Dropdown */}
                    <FormikDropdownWrapper
                      name="hiringManager"
                      options={userList}
                      placeholder="Select Hiring Manager"
                      formik={formik}
                      inputProps={{
                        filterPlaceholder: "Search hiring manager...",
                        emptyMessage: "No hiring managers found",
                      }}
                    />
                  </Grid>
                </Grid>
              </Paper>
            </Grid>

            {/* Budget */}
            <Grid size={12}>
              <Paper sx={{ p: 1.5, bgcolor: "background.default" }}>
                <Box display="flex" alignItems="center" gap={1} mb={1}>
                  <AttachMoney sx={{ fontSize: 18, color: "text.secondary" }} />
                  <Typography variant="subtitle2" fontWeight="500">
                    Budget Range
                  </Typography>
                </Box>
                <Box sx={{ px: 2, py: 1 }}>
                  <Box display="flex" alignItems="center" gap={2} mb={1}>
                    <Typography variant="body2" color="text.secondary">
                      Salary Range
                    </Typography>
                    <Typography variant="body2" fontWeight="500">
                      {formik.values.budget[0]} - {formik.values.budget[1]} LPA
                    </Typography>
                  </Box>
                  <Slider
                    value={formik.values.budget}
                    onChange={handleSliderChange}
                    onBlur={() => formik.setFieldTouched("budget", true)}
                    valueLabelDisplay="auto"
                    getAriaValueText={valuetext}
                    marks={marks}
                    min={2}
                    max={10}
                    step={0.1}
                    sx={{
                      color: "primary.main",
                      "& .MuiSlider-thumb": {
                        backgroundColor: "primary.main",
                      },
                      "& .MuiSlider-track": {
                        backgroundColor: "primary.main",
                      },
                    }}
                  />
                  {formik.touched.budget && formik.errors.budget && (
                    <Typography
                      variant="caption"
                      color="error"
                      sx={{ display: "block", mt: 0.5 }}
                    >
                      {formik.errors.budget}
                    </Typography>
                  )}
                </Box>
              </Paper>
            </Grid>

            {/* Submit */}
            <Grid size={12}>
              <Box display="flex" justifyContent="center">
                <Button
                  type="submit"
                  disabled={formik.isSubmitting}
                  sx={{
                    minWidth: 180,
                    textTransform: "none",
                    fontWeight: "500",
                  }}
                >
                  Create Job Opening
                </Button>
              </Box>
            </Grid>
          </Grid>
        </form>
      </CardContent>
    </Card>
  );
}

export default memo(NewJobOpenings);
