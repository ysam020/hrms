import React, { useContext, useEffect } from "react";
import Box from "@mui/material/Box";
import Modal from "@mui/material/Modal";
import { AlertContext } from "../../../contexts/AlertContext";
import { style } from "../../../utils/modalStyle";
import { useFormik } from "formik";
import CustomButton from "../../customComponents/CustomButton";
import apiClient from "../../../config/axiosConfig";
import { validationSchema } from "../../../schemas/hrManagement/hrActivitiesSchema";
import Grid from "@mui/material/Grid2";
import FormikInputWrapper from "../../customComponents/InputWrapper";

function EditHrActivityModal(props) {
  const { setAlert } = useContext(AlertContext);
  const { _id, title, description, date, time } = props.activityData || {};

  const formik = useFormik({
    initialValues: {
      title: "",
      description: "",
      date: "",
      time: "",
    },
    validationSchema,
    onSubmit: async (values) => {
      try {
        const res = await apiClient.put(`/edit-hr-activity/${_id}`, values);
        props.getData();
        setAlert({
          open: true,
          message: res.data.message,
          severity: "success",
        });
        props.handleClose();
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

  useEffect(() => {
    formik.setValues({
      title: title || "",
      description: description || "",
      date: date || "",
      time: time || "",
    });
    // eslint-disable-next-line
  }, [title, description, date, time]);

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
            <Grid container spacing={1}>
              <Grid size={12}>
                <FormikInputWrapper
                  type="text"
                  name="title"
                  placeholder="Title"
                  formik={formik}
                />
              </Grid>
            </Grid>

            <Grid container spacing={1}>
              <Grid size={12}>
                <FormikInputWrapper
                  type="text"
                  name="description"
                  placeholder="Description"
                  formik={formik}
                />
              </Grid>
            </Grid>

            <Grid container spacing={1}>
              <Grid size={6}>
                <FormikInputWrapper
                  type="date"
                  name="date"
                  placeholder="Date"
                  formik={formik}
                />
              </Grid>

              <Grid size={6}>
                <FormikInputWrapper
                  type="time"
                  name="time"
                  placeholder="Time"
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

export default React.memo(EditHrActivityModal);
