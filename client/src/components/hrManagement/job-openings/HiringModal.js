import React, { useContext } from "react";
import Box from "@mui/material/Box";
import Modal from "@mui/material/Modal";
import { AlertContext } from "../../../contexts/AlertContext";
import { style } from "../../../utils/modalStyle";
import { useFormik } from "formik";
import CustomButton from "../../customComponents/CustomButton";
import apiClient from "../../../config/axiosConfig";
import { validationSchema } from "../../../schemas/hrManagement/jobOpenings/hiring";
import Grid from "@mui/material/Grid2";
import FormikInputWrapper from "../../customComponents/InputWrapper";

function HiringModal(props) {
  const { setAlert } = useContext(AlertContext);
  const { name, email, aadharNo } = props.applicantData;
  const formik = useFormik({
    initialValues: {
      salary: "",
      joining_date: "",
      reference_by: "",
    },
    validationSchema,
    onSubmit: async (values) => {
      const data = {
        ...values,
        aadharNo: aadharNo,
        jobTitle: props.jobTitle,
        email: email,
        name: name,
        _id: props._id,
      };

      try {
        const res = await apiClient.put(`/hire-candidate`, data);
        setAlert({
          open: true,
          message: res.data.message,
          severity: "success",
        });
        // Re-fetch job applications after rejection
        props.getJobApplications();
      } catch (err) {
        setAlert({
          open: true,
          message:
            err.message === "Network Error"
              ? "Network Error, your details will be submitted when you are back online"
              : err.response.data.message,
          severity: "error",
        });
      }
    },
  });
  return (
    <div>
      <Modal
        open={props.open}
        onClose={props.handleClose}
        aria-labelledby="modal-modal-title"
        aria-describedby="modal-modal-description"
        disablePortal
      >
        <Box sx={style}>
          <form onSubmit={formik.handleSubmit}>
            <h4>Hire Candidate</h4>
            <br />
            <Grid container spacing={1}>
              <Grid size={12}>
                <FormikInputWrapper
                  type="text"
                  name="salary"
                  placeholder="Salary"
                  formik={formik}
                  inputProps={{
                    keyfilter: "int",
                    minLength: 4,
                    maxLength: 10,
                  }}
                />
              </Grid>

              <Grid size={12}>
                <FormikInputWrapper
                  type="date"
                  name="joining_date"
                  placeholder="Joining Date"
                  formik={formik}
                  inputProps={{
                    minDate: new Date(),
                    dateFormat: "dd/mm/yy",
                    showIcon: true,
                    showButtonBar: true,
                    appendTo: "self",
                  }}
                />
              </Grid>

              <Grid size={12}>
                <FormikInputWrapper
                  type="text"
                  name="reference_by"
                  placeholder="Reference By"
                  formik={formik}
                />
              </Grid>
            </Grid>

            <CustomButton name="Submit" isSubmitting={formik.isSubmitting} />
          </form>
        </Box>
      </Modal>
    </div>
  );
}

export default React.memo(HiringModal);
