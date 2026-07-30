import { memo, useContext, useEffect, useMemo } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { AlertContext } from "@web/app/providers/AlertContext";
import { useFormik } from "formik";
import apiClient from "@web/core/http/axiosConfig";
import { jobOpeningValidationSchema as validationSchema } from "./schemas";
import FormikInputWrapper from "@web/shared/components/InputWrapper";
import Button from "@web/shared/components/Button";
import CustomModal from "@web/shared/components/Modal";
import EditIcon from "@mui/icons-material/Edit";
import WorkIcon from "@mui/icons-material/Work";
import Grid from "@mui/material/Grid2";
import { Dropdown } from "primereact/dropdown";
import { API_ENDPOINTS } from "@web/shared/constants";
import useJobTitleOptions from "./useJobTitleOptions";
import useFetchData from "@web/shared/hooks/useFetchData";

const FormikDropdownWrapper = ({
  name,
  options,
  placeholder,
  formik,
  inputProps = {},
}) => {
  const hasError = formik.touched[name] && formik.errors[name];

  return (
    <Box sx={{ mb: 1 }}>
      <Dropdown
        value={formik.values[name]}
        onChange={(e) => formik.setFieldValue(name, e.value)}
        options={options}
        onBlur={() => formik.setFieldTouched(name, true)}
        placeholder={placeholder}
        // appendTo="self" renders inside this modal's animated (transformed)
        // CustomModal wrapper, which breaks the panel's viewport position
        // calc — see ScheduleInterviewModal.tsx for the same established fix.
        appendTo={() => document.querySelector("#root .App") as HTMLElement}
        className={hasError ? "p-invalid" : ""}
        style={{ width: "100%" }}
        {...inputProps}
      />
      {hasError && (
        <Typography
          variant="caption"
          color="error"
          sx={{ mt: 0.5, display: "block" }}
        >
          {formik.errors[name]}
        </Typography>
      )}
    </Box>
  );
};

const FormikBudgetRangeWrapper = ({ name, label, formik }) => {
  const hasError = formik.touched[name] && formik.errors[name];
  const [min, max] = formik.values[name];

  return (
    <Box sx={{ width: "100%" }}>
      <Typography variant="body2" color="text.secondary" gutterBottom>
        {label}
      </Typography>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
        <TextField
          label="Min (LPA)"
          type="number"
          size="small"
          fullWidth
          value={min}
          onChange={(e) =>
            formik.setFieldValue(name, [
              e.target.value === "" ? 0 : Number(e.target.value),
              max,
            ])
          }
          onBlur={() => formik.setFieldTouched(name, true)}
          inputProps={{ step: 0.1, min: 0 }}
        />
        <Typography variant="body2" color="text.secondary">
          to
        </Typography>
        <TextField
          label="Max (LPA)"
          type="number"
          size="small"
          fullWidth
          value={max}
          onChange={(e) =>
            formik.setFieldValue(name, [
              min,
              e.target.value === "" ? 0 : Number(e.target.value),
            ])
          }
          onBlur={() => formik.setFieldTouched(name, true)}
          inputProps={{ step: 0.1, min: 0 }}
        />
      </Box>
      {hasError && (
        <Typography
          variant="caption"
          color="error"
          sx={{ mt: 0.5, display: "block" }}
        >
          {formik.errors[name]}
        </Typography>
      )}
    </Box>
  );
};

