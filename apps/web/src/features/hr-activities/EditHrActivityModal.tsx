import React, { useContext, useEffect } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Divider from "@mui/material/Divider";
import { AlertContext } from "@web/app/providers/AlertContext";
import { useFormik } from "formik";
import Button from "@web/shared/components/Button";
import apiClient from "@web/core/http/axiosConfig";
import { validationSchema } from "./schemas";
import Grid from "@mui/material/Grid2";
import FormikInputWrapper from "@web/shared/components/InputWrapper";
import EditIcon from "@mui/icons-material/Edit";
import CustomModal from "@web/shared/components/Modal";
import { API_ENDPOINTS } from "@web/shared/constants";

function EditHrActivityModal(props) {
  const { setAlert } = useContext(AlertContext);
  const { id: _id, title, description, date, time } = props.activityData || {};

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
        const res = await apiClient.put(
          API_ENDPOINTS.EDIT_HR_ACTIVITY(_id),
          values,
        );
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
  }, [title, description, date, time]);

  const modalStyle = {
    width: { xs: "90%", sm: 480 },
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
          p: 2,
          pb: 1,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Box
            sx={{
              p: 0.75,
              bgcolor: "primary.main",
              color: "primary.contrastText",
              borderRadius: 1.5,
              display: "flex",
            }}
          >
            <EditIcon fontSize="small" />
          </Box>
          <Typography variant="h6" fontWeight={600} sx={{ fontSize: "1.1rem" }}>
            Edit HR Activity
          </Typography>
        </Box>
      </Box>

      <Divider />

      {/* Form */}
      <Box sx={{ p: 2 }}>
        <form onSubmit={formik.handleSubmit}>
          <Stack spacing={2}>
            <FormikInputWrapper
              type="text"
              name="title"
              placeholder="Activity Title"
              formik={formik}
            />

            <FormikInputWrapper
              type="text"
              name="description"
              placeholder="Description"
              formik={formik}
            />

            <Grid container spacing={1.5}>
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

            <Button type="submit" disabled={formik.isSubmitting}>
              Update Activity
            </Button>
          </Stack>
        </form>
      </Box>
    </CustomModal>
  );
}

export default React.memo(EditHrActivityModal);
