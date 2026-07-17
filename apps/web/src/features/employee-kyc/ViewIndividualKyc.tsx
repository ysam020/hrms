import { memo, useCallback, useContext, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import BasicInfo from "@web/features/profile/BasicInfo";
import { AlertContext } from "@web/app/providers/AlertContext";
import apiClient from "@web/core/http/axiosConfig";
import useFetchData from "@web/shared/hooks/useFetchData";
import useSocketEvent from "@web/shared/hooks/useSocketEvent";
import ErrorFallback from "@web/shared/components/ErrorFallback";
import { ErrorBoundary } from "react-error-boundary";
import { UserContext } from "@web/app/providers/UserContext";
import { ApprovalsBadgeContext } from "@web/app/providers/ApprovalsBadgeContext";
import hasPermission from "@web/shared/utils/permissions/hasPermission";
import Button from "@web/shared/components/Button";
import { API_ENDPOINTS } from "@web/shared/constants";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import SlideUpTransition from "@web/shared/components/SlideUpTransition";
import ConfirmationDialog from "@web/shared/components/ConfirmationDialog";

// Once a KYC has been decided (Approved) or is mid-review (Edit Requested,
// awaiting HR's grant), it's not directly editable — the employee must go
// through "Request KYC Update" and have HR "Allow Editing" it first.
// "Rejected" is a legacy terminal status (the reject action itself has been
// removed) with no further path.
const UNEDITABLE_STATUSES = ["Approved", "Rejected", "Edit Requested"];

// Same field set as CompleteKYC.tsx's form — kept in sync with it so HR
// picks issues by the same fields the employee actually sees and edits.
const REVISABLE_FIELDS: { key: string; label: string }[] = [
  { key: "employee_photo", label: "Employee Photo" },
  { key: "dob", label: "Date of Birth" },
  { key: "permanent_address_line_1", label: "Permanent Address Line 1" },
  { key: "permanent_address_line_2", label: "Permanent Address Line 2" },
  { key: "permanent_address_city", label: "Permanent Address City" },
  { key: "permanent_address_state", label: "Permanent Address State" },
  { key: "permanent_address_pincode", label: "Permanent Address PIN Code" },
  {
    key: "communication_address_line_1",
    label: "Communication Address Line 1",
  },
  {
    key: "communication_address_line_2",
    label: "Communication Address Line 2",
  },
  { key: "communication_address_city", label: "Communication Address City" },
  { key: "communication_address_state", label: "Communication Address State" },
  {
    key: "communication_address_pincode",
    label: "Communication Address PIN Code",
  },
  { key: "email", label: "Email" },
  { key: "official_email", label: "Official Email" },
  { key: "mobile", label: "Mobile" },
  { key: "blood_group", label: "Blood Group" },
  { key: "qualification", label: "Highest Qualification" },
  { key: "aadhar_no", label: "AADHAR Number" },
  { key: "aadhar_photo_front", label: "AADHAR Front Photo" },
  { key: "aadhar_photo_back", label: "AADHAR Back Photo" },
  { key: "pan_no", label: "PAN Number" },
  { key: "pan_photo", label: "PAN Card Photo" },
  { key: "education_certificates", label: "Education Certificates" },
  { key: "experience_certificate", label: "Experience Certificate" },
  { key: "electricity_bill", label: "Address Proof" },
  { key: "bank_account_no", label: "Bank Account Number" },
  { key: "bank_name", label: "Bank Name" },
  { key: "ifsc_code", label: "IFSC Code" },
];

function RequestRevisionDialog({
  open,
  onClose,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (fieldIssues: Record<string, string>) => void;
  submitting: boolean;
}) {
  const [notes, setNotes] = useState<Record<string, string>>({});

  const toggleField = (key: string) => {
    setNotes((prev) => {
      if (key in prev) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: "" };
    });
  };

  const checkedKeys = Object.keys(notes);
  const canSubmit =
    checkedKeys.length > 0 && checkedKeys.every((k) => notes[k].trim());

  const handleClose = () => {
    setNotes({});
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      fullWidth
      maxWidth="sm"
      TransitionComponent={SlideUpTransition}
    >
      <DialogTitle>Request KYC revision</DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Select the fields that need correction and describe the issue with
          each. The employee will see these notes on their KYC form.
        </Typography>
        <Box sx={{ maxHeight: 400, overflowY: "auto", px: 1.5, mx: -1.5 }}>
          {REVISABLE_FIELDS.map(({ key, label }) => (
            <Box key={key} sx={{ mb: key in notes ? 1.5 : 0 }}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={key in notes}
                    onChange={() => toggleField(key)}
                  />
                }
                label={label}
              />
              {key in notes && (
                <TextField
                  size="small"
                  fullWidth
                  placeholder={`What's wrong with ${label}?`}
                  value={notes[key]}
                  onChange={(e) =>
                    setNotes((prev) => ({ ...prev, [key]: e.target.value }))
                  }
                  sx={{ ml: 4, width: "calc(100% - 32px)" }}
                  error={key in notes && !notes[key].trim()}
                />
              )}
            </Box>
          ))}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button variant="ghost" onClick={handleClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={!canSubmit || submitting}
          loading={submitting}
          loadingText="Sending…"
          onClick={() => onSubmit(notes)}
        >
          Send revision request
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function RequestEditAccessDialog({
  open,
  onClose,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
  submitting: boolean;
}) {
  const [reason, setReason] = useState("");

  const handleClose = () => {
    setReason("");
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      fullWidth
      maxWidth="sm"
      TransitionComponent={SlideUpTransition}
    >
      <DialogTitle>Request to update your KYC</DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Your KYC is already approved. Tell HR what changed (e.g. new bank
          account, updated address) — once they allow it, you'll be able to edit
          your KYC again.
        </Typography>
        <TextField
          size="small"
          fullWidth
          multiline
          minRows={3}
          placeholder="What needs to be updated, and why?"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button variant="ghost" onClick={handleClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={!reason.trim() || submitting}
          loading={submitting}
          loadingText="Sending…"
          onClick={() => onSubmit(reason)}
        >
          Send request
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function ViewIndividualKyc() {
  const { username } = useParams();
  const { user } = useContext(UserContext);
  const canApproveKyc = hasPermission(
    "BasicKYCDetails",
    "approve_kyc",
    "all",
    user?.isSuperUser,
    user?.permissions || [],
  );
  const canRequestRevision = hasPermission(
    "BasicKYCDetails",
    "request_kyc_revision",
    "all",
    user?.isSuperUser,
    user?.permissions || [],
  );
  const canEditKyc = hasPermission(
    "BasicKYCDetails",
    "edit_kyc",
    "all",
    user?.isSuperUser,
    user?.permissions || [],
  );
  const navigate = useNavigate();
  const { setAlert } = useContext(AlertContext);
  const { refetchPendingApprovals } = useContext(ApprovalsBadgeContext);
  const [revisionDialogOpen, setRevisionDialogOpen] = useState(false);
  const [requestingRevision, setRequestingRevision] = useState(false);
  const [editAccessDialogOpen, setEditAccessDialogOpen] = useState(false);
  const [requestingEditAccess, setRequestingEditAccess] = useState(false);
  const [allowingEdit, setAllowingEdit] = useState(false);
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [approving, setApproving] = useState(false);

  // Fetch user data using custom hook
  const { data, loading, refetch } = useFetchData(
    `/get-user-data/${username}`,
    "get",
    [username],
    null,
    null,
  );

  // Live-refresh instead of relying on the actor's own refetch() call:
  // - kyc-edit-requested: HR viewing this page sees the "waiting" banner
  //   appear the moment the employee submits a request.
  // - kyc-edit-allowed: the employee's own "Waiting for approver..." screen
  //   flips to editable without a manual reload.
  // - kyc-edit-resolved: if another approver grants it first while this HR
  //   user has the same page open, the now-stale "Allow Editing" action
  //   disappears instead of erroring on click.
  const handleKycEditSocketEvent = useCallback(
    (payload: { username?: string }) => {
      if (payload?.username === username) refetch?.();
    },
    [username, refetch],
  );
  useSocketEvent("kyc-edit-requested", handleKycEditSocketEvent);
  useSocketEvent("kyc-edit-allowed", handleKycEditSocketEvent);
  useSocketEvent("kyc-edit-resolved", handleKycEditSocketEvent);

  const handleKycApproval = async () => {
    setApproving(true);
    try {
      const res = await apiClient.post(API_ENDPOINTS.KYC_APPROVAL, {
        username,
        kyc_approval: "Approved",
      });
      setAlert({
        open: true,
        message: res.data.message,
        severity: "success",
      });
      setApproveDialogOpen(false);
      refetch?.();
    } catch (error) {
      setAlert({
        open: true,
        message:
          error.message === "Network Error"
            ? "Network Error, your details will be submitted when you are back online"
            : error.response.data.message,
        severity: "error",
      });
    } finally {
      setApproving(false);
    }
  };

  const handleRequestRevision = async (fieldIssues: Record<string, string>) => {
    setRequestingRevision(true);
    try {
      const res = await apiClient.post(API_ENDPOINTS.KYC_APPROVAL, {
        username,
        kyc_approval: "Revision Requested",
        field_issues: fieldIssues,
      });
      setAlert({
        open: true,
        message: res.data.message,
        severity: "success",
      });
      setRevisionDialogOpen(false);
      refetch?.();
    } catch (error) {
      setAlert({
        open: true,
        message:
          error.message === "Network Error"
            ? "Network Error, your details will be submitted when you are back online"
            : error.response.data.message,
        severity: "error",
      });
    } finally {
      setRequestingRevision(false);
    }
  };

  const handleRequestEditAccess = async (reason: string) => {
    setRequestingEditAccess(true);
    try {
      const res = await apiClient.post(API_ENDPOINTS.REQUEST_KYC_EDIT_ACCESS, {
        reason,
      });
      setAlert({
        open: true,
        message: res.data.message,
        severity: "success",
      });
      setEditAccessDialogOpen(false);
      refetch?.();
      refetchPendingApprovals();
    } catch (error) {
      setAlert({
        open: true,
        message:
          error.message === "Network Error"
            ? "Network Error, your details will be submitted when you are back online"
            : error.response.data.message,
        severity: "error",
      });
    } finally {
      setRequestingEditAccess(false);
    }
  };

  const handleAllowEdit = async () => {
    setAllowingEdit(true);
    try {
      const res = await apiClient.put(API_ENDPOINTS.ALLOW_KYC_EDIT, {
        username,
      });
      setAlert({
        open: true,
        message: res.data.message,
        severity: "success",
      });
      refetch?.();
      refetchPendingApprovals();
    } catch (error) {
      setAlert({
        open: true,
        message:
          error.message === "Network Error"
            ? "Network Error, your details will be submitted when you are back online"
            : error.response.data.message,
        severity: "error",
      });
    } finally {
      setAllowingEdit(false);
    }
  };

  const revisionNotes: Record<string, string> = data?.kyc_revision_notes ?? {};
  const hasRevisionNotes = Object.keys(revisionNotes).length > 0;
  const kycStatus = data?.kyc_approval;
  const isSelfView = user?.username === username;
  const isUneditable = UNEDITABLE_STATUSES.includes(kycStatus ?? "");
  // A granted edit-access request allows exactly one edit — submitKyc
  // flips kyc_edit_window to "closed" the moment that edit lands, so a
  // still-Pending record can be non-editable again without ever leaving
  // the Pending status (which onboarding relies on staying editable). Must
  // match the gateway's editKyc check in apps/api-gateway/.../employee.ts.
  // This only gates the Edit button — Approve/Request Revision must stay
  // available on a Pending record regardless of the edit window, since
  // that's HR's normal review action, unrelated to the employee's
  // one-time self-edit allowance.
  const editWindowClosed =
    kycStatus === "Pending" && data?.kyc_edit_window === "closed";
  const editBlocked = isUneditable || editWindowClosed;

  return (
    <>
      {!loading && data && (
        <div style={{ padding: 20 }}>
          <ErrorBoundary fallback={<ErrorFallback />}>
            {kycStatus === "Revision Requested" && hasRevisionNotes && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                <Typography variant="body2" fontWeight={600}>
                  Revision requested — awaiting resubmission
                </Typography>
                {Object.entries(revisionNotes).map(([field, note]) => (
                  <Typography variant="body2" key={field}>
                    •{" "}
                    {REVISABLE_FIELDS.find((f) => f.key === field)?.label ??
                      field}
                    : {note}
                  </Typography>
                ))}
              </Alert>
            )}

            {kycStatus === "Edit Requested" && (
              <Alert
                severity="info"
                sx={{ mb: 2 }}
                action={
                  !isSelfView &&
                  canRequestRevision && (
                    <Button
                      size="small"
                      variant="outline"
                      onClick={handleAllowEdit}
                      loading={allowingEdit}
                      loadingText="Allowing…"
                    >
                      Allow Editing
                    </Button>
                  )
                }
              >
                <Typography variant="body2" fontWeight={600}>
                  {isSelfView
                    ? "Waiting for approver..."
                    : `${data.username} requested to edit their approved KYC`}
                </Typography>
                {data?.kyc_edit_request_reason && (
                  <Typography variant="body2">
                    "{data.kyc_edit_request_reason}"
                  </Typography>
                )}
              </Alert>
            )}

            <BasicInfo user={data} />

            {data?.employeeStatus === "Active" && (
              <>
                <br />
                <div className="flex-div">
                  {!isSelfView && (
                    <>
                      {canApproveKyc && !isUneditable && (
                        <Button onClick={() => setApproveDialogOpen(true)}>
                          Approve
                        </Button>
                      )}
                      {canRequestRevision && !isUneditable && (
                        <Button
                          variant="outline"
                          style={{ marginLeft: "10px" }}
                          onClick={() => setRevisionDialogOpen(true)}
                        >
                          Request Revision
                        </Button>
                      )}
                    </>
                  )}

                  {isSelfView && kycStatus === "Approved" && (
                    <Button onClick={() => setEditAccessDialogOpen(true)}>
                      Request KYC Update
                    </Button>
                  )}

                  {canEditKyc &&
                    !editBlocked &&
                    (!isSelfView || user.isSuperUser) && (
                      <Button
                        style={{ marginLeft: "10px" }}
                        onClick={() => navigate(`/edit-kyc/${data.username}`)}
                      >
                        Edit
                      </Button>
                    )}
                </div>
              </>
            )}
          </ErrorBoundary>
        </div>
      )}

      <RequestRevisionDialog
        open={revisionDialogOpen}
        onClose={() => setRevisionDialogOpen(false)}
        onSubmit={handleRequestRevision}
        submitting={requestingRevision}
      />
      <RequestEditAccessDialog
        open={editAccessDialogOpen}
        onClose={() => setEditAccessDialogOpen(false)}
        onSubmit={handleRequestEditAccess}
        submitting={requestingEditAccess}
      />
      <ConfirmationDialog
        open={approveDialogOpen}
        onClose={() => (!approving ? setApproveDialogOpen(false) : undefined)}
        onConfirm={handleKycApproval}
        title="Approve KYC"
        message={`Are you sure you want to approve ${data?.username ?? "this employee"}'s KYC?`}
        confirmText="Approve"
        cancelText="Cancel"
        loading={approving}
        variant="default"
      />
    </>
  );
}

export default memo(ViewIndividualKyc);
