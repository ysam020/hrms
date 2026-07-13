import { memo, useContext } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Avatar from "@mui/material/Avatar";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import dayjs from "dayjs";
import { useFormik } from "formik";
import { z } from "zod";
import { toFormikValidationSchema } from "zod-formik-adapter";
import { AlertContext } from "@web/app/providers/AlertContext";
import apiClient from "@web/core/http/axiosConfig";
import Button from "@web/shared/components/Button";
import CustomModal from "@web/shared/components/Modal";
import ScheduleIcon from "@mui/icons-material/Schedule";
import PersonIcon from "@mui/icons-material/Person";
import EmailIcon from "@mui/icons-material/Email";
import CalendarTodayIcon from "@mui/icons-material/CalendarToday";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import UserAutoComplete from "@web/shared/components/UserAutoComplete";
import { Calendar } from "primereact/calendar";
import { API_ENDPOINTS } from "@web/shared/constants";
import useFetchData from "@web/shared/hooks/useFetchData";

// This modal only ever schedules the NEXT new round. Rescheduling an
// existing (not-yet-conducted) round is a per-round action in InfoModal,
// next to Reassign — folding both into one dual-mode modal here made it
// impossible to tell "which round" a reschedule should target once more
// than one round existed, which corrupted already-conducted rounds and
// blocked legitimate reschedules behind the "previous round cleared" gate.
function ScheduleInterviewModal({
  open,
  handleClose,
  getJobApplications,
  applicantData,
  _id,
}) {
  const { setAlert } = useContext(AlertContext);
  const { name, email, status } = applicantData || {};

  const { data: orgSettings } = useFetchData(
    API_ENDPOINTS.GET_ORG_SETTINGS,
    "get",
    [],
    null,
    null,
  );
  const maxInterviewRounds = orgSettings?.active?.maxInterviewRounds ?? 5;

  // Only users with the JobOpenings:take_interview permission (or
  // superusers) show up as candidates for "Select Interviewer". An empty
  // userList makes UserAutoComplete fall back to an unrestricted
  // server-side search across all users, so this list must only ever be
  // passed once it has actually loaded — see the loading guard below.
  const { data: interviewersData, loading: interviewersLoading } = useFetchData<
    any[]
  >(API_ENDPOINTS.GET_INTERVIEWER_LIST, "get", [], null, null);
  const interviewerUsernames = (interviewersData || [])
    .map((u: any) => u.username)
    .filter(Boolean);

  // Rounds are addressed by roundNumber, not array position — interviews
  // are upserted in place (see api-gateway's upsertInterviewRound), so
  // interviews.length always equals the number of distinct rounds so far.
  const interviews = applicantData?.interviews || [];
  const interviewsCount = interviews.length;
  const roundNumber = interviewsCount + 1;
  const previousRound = interviews[interviewsCount - 1];

  // A new round (N>1) can only be scheduled after round N-1 is cleared.
  const prevRoundCleared =
    roundNumber <= 1 || status === `Round ${roundNumber - 1} Cleared`;
  const roundLimitReached = roundNumber > maxInterviewRounds;
  // Hired/Rejected are terminal — mirrors the server-side guard in
  // scheduleInterview.ts. The row action that opens this modal is already
  // hidden once terminal, so this only fires against stale props.
  const isTerminal = status === "Hired" || status === "Rejected";

  // Must start strictly after the previous round's interview ends, not
  // just "now" — e.g. Round 1 at 3–4 PM today means Round 2 can't be
  // scheduled for earlier today even though "now" already allows it.
  const previousRoundEnd =
    previousRound?.interviewEndTime &&
    dayjs(previousRound.interviewEndTime, "YYYYMMDDTHHmmss").toDate();
  const minScheduleDate =
    previousRoundEnd && previousRoundEnd > new Date()
      ? previousRoundEnd
      : new Date();

  const validationSchema = toFormikValidationSchema(
    z.object({
      username: z.string().min(1, "Please select an interviewer"),
      dateTime: z.date({
        required_error: "Please select date and time",
        invalid_type_error: "Please select date and time",
      }),
    }),
  );

  const formik = useFormik({
    initialValues: {
      username: "",
      dateTime: null,
    },
    validationSchema,
    onSubmit: async (values) => {
      const startDate = values.dateTime as unknown as Date;
      const endDate = new Date(startDate.getTime() + 1 * 60 * 60000); // 1 hour duration
      const formatDate = (date) => dayjs(date).format("YYYYMMDDTHHmmss");

      try {
        const res = await apiClient.put(API_ENDPOINTS.SCHEDULE_INTERVIEW, {
          email,
          name,
          interviewer: values.username,
          interviewStartTime: formatDate(startDate),
          interviewEndTime: formatDate(endDate),
          roundNumber,
          _id: applicantData.id,
        });

        handleClose();
        getJobApplications && getJobApplications();
        formik.resetForm();
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
              : err.response?.data?.message ||
                "Error submitting interview details",
          severity: "error",
        });
      }
    },
  });

  const modalStyle = {
    width: { xs: "90%", sm: 600 },
  };

  return (
    <CustomModal
      open={open}
      handleClose={handleClose}
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
              bgcolor: "info.main",
              color: "white",
            }}
          >
            <ScheduleIcon fontSize="small" />
          </Avatar>
          <Box>
            <Typography
              variant="h6"
              fontWeight={600}
              sx={{ fontSize: "1.1rem" }}
            >
              Schedule Interview
            </Typography>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <Typography variant="caption" color="text.secondary">
                Round {roundNumber} Interview
              </Typography>
            </Box>
          </Box>
        </Box>
      </Box>

      {/* Candidate Information */}
      <Box sx={{ p: 1.5, pb: 0 }}>
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

      {/* Block scheduling past the tenant's configured round limit */}
      {isTerminal ? (
        <Box sx={{ p: 2 }}>
          <Alert severity="warning" sx={{ borderRadius: 2 }}>
            <Typography variant="body2">
              This candidate has already been <strong>{status}</strong> and
              cannot be scheduled for another interview.
            </Typography>
          </Alert>
        </Box>
      ) : roundLimitReached ? (
        <Box sx={{ p: 2 }}>
          <Alert severity="warning" sx={{ borderRadius: 2 }}>
            <Typography variant="body2">
              This tenant allows a maximum of{" "}
              <strong>{maxInterviewRounds}</strong> interview round
              {maxInterviewRounds === 1 ? "" : "s"}. Adjust it under Settings →
              HR if this candidate needs another round.
            </Typography>
          </Alert>
        </Box>
      ) : !prevRoundCleared ? (
        <Box sx={{ p: 2 }}>
          <Alert severity="warning" sx={{ borderRadius: 2 }}>
            <Typography variant="body2">
              Round {roundNumber - 1} must be <strong>Cleared</strong> before
              scheduling Round {roundNumber}. Current status:{" "}
              <strong>{status || "—"}</strong>
            </Typography>
          </Alert>
        </Box>
      ) : (
        <Box sx={{ p: 1.5 }}>
          <form onSubmit={formik.handleSubmit}>
            <Stack spacing={1}>
              {/* Interviewer Selection */}
              <Box>
                <Typography
                  variant="h6"
                  color="text.secondary"
                  gutterBottom
                  sx={{ mb: 1 }}
                >
                  <PersonIcon
                    sx={{ fontSize: 16, mr: 0.5, verticalAlign: "middle" }}
                  />
                  Select Interviewer
                </Typography>
                {interviewersLoading ? (
                  <Typography variant="caption" color="text.secondary">
                    Loading eligible interviewers…
                  </Typography>
                ) : interviewerUsernames.length === 0 ? (
                  <Alert severity="warning" sx={{ borderRadius: 2 }}>
                    No users currently have interview-taking permission. Grant
                    "Take Interview" under Settings → Permissions.
                  </Alert>
                ) : (
                  <UserAutoComplete
                    formik={formik}
                    userList={interviewerUsernames}
                    placeholder="Choose interviewer from the list"
                  />
                )}
                {formik.touched.username && formik.errors.username && (
                  <Typography
                    variant="caption"
                    color="error"
                    sx={{ mt: 0.5, display: "block" }}
                  >
                    {formik.errors.username}
                  </Typography>
                )}
              </Box>

              {/* Date and Time Selection */}
              <Box>
                <Typography
                  variant="h6"
                  color="text.secondary"
                  gutterBottom
                  sx={{ mb: 1 }}
                >
                  <CalendarTodayIcon
                    sx={{ fontSize: 16, mr: 0.5, verticalAlign: "middle" }}
                  />
                  Interview Date & Time
                </Typography>
                <Calendar
                  value={formik.values.dateTime}
                  onChange={(e) => formik.setFieldValue("dateTime", e.value)}
                  showTime
                  hourFormat="24"
                  dateFormat="dd/mm/yy"
                  // appendTo="self" gets clipped by the modal Paper's
                  // overflow:auto (see InputWrapper.tsx's date Calendar
                  // for the same established fix) — portal to the app
                  // root instead so the popup isn't bounded by it.
                  appendTo={() =>
                    document.querySelector("#root .App") as HTMLElement
                  }
                  minDate={minScheduleDate}
                  disabledDays={[0]} // Disable Sundays
                  timeOnly={false}
                  showButtonBar
                  stepMinute={15}
                  style={{ width: "100%" }}
                  placeholder="Select interview date and time"
                />
                {formik.touched.dateTime && formik.errors.dateTime && (
                  <Typography
                    variant="caption"
                    color="error"
                    sx={{ mt: 0.5, display: "block" }}
                  >
                    {formik.errors.dateTime}
                  </Typography>
                )}

                {/* Time Info */}
                <Box
                  sx={{
                    mt: 1.5,
                    p: 1.5,
                    bgcolor: "action.hover",
                    borderRadius: 1,
                  }}
                >
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
                  >
                    <AccessTimeIcon sx={{ fontSize: 14 }} />
                    Interview duration: 1 hour • Sundays are disabled •
                    15-minute intervals
                  </Typography>
                  {previousRoundEnd && previousRoundEnd > new Date() && (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: "block", mt: 0.5 }}
                    >
                      Must be after Round {roundNumber - 1}'s interview ends (
                      {dayjs(previousRoundEnd).format("DD MMM YYYY, HH:mm")})
                    </Typography>
                  )}
                </Box>
              </Box>

              <Box sx={{ mt: 0 }}>
                <Button type="submit" disabled={formik.isSubmitting}>
                  Schedule Interview
                </Button>
              </Box>
            </Stack>
          </form>
        </Box>
      )}
    </CustomModal>
  );
}

export default memo(ScheduleInterviewModal);