function EditJobOpeningModal(props) {
  const { setAlert } = useContext(AlertContext);
  const { options: jobTitleOptions, ensureJobTitleSaved } =
    useJobTitleOptions();
  const { data: pipelineTemplatesData } = useFetchData(
    API_ENDPOINTS.LIST_INTERVIEW_PIPELINE_TEMPLATES,
    "get",
    [],
    null,
    null,
  );
  const pipelineTemplateOptions = useMemo(() => {
    if (!pipelineTemplatesData || !Array.isArray(pipelineTemplatesData))
      return [];
    return pipelineTemplatesData
      .filter((t) => t.isActive)
      .map((t) => ({
        label: t.isDefault ? `${t.name} (Default)` : t.name,
        value: t.id,
      }));
  }, [pipelineTemplatesData]);
  const {
    id: _id,
    jobPostingDate,
    applicationDeadline,
    budget,
  } = props.jobData || {};

  const formik = useFormik({
    initialValues: {
      jobTitle: "",
      numberOfVacancies: "",
      jobPostingDate: new Date().toISOString().split("T")[0],
      applicationDeadline: "",
      jobDescription: "",
      requiredSkills: "",
      experience: "",
      budget: [0, 0],
      hiringManager: "",
      pipelineTemplateId: "",
    },
    validationSchema,
    onSubmit: async (values) => {
      try {
        // Best-effort — see useJobTitleOptions for why failures are swallowed.
        void ensureJobTitleSaved(values.jobTitle);

        // Perform optimistic update
        const optimisticData = {
          ...values,
          _id: _id,
          status: props.jobData?.status,
          createdBy: props.jobData?.createdBy,
          createdOn: props.jobData?.createdOn,
          candidatesHired: props.jobData?.candidatesHired,
        };

        // Update UI optimistically
        if (props.updateJobOptimistically) {
          props.updateJobOptimistically(_id, optimisticData);
        }

        // Close modal immediately
        props.handleClose();

        // Show optimistic success message
        setAlert({
          open: true,
          message: "Job opening updated successfully",
          severity: "success",
        });

        // Make API call in background
        await apiClient.put(API_ENDPOINTS.EDIT_JOB_OPENING(_id), values);

        if (props.getData) {
          props.getData();
        }
      } catch (error) {
        console.error("Error updating job opening:", error);

        // Revert optimistic update on error
        if (props.revertOptimisticUpdate) {
          props.revertOptimisticUpdate();
        }

        // Show error message
        setAlert({
          open: true,
          message:
            error.message === "Network Error"
              ? "Network Error, your details will be submitted when you are back online"
              : error.response?.data?.message || "An error occurred",
          severity: "error",
        });
      }
    },
  });

  useEffect(() => {
    if (props.jobData) {
      formik.setValues({
        jobTitle: props.jobData?.jobTitle || "",
        numberOfVacancies: props.jobData?.numberOfVacancies || "",
        jobPostingDate:
          jobPostingDate?.split("T")[0] ||
          new Date().toISOString().split("T")[0],
        applicationDeadline: applicationDeadline?.split("T")[0] || "",
        jobDescription: props.jobData?.jobDescription || "",
        requiredSkills: props.jobData?.requiredSkills || "",
        experience:
          props.jobData?.experience != null
            ? String(props.jobData.experience)
            : "",
        budget: Array.isArray(budget) ? budget : [0, 0],
        hiringManager: props.jobData?.hiringManager || "",
        pipelineTemplateId: props.jobData?.pipelineTemplateId || "",
      });
    }
  }, [props.jobData]);

  const modalStyle = {
    width: { xs: "95%", sm: 750, md: 950 },
    maxHeight: "95vh",
  };

  return (
    <CustomModal
      open={props.open}
      handleClose={props.handleClose}
      modalStyle={modalStyle}
      disablePortal
    >
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          p: 2.5,
          pb: 2,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Box
            sx={{
              p: 0.75,
              bgcolor: "warning.main",
              color: "warning.contrastText",
              borderRadius: 1.5,
              display: "flex",
            }}
          >
            <EditIcon fontSize="small" />
          </Box>
          <Box>
            <Typography
              variant="h6"
              fontWeight={600}
              sx={{ fontSize: "1.1rem" }}
            >
              Edit Job Opening
            </Typography>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <WorkIcon sx={{ fontSize: 14, color: "text.secondary" }} />
              <Typography variant="caption" color="text.secondary">
                {props.jobData?.jobTitle || "Job Position"}
              </Typography>
            </Box>
          </Box>
        </Box>
      </Box>

      {/* Form Content */}
      <Box sx={{ p: 1.5 }}>
        <form onSubmit={formik.handleSubmit}>
          <Stack spacing={1}>
            {/* Basic Information */}
            <Box>
              <Typography
                variant="subtitle2"
                color="text.secondary"
                gutterBottom
              >
                Basic Information
              </Typography>
              <Grid container spacing={1}>
                <Grid size={{ xs: 12, md: 6 }}>
                  <FormikDropdownWrapper
                    name="jobTitle"
                    options={jobTitleOptions}
                    placeholder="Job Title"
                    formik={formik}
                    inputProps={{
                      editable: true,
                      filterPlaceholder: "Search or type a new title...",
                    }}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <FormikInputWrapper
                    type="text"
                    name="numberOfVacancies"
                    placeholder="Number of Vacancies"
                    formik={formik}
                    inputProps={{ keyfilter: "int" }}
                  />
                </Grid>
              </Grid>
            </Box>

            {/* Timeline */}
            <Box>
              <Typography
                variant="subtitle2"
                color="text.secondary"
                gutterBottom
              >
                Timeline
              </Typography>
              <Grid container spacing={1}>
                <Grid size={{ xs: 12, md: 6 }}>
                  <FormikInputWrapper
                    type="date"
                    name="jobPostingDate"
                    placeholder="Job Posting Date"
                    formik={formik}
                    inputProps={{ showIcon: true, showButtonBar: true }}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <FormikInputWrapper
                    type="date"
                    name="applicationDeadline"
                    placeholder="Application Deadline"
                    formik={formik}
                    inputProps={{ showIcon: true, showButtonBar: true }}
                  />
                </Grid>
              </Grid>
            </Box>

            {/* Job Details */}
            <Box>
              <Typography
                variant="subtitle2"
                color="text.secondary"
                gutterBottom
              >
                Job Details
              </Typography>
              <Stack spacing={1}>
                <FormikInputWrapper
                  type="text"
                  name="jobDescription"
                  placeholder="Job Description"
                  formik={formik}
                />
                <Grid container spacing={1}>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <FormikInputWrapper
                      type="text"
                      name="requiredSkills"
                      placeholder="Required Skills"
                      formik={formik}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <FormikInputWrapper
                      type="text"
                      name="experience"
                      placeholder="Experience (in years)"
                      formik={formik}
                      inputProps={{ keyfilter: "int" }}
                    />
                  </Grid>
                </Grid>
              </Stack>
            </Box>

            {/* Management & Budget */}
            <Box>
              <Typography
                variant="subtitle2"
                color="text.secondary"
                gutterBottom
              >
                Management & Budget
              </Typography>
              <Grid container spacing={1}>
                <Grid size={{ xs: 12, md: 6 }}>
                  <FormikInputWrapper
                    type="text"
                    name="hiringManager"
                    placeholder="Hiring Manager"
                    formik={formik}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <FormikBudgetRangeWrapper
                    name="budget"
                    label="Salary Range (LPA)"
                    formik={formik}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <FormikDropdownWrapper
                    name="pipelineTemplateId"
                    options={pipelineTemplateOptions}
                    placeholder="Interview Pipeline (tenant default)"
                    formik={formik}
                    inputProps={{
                      optionLabel: "label",
                      optionValue: "value",
                      showClear: true,
                      emptyMessage: "No pipelines configured",
                    }}
                  />
                </Grid>
              </Grid>
            </Box>

            {/* Submit Button */}
            <Box sx={{ pb: 1 }}>
              <Button type="submit" disabled={formik.isSubmitting}>
                Update Job Opening
              </Button>
            </Box>
          </Stack>
        </form>
      </Box>
    </CustomModal>
  );
}

export default memo(EditJobOpeningModal);
