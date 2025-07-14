import React from "react";
import Box from "@mui/material/Box";
import Modal from "@mui/material/Modal";
import { style } from "../../../utils/modalStyle";
import apiClient from "../../../config/axiosConfig";
import { useFormik } from "formik";
import CustomButton from "../../customComponents/CustomButton";
import Grid from "@mui/material/Grid2";
import { validationSchema } from "../../../schemas/hrManagement/appraisals/feedback";
import { AlertContext } from "../../../contexts/AlertContext";
import FormikInputWrapper from "../../customComponents/InputWrapper";

function AddFeedbackModal(props) {
  const { setAlert } = React.useContext(AlertContext);
  const { username, _id } = props.appraisalData || {};

  const formik = useFormik({
    initialValues: {
      manager_strengths: "",
      manager_AreasOfImprovement: "",
      feedback: "",
    },
    validationSchema,
    onSubmit: async (values) => {
      try {
        const res = await apiClient.put(
          `/add-appraisal-feedback/${username}/${_id}`,
          values
        );

        setAlert({
          open: true,
          message: res.data.message,
          severity: "success",
        });
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
          <Grid container spacing={1}>
            <Grid size={12}>
              <h3>Add Appraisal Feedback for {username}</h3>
            </Grid>
          </Grid>
          <form onSubmit={formik.handleSubmit}>
            <Grid container spacing={1}>
              <Grid size={12}>
                <FormikInputWrapper
                  type="text"
                  name="manager_strengths"
                  placeholder="Strengths"
                  formik={formik}
                />
              </Grid>
            </Grid>
            <Grid container spacing={1}>
              <Grid size={12}>
                <FormikInputWrapper
                  type="text"
                  name="manager_AreasOfImprovement"
                  placeholder="Areas of Improvement"
                  formik={formik}
                />
              </Grid>
            </Grid>

            <Grid container spacing={1}>
              <Grid size={12}>
                <FormikInputWrapper
                  type="text"
                  name="feedback"
                  placeholder="Feedback"
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

export default React.memo(AddFeedbackModal);
