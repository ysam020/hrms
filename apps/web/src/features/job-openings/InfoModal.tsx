import { memo, useContext, useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { AlertContext } from "@web/app/providers/AlertContext";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import { UserContext } from "@web/app/providers/UserContext";
import hasPermission from "@web/shared/utils/permissions/hasPermission";
import CustomModal from "@web/shared/components/Modal";
import { useFormik } from "formik";
import apiClient from "@web/core/http/axiosConfig";
import { API_ENDPOINTS } from "@web/shared/constants";
import useFetchData from "@web/shared/hooks/useFetchData";
import dayjs from "dayjs";
import StatusTimeline, {
  type TimelineStage,
} from "@web/shared/components/StatusTimeline";
import { CandidateHeader } from "./info-modal/CandidateHeader";
import { RoundExtra } from "./info-modal/RoundExtra";
import { buildApplicationStages, validationSchema } from "./info-modal/helpers";
import { useConnectGoogleCalendar } from "./useConnectGoogleCalendar";
import ConnectGoogleCalendarPrompt from "./ConnectGoogleCalendarPrompt";

function InfoModal(props) {
  const { setAlert } = useContext(AlertContext);
  const { theme } = useContext(ThemeContext);
  const { user } = useContext(UserContext);
  const { promptOpen, requestConnect, startConnectFlow, closePrompt } =
    useConnectGoogleCalendar();
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
  // Mirrors the server-side requirePrivileged gate on
  // /update-assigned-official-email, which is the same gate /hire-candidate
  // itself uses — this is a hire-adjacent action, not a distinct permission.
  const canEditOfficialEmail = hasPermission(
    "JobOpenings",
    "hire_candidate",
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
  const [assignedOfficialEmail, setAssignedOfficialEmail] = useState(
    props.applicantData?.assignedOfficialEmail || "",
  );
  const [savingOfficialEmail, setSavingOfficialEmail] = useState(false);

  const handleSaveOfficialEmail = async (value: string) => {
    setSavingOfficialEmail(true);
    try {
      const res = await apiClient.put(
        API_ENDPOINTS.UPDATE_ASSIGNED_OFFICIAL_EMAIL,
        { id: props.applicantData.id, assignedOfficialEmail: value },
      );
      if (res.data?.success) {
        setAssignedOfficialEmail(res.data.data.assignedOfficialEmail || "");
        setAlert({
          open: true,
          message: "Assigned official email updated.",
          severity: "success",
        });
      } else {
        setAlert({
          open: true,
          message: res.data?.message || "Failed to update.",
          severity: "error",
        });
      }
    } catch (err: any) {
      setAlert({
        open: true,
        message: err.response?.data?.message || "Failed to update.",
        severity: "error",
      });
    } finally {
      setSavingOfficialEmail(false);
    }
  };

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
    setAssignedOfficialEmail(props.applicantData?.assignedOfficialEmail || "");
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
      if (error.response?.data?.code === "CALENDAR_NOT_CONNECTED") {
        requestConnect(() => handleRescheduleSubmit(index));
        return;
      }
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

  // "Applied" always occupies stage 0, then one stage per interview round in
  // order, so a round's detail can be attached back onto its stage purely
  // by index alignment with the interviews array.
  const stages: TimelineStage[] = buildApplicationStages(
    interviews,
    status,
  ).map((stage, i) => {
    const roundIndex = i - 1;
    if (roundIndex >= 0 && roundIndex < interviews.length) {
      const interview = interviews[roundIndex];
      const roundNumber = interview.roundNumber ?? roundIndex + 1;
      return {
        ...stage,
        extra: (
          <RoundExtra
            interview={interview}
            index={roundIndex}
            roundNumber={roundNumber}
            status={status}
            isTerminalStatus={isTerminalStatus}
            canReassign={canReassign}
            canReschedule={canReschedule}
            canUpdateStatus={canUpdateStatus}
            editIndex={editIndex}
            rescheduleIndex={rescheduleIndex}
            rescheduleDateTime={rescheduleDateTime}
            setRescheduleDateTime={setRescheduleDateTime}
            rescheduling={rescheduling}
            formik={formik}
            interviewersLoading={interviewersLoading}
            interviewerUsernames={interviewerUsernames}
            statusInputs={statusInputs}
            setStatusInputs={setStatusInputs}
            feedbackInputs={feedbackInputs}
            setFeedbackInputs={setFeedbackInputs}
            onAssignClick={handleAssignClick}
            onRescheduleClick={handleRescheduleClick}
            onRescheduleCancel={handleRescheduleCancel}
            onRescheduleSubmit={handleRescheduleSubmit}
            onCancelAssign={handleCancelClick}
            onUpdateStatus={updateStatus}
          />
        ),
      };
    }
    return stage;
  });

  const modalStyle = {
    width: { xs: "95%", sm: "90%", md: 1000, lg: 1200 },
    maxHeight: "95vh",
  };

  return (
    <>
      <CustomModal
        open={props.open}
        handleClose={props.handleClose}
        modalStyle={modalStyle}
        theme={theme}
        disablePortal
      >
        <Box>
          <CandidateHeader
            jobTitle={props.jobTitle}
            name={name}
            email={email}
            status={status}
            assignedOfficialEmail={assignedOfficialEmail}
            canEditOfficialEmail={canEditOfficialEmail}
            savingOfficialEmail={savingOfficialEmail}
            onSaveOfficialEmail={handleSaveOfficialEmail}
          />

          {/* Status Timeline */}
          <Box sx={{ p: 2, pt: 0 }}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Timeline
            </Typography>
            <StatusTimeline stages={stages} />
          </Box>
        </Box>
      </CustomModal>

      <ConnectGoogleCalendarPrompt
        open={promptOpen}
        onConnect={startConnectFlow}
        onClose={closePrompt}
      />
    </>
  );
}

export default memo(InfoModal);
