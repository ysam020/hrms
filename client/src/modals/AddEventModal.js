import * as React from "react";
import Box from "@mui/material/Box";
import Modal from "@mui/material/Modal";
import { style } from "../utils/modalStyle";
import CustomButton from "../components/customComponents/CustomButton";
import { useFormik } from "formik";
import { validationSchema } from "../schemas/addEventSchema";
import apiClient from "../config/axiosConfig";
import { AlertContext } from "../contexts/AlertContext";
import FormikInputWrapper from "../components/customComponents/InputWrapper";
import Grid from "@mui/material/Grid2";

function AddEventModal(props) {
  const { setAlert } = React.useContext(AlertContext);
  const formik = useFormik({
    initialValues: {
      title: "",
      date: "",
      startTime: "",
      endTime: "",
      description: "",
    },
    validationSchema,
    onSubmit: async (values, { resetForm }) => {
      try {
        await apiClient.post(`/add-event`, values);
        resetForm();
        props.handleClose();
        props.getEvents();
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
    <Modal
      open={props.open}
      onClose={props.handleClose}
      aria-labelledby="modal-modal-title"
      aria-describedby="modal-modal-description"
      disableEscapeKeyDown
      disablePortal
    >
      <Box sx={style}>
        <form onSubmit={formik.handleSubmit}>
          <h5>Add New Event</h5>
          <Grid container spacing={1}>
            <Grid size={12}>
              <FormikInputWrapper
                type="text"
                name="title"
                placeholder="Title"
                formik={formik}
              />
            </Grid>
            <Grid size={12}>
              <FormikInputWrapper
                type="date"
                name="date"
                placeholder="Date"
                formik={formik}
                inputProps={{
                  minDate: new Date(),
                  dateFormat: "dd/mm/yy",
                  showIcon: true,
                  showButtonBar: true,
                }}
              />
            </Grid>
            <Grid size={12}>
              <FormikInputWrapper
                type="time"
                name="startTime"
                placeholder="Start Time"
                formik={formik}
                inputProps={{
                  hourFormat: "12",
                }}
              />
            </Grid>
            <Grid size={12}>
              <FormikInputWrapper
                type="time"
                name="endTime"
                placeholder="End Time"
                formik={formik}
                inputProps={{
                  hourFormat: "12",
                }}
              />
            </Grid>
            <Grid size={12}>
              <FormikInputWrapper
                type="text"
                name="description"
                placeholder="Description"
                formik={formik}
              />
            </Grid>
          </Grid>
          <CustomButton name="Submit" isSubmitting={formik.isSubmitting} />
        </form>
      </Box>
    </Modal>
  );
}

export default React.memo(AddEventModal);
