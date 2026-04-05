import React, { useContext } from "react";
import Modal from "@mui/material/Modal";
import Paper from "@mui/material/Paper";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Backdrop from "@mui/material/Backdrop";
import Fade from "@mui/material/Fade";
import Avatar from "@mui/material/Avatar";
import Chip from "@mui/material/Chip";
import { AlertContext } from "@web/app/providers/AlertContext";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import { useFormik } from "formik";
import apiClient from "@web/core/http/axiosConfig";
import { hiringValidationSchema as validationSchema } from "./schemas";
import FormikInputWrapper from "@web/shared/components/InputWrapper";
import Button from "@web/shared/components/Button";
import CloseIcon from "@mui/icons-material/Close";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import PersonIcon from "@mui/icons-material/Person";
import EmailIcon from "@mui/icons-material/Email";
import { useParams } from "react-router-dom";
import { API_ENDPOINTS } from "@web/shared/constants";

function HiringModal(props) {
  const { setAlert } = useContext(AlertContext);
  const { theme } = useContext(ThemeContext);
  const { name, email, aadharNo } = props.applicantData || {};
  const { _id } = useParams();

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
        aadharNo,
        jobTitle: props.jobTitle,
        email,
        name,
        _id: props.applicantData._id,
      };

      try {
        const res = await apiClient.put(API_ENDPOINTS.HIRE_CANDIDATE, {
          ...data,
          jobId: _id,
        });
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
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: { xs: "90%", sm: 520 },
    maxHeight: "90vh",
    overflow: "auto",
    outline: 0,
  };

  return (
    <Modal
      open={props.open}
      onClose={props.handleClose}
      closeAfterTransition
      disablePortal
      BackdropComponent={Backdrop}
      BackdropProps={{
        timeout: 200,
        sx: {
          backgroundColor: "rgba(0, 0, 0, 0.4)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
        },
      }}
    >
      <Fade in={props.open} timeout={200}>
        <Paper
          elevation={8}
          sx={{
            ...modalStyle,
            borderRadius: 3,
            backgroundColor: "background.paper",
            border:
              theme === "light" ? "1px solid #e5e7eb" : "1px solid #374151",
          }}
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
                  bgcolor: "success.main",
                  color: "white",
                }}
              >
                <CheckCircleIcon fontSize="small" />
              </Avatar>
              <Box>
                <Typography
                  variant="h6"
                  fontWeight={600}
                  sx={{ fontSize: "1.1rem" }}
                >
                  Hire Candidate
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {props.jobTitle}
                </Typography>
              </Box>
            </Box>
            <IconButton
              onClick={props.handleClose}
              size="small"
              sx={{ color: "text.secondary" }}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>

          {/* Candidate Info */}
          <Box sx={{ p: 2.5, pb: 1.5 }}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
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

          {/* Form */}
          <Box sx={{ p: 2.5 }}>
            <form onSubmit={formik.handleSubmit}>
              <Stack spacing={1}>
                <FormikInputWrapper
                  type="text"
                  name="salary"
                  placeholder="Annual Salary (₹)"
                  formik={formik}
                  inputProps={{
                    keyfilter: "int",
                    minLength: 4,
                    maxLength: 10,
                  }}
                />

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

                <FormikInputWrapper
                  type="text"
                  name="reference_by"
                  placeholder="Reference By (Optional)"
                  formik={formik}
                />

                <Button type="submit" disabled={formik.isSubmitting}>
                  Hire Candidate
                </Button>
              </Stack>
            </form>
          </Box>
        </Paper>
      </Fade>
    </Modal>
  );
}

export default React.memo(HiringModal);
