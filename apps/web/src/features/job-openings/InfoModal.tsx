import { memo, useContext, useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Avatar from "@mui/material/Avatar";
import Chip from "@mui/material/Chip";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Alert from "@mui/material/Alert";
import { AlertContext } from "@web/app/providers/AlertContext";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import { UserContext } from "@web/app/providers/UserContext";
import hasPermission from "@web/shared/utils/permissions/hasPermission";
import CustomModal from "@web/shared/components/Modal";
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
import { Calendar } from "primereact/calendar";
import Grid from "@mui/material/Grid2";
import TextField from "@mui/material/TextField";
import { API_ENDPOINTS } from "@web/shared/constants";
import useFetchData from "@web/shared/hooks/useFetchData";
import dayjs from "dayjs";

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
  const { user } = useContext(UserContext);
  const canReassign = hasPermission(
    "JobOpenings",
    "reassign_interviewer",
    "-",
    user?.isSuperUser,
    user?.permissions || [],
  );
  const canReschedule = hasPermission(
    "JobOpenings",
    "schedule_interview",
    "-",
    user?.isSuperUser,
    user?.permissions || [],
  );
  const canUpdateStatus = hasPermission(
    "JobOpenings",
    "update_candidate_status",
    "-",
    user?.isSuperUser,
    user?.permissions || [],
  );
  const { name, email, aadharNo } = props.applicantData || {};
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [rescheduleIndex, setRescheduleIndex] = useState<number | null>(null);
  const [rescheduleDateTime, setRescheduleDateTime] = useState<Date | null>(
    null,
  );
  const [rescheduling, setRescheduling] = useState(false);
  const [interviews, setInterviews] = useState(props.interviews || []);
  const [status, setStatus] = useState(props.status || "");
  const [statusInputs, setStatusInputs] = useState({});
  const [feedbackInputs, setFeedbackInputs] = useState({});

  // A round can only move Scheduled → Completed → Cleared — once it's been
  // conducted, re-marking it Completed is a no-op that would silently skip
  // the actual interview, so Cleared is the only forward move left.
  const getStatusOptions = (interview) =>
    interview?.interviewConducted ? ["Cleared"] : ["Completed"];

  // Hired/Rejected are terminal — reassigning an interviewer or
  // rescheduling a round has no valid next step once the candidate is
  // already decided. Mirrors the server-side guards in
  // updateApplicationStatus.ts / scheduleInterview / rescheduleInterview.
  const isTerminalStatus = status === "Hired" || status === "Rejected";

  // Only users with the JobOpenings:take_interview permission (or
  // superusers) show up as candidates for "Reassign Interviewer". An empty
  // userList makes UserAutoComplete fall back to an unrestricted
  // server-side search across all users, so this list must only ever be
  // passed once it has actually loaded — see the loading guard below.
  const { data: interviewersData, loading: interviewersLoading } = useFetchData<
    any[]
  >(API_ENDPOINTS.GET_INTERVIEWER_LIST, "get", [], null, null);
  const interviewerUsernames = (interviewersData || [])
    .map((u: any) => u.username)
    .filter(Boolean);

  useEffect(() => {
    setInterviews(props.applicantData?.interviews || []);
    setStatus(props.applicantData?.status || "");
  }, [props.applicantData]);

  const formik = useFormik({
    initialValues: { username: "" },
    validationSchema,
    onSubmit: async (values, { resetForm }) => {
      try {
        // Address by the interview's own roundNumber, not its array
        // position — a reschedule can leave rounds out of simple sequence
        // with the array index.
        const editingRoundNumber =
          interviews[editIndex!]?.roundNumber ?? editIndex! + 1;
        const res = await apiClient.put(API_ENDPOINTS.REASSIGN_INTERVIEWER, {
          interviewer: values.username,
          jobTitle: props.jobTitle,
          name: name,
          aadharNo: aadharNo,
          interviewRound: editingRoundNumber,
          _id: props.applicantData.id,
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
    setRescheduleIndex(null);
  };

  const handleCancelClick = () => {
    setEditIndex(null);
    formik.resetForm();
  };

  const handleRescheduleClick = (index) => {
    setRescheduleIndex(index);
    setRescheduleDateTime(null);
    setEditIndex(null);
  };

  const handleRescheduleCancel = () => {
    setRescheduleIndex(null);
    setRescheduleDateTime(null);
  };

  const handleRescheduleSubmit = async (index) => {
    if (!rescheduleDateTime) {
      setAlert({
        open: true,
        message: "Please select a new date and time.",
        severity: "warning",
      });
      return;
    }

    // Address by the interview's own roundNumber, not its array position.
    const roundNumber = interviews[index]?.roundNumber ?? index + 1;
    const startDate = rescheduleDateTime;
    const endDate = new Date(startDate.getTime() + 1 * 60 * 60000);
    const formatDate = (date: Date) => dayjs(date).format("YYYYMMDDTHHmmss");

    setRescheduling(true);
    try {
      const res = await apiClient.put(API_ENDPOINTS.RESCHEDULE_INTERVIEW, {
        interviewer: interviews[index]?.interviewer || "",
        interviewStartTime: formatDate(startDate),
        interviewEndTime: formatDate(endDate),
        roundNumber,
        _id: props.applicantData.id,
      });

      setAlert({
        open: true,
        message: res.data.message,
        severity: "success",
      });

      setInterviews((prev) =>
        prev.map((interview, i) =>
          i === index
            ? {
                ...interview,
                interviewStartTime: formatDate(startDate),
                interviewEndTime: formatDate(endDate),
                interviewConducted: false,
              }
            : interview,
        ),
      );

      setRescheduleIndex(null);
      setRescheduleDateTime(null);
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
    } finally {
      setRescheduling(false);
    }
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

    // Feedback is only collected when Completing a round — Clearing is a
    // pure follow-up decision on an already-conducted round and reuses the
    // feedback captured at Completion time rather than asking again.
    const isCompleting = selectedStatus === "Completed";
    const feedback = (feedbackInputs[index] || "").trim();
    if (isCompleting && !feedback) {
      setAlert({
        open: true,
        message: "Please provide interview feedback before updating.",
        severity: "warning",
      });
      return;
    }

    // Address by the interview's own roundNumber, not its array position.
    const roundNumber = interviews[index]?.roundNumber ?? index + 1;

    try {
      const res = await apiClient.put(API_ENDPOINTS.UPDATE_CANDIDATE_STATUS, {
        status: `Round ${roundNumber} ${selectedStatus}`,
        jobTitle: props.jobTitle,
        name: name,
        aadharNo: aadharNo,
        interviewRound: roundNumber,
        ...(isCompleting && { feedback }),
        id: props.applicantData.id,
      });

      setStatus(`Round ${roundNumber} ${selectedStatus}`);
      if (isCompleting) {
        setInterviews((prev) =>
          prev.map((interview, i) =>
            i === index
              ? { ...interview, feedback, interviewConducted: true }
              : interview,
          ),
        );
      }
      setStatusInputs((prev) => ({ ...prev, [index]: "" }));
      setFeedbackInputs((prev) => ({ ...prev, [index]: "" }));
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

  // A round can't be marked Completed/Cleared before its scheduled
  // interview time has actually passed.
  const interviewHasEnded = (interview) => {
    if (!interview?.interviewEndTime) return false;
    return dayjs(interview.interviewEndTime, "YYYYMMDDTHHmmss").isBefore(
      dayjs(),
    );
  };

  // Hides the Update Status control (and the "not yet ended" alert) for a
  // round once there's nothing left to do with it: a later round has
  // already been reached (prevRoundCleared guarantees this round was
  // Cleared to get there), this exact round has been formally Cleared, or
  // the application has reached a terminal state. "Completed" is an
  // intentional intermediate step — a round can be marked Completed first
  // (interview happened, feedback given) and Cleared later, so the control
  // stays visible until Cleared specifically.
  const shouldHideStatusDropdown = (roundNumber) => {
    if (!status) return false;
    if (status === "Hired" || status === "Rejected") return true;

    const match = status.match(/^Round (\d+) (.+)$/);
    if (!match) return false;
    const statusRound = parseInt(match[1], 10);
    const outcome = match[2];

    if (roundNumber < statusRound) return true;
    if (roundNumber === statusRound) return outcome === "Cleared";
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
    width: { xs: "95%", sm: "90%", md: 1000, lg: 1200 },
    maxHeight: "95vh",
  };

  return (
    <CustomModal
      open={props.open}
      handleClose={props.handleClose}
      modalStyle={modalStyle}
      theme={theme}
      disablePortal
    >
      <Box>
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
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
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
              {interviews.map((interview, index) => {
                const roundNumber = interview.roundNumber ?? index + 1;
                return (
                  <Grid size={{ xs: 12, lg: 6 }} key={roundNumber}>
                    <Card
                      variant="outlined"
                      sx={{
                        overflow: "visible",
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
                            {roundNumber}
                          </Avatar>
                          <Typography variant="subtitle1" fontWeight={600}>
                            Round {roundNumber} Interview
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
                              {/* Derive the date from interviewStartTime, not
                                the separate interviewDate field — two
                                fields for the same moment can drift out of
                                sync (as happened here), while this is the
                                same field the "not yet ended" alert below
                                already keys off of. */}
                              {interview.interviewStartTime
                                ? `${dayjs(interview.interviewStartTime, "YYYYMMDDTHHmmss").format("DD MMM YYYY")}, ${dayjs(interview.interviewStartTime, "YYYYMMDDTHHmmss").format("HH:mm")} – ${dayjs(interview.interviewEndTime, "YYYYMMDDTHHmmss").format("HH:mm")}`
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
                              !isTerminalStatus &&
                              editIndex !== index &&
                              rescheduleIndex !== index &&
                              (canReassign || canReschedule) && (
                                <Stack direction="row" spacing={1}>
                                  {canReassign && (
                                    <Button
                                      onClick={() => handleAssignClick(index)}
                                      style={{ marginTop: 0 }}
                                    >
                                      Reassign
                                    </Button>
                                  )}
                                  {canReschedule && (
                                    <Button
                                      variant="outlined"
                                      onClick={() =>
                                        handleRescheduleClick(index)
                                      }
                                      style={{ marginTop: 0 }}
                                    >
                                      Reschedule
                                    </Button>
                                  )}
                                </Stack>
                              )}
                          </Box>

                          {/* Reschedule Form */}
                          {rescheduleIndex === index && (
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
                                Reschedule Interview
                              </Typography>
                              <Stack spacing={1}>
                                <Calendar
                                  value={rescheduleDateTime}
                                  onChange={(e) =>
                                    setRescheduleDateTime(e.value as Date)
                                  }
                                  showTime
                                  hourFormat="24"
                                  dateFormat="dd/mm/yy"
                                  appendTo={() =>
                                    document.querySelector(
                                      "#root .App",
                                    ) as HTMLElement
                                  }
                                  minDate={new Date()}
                                  disabledDays={[0]}
                                  showButtonBar
                                  stepMinute={15}
                                  style={{ width: "100%" }}
                                  placeholder="Select new date and time"
                                />
                                <Stack direction="row" spacing={1}>
                                  <Button
                                    onClick={() =>
                                      handleRescheduleSubmit(index)
                                    }
                                    disabled={rescheduling}
                                  >
                                    Confirm
                                  </Button>
                                  <Button
                                    variant="outlined"
                                    size="small"
                                    onClick={handleRescheduleCancel}
                                  >
                                    Cancel
                                  </Button>
                                </Stack>
                              </Stack>
                            </Box>
                          )}

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
                                  {interviewersLoading ? (
                                    <Typography
                                      variant="caption"
                                      color="text.secondary"
                                    >
                                      Loading eligible interviewers…
                                    </Typography>
                                  ) : interviewerUsernames.length === 0 ? (
                                    <Alert severity="warning">
                                      No users currently have interview-taking
                                      permission.
                                    </Alert>
                                  ) : (
                                    <UserAutoComplete
                                      formik={formik}
                                      userList={interviewerUsernames}
                                      placeholder="Select new interviewer"
                                    />
                                  )}
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

                          {interview.feedback && (
                            <Box
                              sx={{
                                p: 1.5,
                                bgcolor: "action.hover",
                                borderRadius: 1,
                              }}
                            >
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                fontWeight={600}
                                display="block"
                              >
                                Feedback
                              </Typography>
                              <Typography variant="body2">
                                {interview.feedback}
                              </Typography>
                            </Box>
                          )}

                          {/* Status Update */}
                          {!shouldHideStatusDropdown(roundNumber) &&
                            canUpdateStatus &&
                            (interviewHasEnded(interview) ? (
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
                                    options={getStatusOptions(interview)}
                                    placeholder="Select interview status"
                                    style={{ width: "100%" }}
                                    // appendTo="self" gets clipped by the
                                    // modal Paper's overflow:auto — same fix
                                    // as the reschedule Calendar above.
                                    appendTo={() =>
                                      document.querySelector(
                                        "#root .App",
                                      ) as HTMLElement
                                    }
                                    onChange={(e) =>
                                      setStatusInputs((prev) => ({
                                        ...prev,
                                        [index]: e.value,
                                      }))
                                    }
                                  />
                                  {!interview.interviewConducted && (
                                    <TextField
                                      value={feedbackInputs[index] || ""}
                                      onChange={(e) =>
                                        setFeedbackInputs((prev) => ({
                                          ...prev,
                                          [index]: e.target.value,
                                        }))
                                      }
                                      placeholder="Interview feedback (required)"
                                      multiline
                                      minRows={2}
                                      size="small"
                                      fullWidth
                                    />
                                  )}
                                  <Button
                                    onClick={() => updateStatus(index)}
                                    disabled={
                                      !statusInputs[index] ||
                                      (!interview.interviewConducted &&
                                        !(feedbackInputs[index] || "").trim())
                                    }
                                  >
                                    Update Status
                                  </Button>
                                </Stack>
                              </Box>
                            ) : (
                              <Alert severity="info" sx={{ mt: 2 }}>
                                <Typography variant="body2">
                                  This round can be marked Completed/Cleared
                                  after the scheduled interview ends
                                  {interview.interviewEndTime
                                    ? ` (${dayjs(interview.interviewEndTime, "YYYYMMDDTHHmmss").format("DD MMM YYYY, HH:mm")})`
                                    : ""}
                                  .
                                </Typography>
                              </Alert>
                            ))}
                        </Stack>
                      </CardContent>
                    </Card>
                  </Grid>
                );
              })}
            </Grid>
          ) : (
            <Alert severity="info" sx={{ borderRadius: 2 }}>
              <Typography variant="body2">
                No interviews scheduled for this candidate yet.
              </Typography>
            </Alert>
          )}
        </Box>
      </Box>
    </CustomModal>
  );
}

export default memo(InfoModal);
