import React, { useContext } from "react";
import { useFormik } from "formik";
import { validationSchema } from "../../../schemas/hrManagement/jobOpenings/jobOpening";
import CustomButton from "../../customComponents/CustomButton";
import Slider from "@mui/material/Slider";
import { AlertContext } from "../../../contexts/AlertContext";
import Grid from "@mui/material/Grid2";
import apiClient from "../../../config/axiosConfig";
import { Dropdown } from "primereact/dropdown";
import FormikInputWrapper from "../../customComponents/InputWrapper";
import { jobTitles } from "../../../assets/data/jobTitles";

function valuetext(value) {
  return `${value} LPA`;
}

const marks = [
  {
    value: 2,
    label: "2 LPA",
  },
  {
    value: 10,
    label: "10 LPA",
  },
];

// New component for the Dropdown with error handling
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
        {...inputProps}
      />
      {hasError && <small className="p-error">{formik.errors[name]}</small>}
    </div>
  );
};

// New component for the Slider with error handling
const FormikSliderWrapper = ({ name, label, formik, sliderProps = {} }) => {
  const hasError = formik.touched[name] && formik.errors[name];

  const handleSliderChange = (event, newValue) => {
    formik.setFieldValue(name, newValue);
    formik.setFieldTouched(name, true);
  };

  return (
    <div className="form-field-container">
      <div
        style={{
          display: "flex",
          alignItems: "center",
        }}
      >
        <span>{label}</span>
        <Slider
          getAriaLabel={() => label}
          value={formik.values[name]}
          onChange={handleSliderChange}
          onBlur={() => formik.setFieldTouched(name, true)}
          valueLabelDisplay="auto"
          getAriaValueText={valuetext}
          {...sliderProps}
        />
      </div>
      {hasError && <small className="p-error">{formik.errors[name]}</small>}
    </div>
  );
};

function NewJobOpenings() {
  const { setAlert } = useContext(AlertContext);
  const formik = useFormik({
    initialValues: {
      jobTitle: "",
      numberOfVacancies: "",
      jobPostingDate: new Date().toISOString().split("T")[0],
      applicationDeadline: "",
      jobDescription: "",
      requiredSkills: "",
      experience: "",
      location: "",
      budget: [2, 10],
      hiringManager: "",
    },
    validationSchema,
    onSubmit: async (values) => {
      try {
        const res = await apiClient.post(`/add-job-opening`, values);
        setAlert({
          open: true,
          message: res.data.message,
          severity: "success",
        });
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

  return (
    <form onSubmit={formik.handleSubmit}>
      <Grid container spacing={1}>
        <Grid size={{ xs: 12, sm: 12, md: 12, lg: 6 }}>
          <FormikDropdownWrapper
            name="jobTitle"
            options={jobTitles}
            placeholder="Job Title"
            formik={formik}
            inputProps={{ optionLabel: "name" }}
          />
        </Grid>

        <Grid size={{ xs: 12, sm: 12, md: 12, lg: 6 }}>
          <FormikInputWrapper
            type="text"
            name="numberOfVacancies"
            placeholder="Number of Vacancies"
            formik={formik}
            inputProps={{ keyfilter: "int" }}
          />
        </Grid>
      </Grid>

      <Grid container spacing={1}>
        <Grid size={{ xs: 12, sm: 12, md: 12, lg: 6 }}>
          <FormikInputWrapper
            type="date"
            name="jobPostingDate"
            placeholder="Job Posting Date"
            formik={formik}
            inputProps={{ showIcon: true, showButtonBar: true }}
          />
        </Grid>

        <Grid size={{ xs: 12, sm: 12, md: 12, lg: 6 }}>
          <FormikInputWrapper
            type="date"
            name="applicationDeadline"
            placeholder="Application Deadline"
            formik={formik}
            inputProps={{ showIcon: true, showButtonBar: true }}
          />
        </Grid>
      </Grid>

      <Grid container spacing={1}>
        <Grid size={12}>
          <FormikInputWrapper
            type="text"
            name="jobDescription"
            placeholder="Job Description"
            formik={formik}
          />
        </Grid>
      </Grid>

      <Grid container spacing={1}>
        <Grid size={{ xs: 12, sm: 12, md: 12, lg: 6 }}>
          <FormikInputWrapper
            type="text"
            name="requiredSkills"
            placeholder="Required Skills"
            formik={formik}
          />
        </Grid>

        <Grid size={{ xs: 12, sm: 12, md: 12, lg: 6 }}>
          <FormikInputWrapper
            type="text"
            name="experience"
            placeholder="Experience (in years)"
            formik={formik}
            inputProps={{ keyfilter: "int" }}
          />
        </Grid>
      </Grid>

      <Grid container spacing={1}>
        <Grid size={{ xs: 12, sm: 12, md: 12, lg: 6 }}>
          <FormikInputWrapper
            type="text"
            name="hiringManager"
            placeholder="Hiring Manager"
            formik={formik}
          />
        </Grid>

        <Grid size={{ xs: 12, sm: 12, md: 12, lg: 6 }}>
          <FormikInputWrapper
            type="text"
            name="location"
            placeholder="Location"
            formik={formik}
          />
        </Grid>
      </Grid>

      <br />
      <FormikSliderWrapper
        name="budget"
        label="Budget"
        formik={formik}
        sliderProps={{
          getAriaValueText: valuetext,
          marks: marks,
          min: 2,
          max: 10,
          step: 0.1,
        }}
      />
      <br />

      <CustomButton name="Submit" isSubmitting={formik.isSubmitting} />
    </form>
  );
}

export default React.memo(NewJobOpenings);
