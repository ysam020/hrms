import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Alert from "@mui/material/Alert";
import Button from "@web/shared/components/Button";
import AssignmentIndIcon from "@mui/icons-material/AssignmentInd";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import UserAutoComplete from "@web/shared/components/UserAutoComplete";
import { Dropdown } from "primereact/dropdown";
import { Calendar } from "primereact/calendar";
import TextField from "@mui/material/TextField";
import dayjs from "dayjs";
import {
  getStatusOptions,
  interviewHasEnded,
  shouldHideStatusDropdown,
} from "./helpers";

export function RoundExtra({
  interview,
  index,
  roundNumber,
  status,
  isTerminalStatus,
  canReassign,
  canReschedule,
  canUpdateStatus,
  editIndex,
  rescheduleIndex,
  rescheduleDateTime,
  setRescheduleDateTime,
  rescheduling,
  formik,
  interviewersLoading,
  interviewerUsernames,
  statusInputs,
  setStatusInputs,
  feedbackInputs,
  setFeedbackInputs,
  onAssignClick,
  onRescheduleClick,
  onRescheduleCancel,
  onRescheduleSubmit,
  onCancelAssign,
  onUpdateStatus,
}: {
  interview: any;
  index: number;
  roundNumber: number;
  status: string;
  isTerminalStatus: boolean;
  canReassign: boolean;
  canReschedule: boolean;
  canUpdateStatus: boolean;
  editIndex: number | null;
  rescheduleIndex: number | null;
  rescheduleDateTime: Date | null;
  setRescheduleDateTime: (d: Date | null) => void;
  rescheduling: boolean;
  formik: any;
  interviewersLoading: boolean;
  interviewerUsernames: string[];
  statusInputs: Record<number, string>;
  setStatusInputs: (
    update: (prev: Record<number, string>) => Record<number, string>,
  ) => void;
  feedbackInputs: Record<number, string>;
  setFeedbackInputs: (
    update: (prev: Record<number, string>) => Record<number, string>,
  ) => void;
  onAssignClick: (index: number) => void;
  onRescheduleClick: (index: number) => void;
  onRescheduleCancel: () => void;
  onRescheduleSubmit: (index: number) => void;
  onCancelAssign: () => void;
  onUpdateStatus: (index: number) => void;
}) {
  return (
    <Box sx={{ minWidth: 260, maxWidth: 440 }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          mb: 1,
          flexWrap: "wrap",
        }}
      >
        <AssignmentIndIcon sx={{ fontSize: 16, color: "text.secondary" }} />
        <Typography variant="body2" color="text.secondary">
          Interviewer: {interview.interviewer || "Not assigned"}
        </Typography>
        {!interview.interviewConducted &&
          !isTerminalStatus &&
          editIndex !== index &&
          rescheduleIndex !== index &&
          (canReassign || canReschedule) && (
            <Stack direction="row" spacing={1}>
              {canReassign && (
                <Button
                  onClick={() => onAssignClick(index)}
                  style={{ marginTop: 0 }}
                >
                  Reassign
                </Button>
              )}
              {canReschedule && (
                <Button
                  variant="outlined"
                  onClick={() => onRescheduleClick(index)}
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
        <Box sx={{ p: 2, bgcolor: "action.hover", borderRadius: 1, mb: 1 }}>
          <Typography variant="body2" fontWeight={500} gutterBottom>
            Reschedule Interview
          </Typography>
          <Stack spacing={1}>
            <Calendar
              value={rescheduleDateTime}
              onChange={(e) => setRescheduleDateTime(e.value as Date)}
              showTime
              hourFormat="24"
              dateFormat="dd/mm/yy"
              appendTo={() =>
                document.querySelector("#root .App") as HTMLElement
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
                onClick={() => onRescheduleSubmit(index)}
                disabled={rescheduling}
              >
                Confirm
              </Button>
              <Button
                variant="outlined"
                size="small"
                onClick={onRescheduleCancel}
              >
                Cancel
              </Button>
            </Stack>
          </Stack>
        </Box>
      )}

      {/* Reassign Form */}
      {editIndex === index && (
        <Box sx={{ p: 2, bgcolor: "action.hover", borderRadius: 1, mb: 1 }}>
          <Typography variant="body2" fontWeight={500} gutterBottom>
            Reassign Interviewer
          </Typography>
          <form onSubmit={formik.handleSubmit}>
            <Stack spacing={1}>
              {interviewersLoading ? (
                <Typography variant="caption" color="text.secondary">
                  Loading eligible interviewers…
                </Typography>
              ) : interviewerUsernames.length === 0 ? (
                <Alert severity="warning">
                  No users currently have interview-taking permission.
                </Alert>
              ) : (
                <UserAutoComplete
                  formik={formik}
                  userList={interviewerUsernames}
                  placeholder="Select new interviewer"
                />
              )}
              <Stack direction="row" spacing={1}>
                <Button type="submit" disabled={formik.isSubmitting}>
                  Assign
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={onCancelAssign}
                >
                  Cancel
                </Button>
              </Stack>
            </Stack>
          </form>
        </Box>
      )}

      {/* Interview Status */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
        {interview.interviewConducted ? (
          <CheckCircleIcon sx={{ fontSize: 16, color: "success.main" }} />
        ) : (
          <CancelIcon sx={{ fontSize: 16, color: "error.main" }} />
        )}
        <Typography variant="body2" color="text.secondary">
          Interview Conducted: {interview.interviewConducted ? "Yes" : "No"}
        </Typography>
      </Box>

      {interview.feedback && (
        <Box sx={{ p: 1.5, bgcolor: "action.hover", borderRadius: 1, mb: 1 }}>
          <Typography
            variant="caption"
            color="text.secondary"
            fontWeight={600}
            display="block"
          >
            Feedback
          </Typography>
          <Typography variant="body2">{interview.feedback}</Typography>
        </Box>
      )}

      {/* Status Update */}
      {!shouldHideStatusDropdown(roundNumber, status) &&
        canUpdateStatus &&
        (interviewHasEnded(interview) ? (
          <Box sx={{ p: 2, bgcolor: "action.hover", borderRadius: 1 }}>
            <Typography variant="body2" fontWeight={600} gutterBottom>
              Update Status
            </Typography>
            <Stack spacing={1}>
              <Dropdown
                value={statusInputs[index] || ""}
                options={getStatusOptions(interview)}
                placeholder="Select interview status"
                style={{ width: "100%" }}
                appendTo={() =>
                  document.querySelector("#root .App") as HTMLElement
                }
                onChange={(e) =>
                  setStatusInputs((prev) => ({ ...prev, [index]: e.value }))
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
                onClick={() => onUpdateStatus(index)}
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
          <Alert severity="info">
            <Typography variant="body2">
              This round can be marked Completed/Cleared after the scheduled
              interview ends
              {interview.interviewEndTime
                ? ` (${dayjs(interview.interviewEndTime, "YYYYMMDDTHHmmss").format("DD MMM YYYY, HH:mm")})`
                : ""}
              .
            </Typography>
          </Alert>
        ))}
    </Box>
  );
}
