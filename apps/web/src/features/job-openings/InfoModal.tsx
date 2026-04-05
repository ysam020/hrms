import React, { useContext, useEffect, useState } from "react";
import Modal from "@mui/material/Modal";
import Paper from "@mui/material/Paper";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Backdrop from "@mui/material/Backdrop";
import Fade from "@mui/material/Fade";
import Avatar from "@mui/material/Avatar";
import Chip from "@mui/material/Chip";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Alert from "@mui/material/Alert";
import { AlertContext } from "@web/app/providers/AlertContext";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import { useFormik } from "formik";
import { z } from "zod";
import { toFormikValidationSchema } from "zod-formik-adapter";
import apiClient from "@web/core/http/axiosConfig";
import Button from "@web/shared/components/Button";
import InfoIcon from "@mui/icons-material/Info";
import PersonIcon from "@mui/icons-material/Person";
import EmailIcon from "@mui/icons-material/Email";
import ScheduleIcon from "@mui/icons-material/Schedule";
import AssignmentIndIcon from "@mui/icons-material/AssignmentInd";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import UserAutoComplete from "@web/shared/components/UserAutoComplete";
import { Dropdown } from "primereact/dropdown";
import Grid from "@mui/material/Grid2";
import { API_ENDPOINTS } from "@web/shared/constants";

const validationSchema = toFormikValidationSchema(
  z.object({
    username: z
      .string()
      .min(3, "Name must be at least 3 characters")
      .max(50, "Name must be less than 50 characters"),
  }),
);

