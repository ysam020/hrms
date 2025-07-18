import React, { useState, useRef, useContext } from "react";
import Grid from "@mui/material/Grid2";
import { AlertContext } from "../../../contexts/AlertContext";
import { UserContext } from "../../../contexts/UserContext";
import { useFormik } from "formik";
import CustomButton from "../../customComponents/CustomButton";
import Snackbar from "@mui/material/Snackbar";
import { validationSchema } from "../../../schemas/hrManagement/attendanceAndLeaves/leaveSchema";
import apiClient from "../../../config/axiosConfig";
import FormikInputWrapper from "../../customComponents/InputWrapper";
import FormikCheckboxWrapper from "../../customComponents/CheckboxWrapper";
import FormikFileUploadWrapper from "../../customComponents/FileUploadWrapper";
import DropdownWrapper from "../../customComponents/DropdownWrapper";
import { useEffect } from "react";

function LeaveApplication() {
  const [availablePaidLeaves, setAvailablePaidLeaves] = useState(0);
  const [fileSnackbar, setFileSnackbar] = useState(false);
  const fileUploadRefs = useRef({
    medicalCertificate: null,
  });

  const { setAlert } = useContext(AlertContext);
  const { user } = useContext(UserContext);

  useEffect(() => {
    let isMounted = true;

    async function getPaidLeaves() {
      try {
        const res = await apiClient.get(`/get-available-paid-leaves`);

        // Only update state if component is still mounted
        if (isMounted) {
          setAvailablePaidLeaves(res.data);
        }
      } catch (error) {
        console.error(error);
      }
    }

    getPaidLeaves();

    return () => {
      isMounted = false;
    };
  }, [user]);

  const formik = useFormik({
    initialValues: {
      from: "",
      to: "",
      reason: "",
      leaveType: "",
      sick_leave: false,
      medical_certificate: "",
    },
    validationSchema,
    onSubmit: async (values) => {
      try {
        const res = await apiClient.post(`/add-leave`, values);
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
        <Grid size={{ xs: 12, sm: 12, md: 4, lg: 4 }}>
          Available Paid Leaves: {availablePaidLeaves}
        </Grid>
      </Grid>

      <Grid container spacing={1}>
        <Grid size={{ xs: 12, sm: 12, md: 4, lg: 4 }}>
          <FormikInputWrapper
            type="date"
            name="from"
            placeholder="From"
            formik={formik}
            inputProps={{
              minDate: new Date(),
              dateFormat: "dd/mm/yy",
              showIcon: true,
              showButtonBar: true,
            }}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 12, md: 4, lg: 4 }}>
          <FormikInputWrapper
            type="date"
            name="to"
            placeholder="To"
            formik={formik}
            inputProps={{
              minDate: new Date(),
              dateFormat: "dd/mm/yy",
              showIcon: true,
              showButtonBar: true,
            }}
          />
        </Grid>

        <Grid size={{ xs: 12, sm: 12, md: 4, lg: 4 }}>
          <FormikInputWrapper
            type="text"
            name="reason"
            placeholder="Reason"
            formik={formik}
          />
        </Grid>
      </Grid>
      <Grid container spacing={1}>
        <Grid size={{ xs: 12, sm: 12, md: 4, lg: 4 }}>
          <DropdownWrapper
            name={"leaveType"}
            options={
              user.rank === 4
                ? [{ label: "LWP", value: "LWP" }]
                : [
                    { label: "PL", value: "PL" },
                    { label: "LWP", value: "LWP" },
                  ]
            }
            placeholder={"Leave Type"}
            formik={formik}
          />
        </Grid>
      </Grid>
      <FormikCheckboxWrapper
        name="sick_leave"
        label="Sick Leave"
        formik={formik}
      />
      {formik.values.sick_leave && (
        <FormikFileUploadWrapper
          name="medical_certificate"
          label="Medical Certificate"
          formik={formik}
          fileUploadRef={(el) =>
            (fileUploadRefs.current.medicalCertificate = el)
          }
          accept="image/*,application/pdf"
          setFileSnackbar={setFileSnackbar}
          folderName="medical_certificates"
          username={user.username}
        />
      )}
      <CustomButton name="Submit" isSubmitting={formik.isSubmitting} />
      <Snackbar
        open={fileSnackbar}
        message="File uploaded successfully!"
        sx={{ left: "auto !important", right: "24px !important" }}
      />
    </form>
  );
}

export default React.memo(LeaveApplication);
