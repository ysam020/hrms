import React, { useContext } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Avatar from "@mui/material/Avatar";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import { AlertContext } from "@web/app/providers/AlertContext";
import { useFormik } from "formik";
import apiClient from "@web/core/http/axiosConfig";
import { rejectApplicationValidationSchema as validationSchema } from "./schemas";
import FormikInputWrapper from "@web/shared/components/InputWrapper";
import Button from "@web/shared/components/Button";
import CancelIcon from "@mui/icons-material/Cancel";
import PersonIcon from "@mui/icons-material/Person";
import EmailIcon from "@mui/icons-material/Email";
import CustomModal from "@web/shared/components/Modal";
import { API_ENDPOINTS } from "@web/shared/constants";

function RejectModal(props) {
  const { setAlert } = useContext(AlertContext);
  const { name, aadharNo, email } = props.applicantData || {};

  const formik = useFormik({
    initialValues: {
      reason: "",
    },
    validationSchema,
    onSubmit: async (values) => {
      const data = {
        ...values,
        name,
        aadharNo,
        jobTitle: props.jobTitle,
        _id: props.applicantData._id,
        jobId: props._id,
      };

      try {
        const res = await apiClient.put(API_ENDPOINTS.REJECT_CANDIDATE, data);
        setAlert({
          open: true,
          message: res.data.message,
          severity: "success",
        });
        props.getJobApplications && props.getJobApplications();
        props.handleClose();
      } catch (err) {
        setAlert({
          open: true,
          message:
            err.message === "Network Error"
              ? "Network Error, your details will be submitted when you are back online"
              : err.response?.data?.message || "An error occurred",
          severity: "error",
        });
      }
    },
  });

  const modalStyle = {
    width: { xs: "90%", sm: 500 },
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
          <Avatar
            sx={{
              width: 40,
              height: 40,
              bgcolor: "error.main",
              color: "white",
            }}
          >
            <CancelIcon fontSize="small" />
          </Avatar>
          <Box>
            <Typography
              variant="h6"
              fontWeight={600}
              sx={{ fontSize: "1.1rem" }}
            >
              Reject Application
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {props.jobTitle}
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* Candidate Info */}
      <Box sx={{ p: 2.5, pb: 1.5 }}>
        <Typography variant="h6" color="text.secondary" gutterBottom>
          Candidate Information
        </Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Chip
            icon={<PersonIcon />}
            label={name || "N/A"}
            variant="outlined"
            size="small"
          />
          <Chip
            icon={<EmailIcon />}
            label={email || "N/A"}
            variant="outlined"
            size="small"
          />
        </Stack>
      </Box>

      {/* Warning Alert */}
      <Box sx={{ p: 2.5, pb: 0 }}>
        <Alert severity="warning" sx={{ borderRadius: 2 }}>
          <Typography variant="body2">
            This action cannot be undone. The candidate will be notified of the
            rejection.
          </Typography>
        </Alert>
      </Box>

      {/* Form */}
      <Box sx={{ p: 2.5, pt: 0 }}>
        <form onSubmit={formik.handleSubmit}>
          <Stack spacing={2.5}>
            <FormikInputWrapper
              type="text"
              name="reason"
              placeholder="Reason for rejection"
              formik={formik}
            />

            <Button type="submit" disabled={formik.isSubmitting}>
              Reject Application
            </Button>
          </Stack>
        </form>
      </Box>
    </CustomModal>
  );
}

export default React.memo(RejectModal);