function InfoModal(props) {
  const { setAlert } = useContext(AlertContext);
  const { theme } = useContext(ThemeContext);
  const { name, email, aadharNo } = props.applicantData || {};
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [interviews, setInterviews] = useState(props.interviews || []);
  const [status, setStatus] = useState(props.status || "");
  const [statusInputs, setStatusInputs] = useState({});

  const statusOptions = ["Completed", "Cleared"];

  useEffect(() => {
    setInterviews(props.applicantData?.interviews || []);
    setStatus(props.applicantData?.status || "");
  }, [props.applicantData]);

  const formik = useFormik({
    initialValues: { username: "" },
    validationSchema,
    onSubmit: async (values, { resetForm }) => {
      try {
        const res = await apiClient.put(API_ENDPOINTS.REASSIGN_INTERVIEWER, {
          interviewer: values.username,
          jobTitle: props.jobTitle,
          name: name,
          aadharNo: aadharNo,
          interviewRound: editIndex! + 1,
          _id: props.applicantData._id,
        });

        setAlert({
          open: true,
          message: res.data.message,
          severity: "success",
        });

        setInterviews((prev) =>
          prev.map((interview, i) =>
            i === editIndex
              ? { ...interview, interviewer: values.username }
              : interview,
          ),
        );

        setEditIndex(null);
        resetForm();
        props.getJobApplications && props.getJobApplications();
      } catch (error) {
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

  const handleAssignClick = (index) => {
    setEditIndex(index);
  };

  const handleCancelClick = () => {
    setEditIndex(null);
    formik.resetForm();
  };

  const updateStatus = async (index) => {
    const selectedStatus = statusInputs[index];
    if (!selectedStatus) {
      setAlert({
        open: true,
        message: "Please select a status before updating.",
        severity: "warning",
      });
      return;
    }

    try {
      const res = await apiClient.put(API_ENDPOINTS.UPDATE_CANDIDATE_STATUS, {
        status: `Round ${index + 1} ${selectedStatus}`,
        jobTitle: props.jobTitle,
        name: name,
        aadharNo: aadharNo,
        interviewRound: index + 1,
        _id: props.applicantData._id,
      });

      setStatus(`Round ${index + 1} ${selectedStatus}`);
      setAlert({
        open: true,
        message: res.data.message,
        severity: "success",
      });

      props.getJobApplications && props.getJobApplications();
    } catch (error) {
      setAlert({
        open: true,
        message:
          error.message === "Network Error"
            ? "Network Error, your status will be submitted when you're back online"
            : error.response?.data?.message || "An error occurred",
        severity: "error",
      });
    }
  };

  // Helper function to check if a specific round should have status dropdown hidden
  const shouldHideStatusDropdown = (roundNumber) => {
    if (!status) return false;

    if (roundNumber === 1) {
      return (
        status === "Round 1 Cleared" ||
        status === "Round 2 Scheduled" ||
        status === "Round 2 Rescheduled" ||
        status === "Round 2 Completed" ||
        status === "Round 2 Cleared" ||
        status === "Hired" ||
        status === "Rejected"
      );
    } else if (roundNumber === 2) {
      return (
        status === "Applied" ||
        status === "Round 1 Scheduled" ||
        status === "Round 1 Rescheduled" ||
        status === "Round 1 Completed" ||
        status === "Round 2 Cleared" ||
        status === "Hired" ||
        status === "Rejected"
      );
    }

    return false;
  };

  const getStatusColor = (currentStatus) => {
    if (currentStatus?.includes("Cleared") || currentStatus?.includes("Hired"))
      return "success";
    if (currentStatus?.includes("Rejected")) return "error";
    if (currentStatus?.includes("Scheduled")) return "info";
    if (currentStatus?.includes("Completed")) return "warning";
    return "default";
  };

  const modalStyle = {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: { xs: "95%", sm: "90%", md: 1000, lg: 1200 },
    maxHeight: "95vh",
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
              p: 2,
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
              <Avatar
                sx={{
                  width: 40,
                  height: 40,
                  bgcolor: "info.main",
                  color: "white",
                }}
              >
                <InfoIcon fontSize="small" />
              </Avatar>
              <Box>
                <Typography
                  variant="h6"
                  fontWeight={600}
                  sx={{ fontSize: "1.1rem" }}
                >
                  Candidate Details
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {props.jobTitle}
                </Typography>
              </Box>
            </Box>
          </Box>

          {/* Candidate Information */}
          <Box sx={{ p: 2 }}>
            <Typography
              variant="subtitle2"
              color="text.secondary"
              gutterBottom
              sx={{ mb: 2 }}
            >
              Personal Information
            </Typography>
            <Grid container spacing={1} sx={{ mb: 2 }}>
              <Grid size={{ xs: 12, sm: 4 }}>
                <Chip
                  icon={<PersonIcon />}
                  label={`Name: ${name || "N/A"}`}
                  variant="outlined"
                  sx={{ width: "100%", justifyContent: "flex-start" }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <Chip
                  icon={<EmailIcon />}
                  label={`Email: ${email || "N/A"}`}
                  variant="outlined"
                  sx={{ width: "100%", justifyContent: "flex-start" }}
                />
              </Grid>
            </Grid>

            {/* Current Status */}
            <Box sx={{ mb: 1 }}>
              <Typography
                variant="subtitle2"
                color="text.secondary"
                gutterBottom
              >
                Current Status
              </Typography>
              <Chip
                label={status || "No Status"}
                color={getStatusColor(status)}
                variant="filled"
                sx={{ fontWeight: 500 }}
              />
            </Box>
          </Box>

          {/* Interview Details */}
          <Box sx={{ p: 2 }}>
            <Typography
              variant="subtitle2"
              color="text.secondary"
              gutterBottom
              sx={{ mb: 2 }}
            >
              Interview Rounds
            </Typography>

            {interviews?.length > 0 ? (
              <Grid container spacing={1}>
                {interviews.map((interview, index) => (
                  <Grid size={{ xs: 12, lg: 6 }} key={index}>
                    <Card
                      variant="outlined"
                      sx={{
                        borderRadius: 2,
                        border:
                          theme === "light"
                            ? "1px solid #e5e7eb"
                            : "1px solid #374151",
                      }}
                    >
                      <CardContent sx={{ p: 2 }}>
                        {/* Round Header */}
                        <Box
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 1,
                            mb: 2,
                          }}
                        >
                          <Avatar
                            sx={{
                              width: 32,
                              height: 32,
                              bgcolor: "primary.main",
                              fontSize: "0.875rem",
                            }}
                          >
                            {index + 1}
                          </Avatar>
                          <Typography variant="subtitle1" fontWeight={600}>
                            Round {index + 1} Interview
                          </Typography>
                        </Box>

                        {/* Interview Info */}
                        <Stack spacing={1.5}>
                          {/* Date & Time */}
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 1,
                            }}
                          >
                            <ScheduleIcon
                              sx={{ fontSize: 16, color: "text.secondary" }}
                            />
                            <Typography variant="body2" color="text.secondary">
                              {interview.interviewDate
                                ? `${interview.interviewDate}, ${interview.interviewStartTime} - ${interview.interviewEndTime}`
                                : "Not scheduled"}
                            </Typography>
                          </Box>

                          {/* Interviewer */}
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 1,
                            }}
                          >
                            <AssignmentIndIcon
                              sx={{ fontSize: 16, color: "text.secondary" }}
                            />
                            <Typography variant="body2" color="text.secondary">
                              Interviewer:{" "}
                              {interview.interviewer || "Not assigned"}
                            </Typography>
                            {!interview.interviewConducted &&
                              editIndex !== index && (
                                <Button
                                  onClick={() => handleAssignClick(index)}
                                  style={{ marginTop: 0 }}
                                >
                                  Reassign
                                </Button>
                              )}
                          </Box>

                          {/* Reassign Form */}
                          {editIndex === index && (
                            <Box
                              sx={{
                                p: 2,
                                bgcolor: "action.hover",
                                borderRadius: 1,
                              }}
                            >
                              <Typography
                                variant="body2"
                                fontWeight={500}
                                gutterBottom
                              >
                                Reassign Interviewer
                              </Typography>
                              <form onSubmit={formik.handleSubmit}>
                                <Stack spacing={1}>
                                  <UserAutoComplete
                                    formik={formik}
                                    placeholder="Select new interviewer"
                                  />
                                  <Stack direction="row" spacing={1}>
                                    <Button
                                      type="submit"
                                      disabled={formik.isSubmitting}
                                    >
                                      Assign
                                    </Button>
                                    <Button
                                      variant="outlined"
                                      size="small"
                                      onClick={handleCancelClick}
                                    >
                                      Cancel
                                    </Button>
                                  </Stack>
                                </Stack>
                              </form>
                            </Box>
                          )}

                          {/* Interview Status */}
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 1,
                            }}
                          >
                            {interview.interviewConducted ? (
                              <CheckCircleIcon
                                sx={{ fontSize: 16, color: "success.main" }}
                              />
                            ) : (
                              <CancelIcon
                                sx={{ fontSize: 16, color: "error.main" }}
                              />
                            )}
                            <Typography variant="body2" color="text.secondary">
                              Interview Conducted:{" "}
                              {interview.interviewConducted ? "Yes" : "No"}
                            </Typography>
                          </Box>

                          {/* Status Update */}
                          {!shouldHideStatusDropdown(index + 1) && (
                            <Box
                              sx={{
                                mt: 2,
                                p: 2,
                                bgcolor: "action.hover",
                                borderRadius: 1,
                              }}
                            >
                              <Typography
                                variant="h6"
                                fontWeight={500}
                                gutterBottom
                              >
                                Update Status
                              </Typography>
                              <Stack spacing={1}>
                                <Dropdown
                                  value={statusInputs[index] || ""}
                                  options={statusOptions}
                                  placeholder="Select interview status"
                                  style={{ width: "100%" }}
                                  appendTo="self"
                                  onChange={(e) =>
                                    setStatusInputs((prev) => ({
                                      ...prev,
                                      [index]: e.value,
                                    }))
                                  }
                                />
                                <Button
                                  onClick={() => updateStatus(index)}
                                  disabled={!statusInputs[index]}
                                >
                                  Update Status
                                </Button>
                              </Stack>
                            </Box>
                          )}
                        </Stack>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            ) : (
              <Alert severity="info" sx={{ borderRadius: 2 }}>
                <Typography variant="body2">
                  No interviews scheduled for this candidate yet.
                </Typography>
              </Alert>
            )}
          </Box>
        </Paper>
      </Fade>
    </Modal>
  );
}

export default React.memo(InfoModal);
