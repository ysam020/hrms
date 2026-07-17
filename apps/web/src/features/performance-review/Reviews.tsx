import {
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import dayjs from "dayjs";
import { Calendar } from "primereact/calendar";
import { Dropdown } from "primereact/dropdown";
import FilterList from "@mui/icons-material/FilterList";
import DataList from "@web/shared/components/DataList";
import StatusTimeline, {
  type TimelineStage,
} from "@web/shared/components/StatusTimeline";
import apiClient from "@web/core/http/axiosConfig";
import ErrorFallback from "@web/shared/components/ErrorFallback";
import { ErrorBoundary } from "react-error-boundary";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Typography from "@mui/material/Typography";
import Button from "@web/shared/components/Button";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import { API_ENDPOINTS } from "@web/shared/constants";

const STATUS_CFG: Record<string, { color: string; bg: string }> = {
  draft: { color: "#d97706", bg: "rgba(217,119,6,0.15)" },
  self_assessment_submitted: { color: "#0284c7", bg: "rgba(2,132,199,0.15)" },
  manager_review_submitted: { color: "#7c3aed", bg: "rgba(124,58,237,0.15)" },
  approved: { color: "#059669", bg: "rgba(5,150,105,0.15)" },
  rejected: { color: "#dc2626", bg: "rgba(220,38,38,0.15)" },
};

function StatusChip({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.draft;
  return (
    <Chip
      label={status?.replace(/_/g, " ")}
      size="small"
      sx={{
        backgroundColor: cfg.bg,
        color: cfg.color,
        fontWeight: 600,
        fontSize: "0.7rem",
        height: 22,
        borderRadius: "4px",
        textTransform: "capitalize",
        "& .MuiChip-label": { padding: "0 8px" },
      }}
    />
  );
}

function buildTimeline(review: any): TimelineStage[] {
  const isRejected = review.status === "rejected";
  return [
    { label: "Cycle Started", date: review.createdAt, state: "done" },
    {
      label: "Self-Assessment Submitted",
      date: review.submittedAt || undefined,
      state: review.submittedAt ? "done" : "pending",
    },
    {
      label: "Manager Review Submitted",
      date: review.managerSubmittedAt || undefined,
      state: review.managerSubmittedAt ? "done" : "pending",
    },
    {
      label: isRejected ? "Rejected" : "Approved",
      date: review.finalizedAt || undefined,
      state: review.finalizedAt
        ? isRejected
          ? "rejected"
          : "done"
        : "pending",
    },
  ];
}

function Reviews() {
  const { setAlert } = useContext(AlertContext);
  const { user } = useContext(UserContext);
  const [reviews, setReviews] = useState<any[]>([]);
  const [cycleNames, setCycleNames] = useState<Record<string, string>>({});
  const [employeeNames, setEmployeeNames] = useState<Record<string, string>>(
    {},
  );
  const [pendingByReview, setPendingByReview] = useState<
    Record<string, string>
  >({});
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<any>(null);
  const [selfForm, setSelfForm] = useState({
    selfComments: "",
    selfRating: "",
  });
  const [managerForm, setManagerForm] = useState<{
    managerComments: string;
    managerRating: string;
    overallRating: string;
    recommendedIncrementPct: string;
    effectiveFrom: Date | null;
  }>({
    managerComments: "",
    managerRating: "",
    overallRating: "",
    recommendedIncrementPct: "",
    effectiveFrom: null,
  });
  const [approveComment, setApproveComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [globalFilter, setGlobalFilter] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  // Debounce the search box before it drives a server round-trip — mirrors
  // the searchRef/debounceRef pattern used elsewhere (e.g. AssetInventory),
  // adapted to this file's plain useEffect-driven fetch instead of
  // useServerPagination.
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(globalFilter), 400);
    return () => clearTimeout(handle);
  }, [globalFilter]);

  const fetchAll = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      let params = "";
      if (debouncedSearch)
        params += `&search=${encodeURIComponent(debouncedSearch)}`;
      if (statusFilter !== "All")
        params += `&status=${encodeURIComponent(statusFilter)}`;

      const [mineRes, reviewedRes, cyclesRes, usersRes, pendingRes] =
        await Promise.all([
          apiClient(API_ENDPOINTS.MY_REVIEWS(user.id, params)),
          apiClient(API_ENDPOINTS.TEAM_REVIEWS(user.id, params)),
          apiClient(API_ENDPOINTS.REVIEW_CYCLES(1, 200)),
          apiClient(API_ENDPOINTS.GET_ALL_USERS()),
          apiClient(API_ENDPOINTS.GET_PENDING_APPROVALS),
        ]);

      const byId = new Map<string, any>();
      for (const r of mineRes.data.data || []) byId.set(r.id, r);
      for (const r of reviewedRes.data.data || []) byId.set(r.id, r);
      setReviews(
        Array.from(byId.values()).sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
      );

      const cycles = cyclesRes.data.data || [];
      setCycleNames(Object.fromEntries(cycles.map((c: any) => [c.id, c.name])));

      const users = usersRes.data.data || [];
      setEmployeeNames(
        Object.fromEntries(
          users.map((u: any) => [
            u.id,
            [u.firstName, u.lastName].filter(Boolean).join(" ") || u.username,
          ]),
        ),
      );

      const pending = pendingRes.data.data || [];
      setPendingByReview(
        Object.fromEntries(
          pending
            .filter((p: any) => p.module === "performance_review")
            .map((p: any) => [p.entityId, p.instanceId]),
        ),
      );
    } catch (err: any) {
      // A superseded duplicate GET (e.g. PerformanceReviewCycles.tsx
      // fetching /performance-reviews/cycles on its own mount, since
      // TabsPanel mounts every tab at once) is already retried
      // transparently by the shared axios interceptor — this only ever
      // fires for a genuine cancellation (e.g. unmount) or a real failure.
      if (err?.code === "ERR_CANCELED" || err?.name === "CanceledError") return;
      // Otherwise a failed refetch (e.g. after changing the search/status
      // filter) would silently keep showing the previous, unfiltered
      // result set instead of reflecting the error.
      setReviews([]);
      setAlert({
        open: true,
        message: err?.response?.data?.message || "Failed to fetch reviews",
        severity: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [user?.id, debouncedSearch, statusFilter, setAlert]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const openDetail = useCallback((row: any) => {
    setDetail(row);
    setSelfForm({
      selfComments: row.selfComments || "",
      selfRating: row.selfRating ? String(row.selfRating) : "",
    });
    setManagerForm({
      managerComments: row.managerComments || "",
      managerRating: row.managerRating ? String(row.managerRating) : "",
      overallRating: row.overallRating ? String(row.overallRating) : "",
      recommendedIncrementPct: row.recommendedIncrementPct
        ? String(row.recommendedIncrementPct)
        : "",
      effectiveFrom: null,
    });
    setApproveComment("");
  }, []);

  const closeDetail = useCallback(() => {
    setDetail(null);
  }, []);

  const handleSelfSubmit = useCallback(async () => {
    if (!detail) return;
    setSubmitting(true);
    try {
      await apiClient.post(API_ENDPOINTS.SUBMIT_SELF_ASSESSMENT(detail.id), {
        selfComments: selfForm.selfComments,
        selfRating: Number(selfForm.selfRating),
      });
      closeDetail();
      fetchAll();
      setAlert({
        open: true,
        message: "Self-assessment submitted",
        severity: "success",
      });
    } catch (err: any) {
      setAlert({
        open: true,
        message: err?.response?.data?.message || "Submission failed",
        severity: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }, [detail, selfForm, closeDetail, fetchAll, setAlert]);

  const handleManagerSubmit = useCallback(async () => {
    if (!detail) return;
    setSubmitting(true);
    try {
      await apiClient.post(API_ENDPOINTS.SUBMIT_MANAGER_REVIEW(detail.id), {
        managerComments: managerForm.managerComments,
        managerRating: Number(managerForm.managerRating),
        overallRating: Number(managerForm.overallRating),
        ...(managerForm.recommendedIncrementPct
          ? {
              recommendedIncrementPct: Number(
                managerForm.recommendedIncrementPct,
              ),
            }
          : {}),
        ...(managerForm.effectiveFrom
          ? {
              effectiveFrom: dayjs(managerForm.effectiveFrom).format(
                "YYYY-MM-DD",
              ),
            }
          : {}),
      });
      closeDetail();
      fetchAll();
      setAlert({
        open: true,
        message:
          "Manager review submitted — sent for approval before any salary revision takes effect",
        severity: "success",
      });
    } catch (err: any) {
      setAlert({
        open: true,
        message: err?.response?.data?.message || "Submission failed",
        severity: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }, [detail, managerForm, closeDetail, fetchAll, setAlert]);

  const handleApprovalAction = useCallback(
    async (decision: "approved" | "rejected") => {
      if (!detail) return;
      const instanceId = pendingByReview[detail.id];
      if (!instanceId) return;
      setSubmitting(true);
      try {
        await apiClient.put(API_ENDPOINTS.ACT_ON_APPROVAL(instanceId), {
          decision,
          ...(approveComment ? { comment: approveComment } : {}),
        });
        closeDetail();
        fetchAll();
        setAlert({
          open: true,
          message:
            decision === "approved" ? "Review approved" : "Review rejected",
          severity: "success",
        });
      } catch (err: any) {
        setAlert({
          open: true,
          message: err?.response?.data?.message || "Action failed",
          severity: "error",
        });
      } finally {
        setSubmitting(false);
      }
    },
    [detail, pendingByReview, approveComment, closeDetail, fetchAll, setAlert],
  );

  const columns = useMemo(
    () => [
      {
        key: "userId",
        label: "Employee",
        primary: true,
        hideLabel: true,
        render: (row: any) =>
          row.userId === user?.id
            ? "You"
            : employeeNames[row.userId] || row.userId,
      },
      {
        key: "cycleId",
        label: "Cycle",
        render: (row: any) => cycleNames[row.cycleId] || row.cycleId,
      },
      {
        key: "status",
        label: "Status",
        hideLabel: true,
        render: (row: any) => <StatusChip status={row.status} />,
      },
      {
        key: "overallRating",
        label: "Overall Rating",
        render: (row: any) => row.overallRating || "—",
      },
      {
        key: "createdAt",
        label: "Created",
        render: (row: any) => dayjs(row.createdAt).format("DD MMM YYYY"),
      },
    ],
    [employeeNames, cycleNames, user?.id],
  );

  const canSelfAssess =
    detail && detail.userId === user?.id && detail.status === "draft";
  const canManagerReview =
    detail &&
    detail.reviewerId === user?.id &&
    detail.status === "self_assessment_submitted";
  const canApprove =
    detail &&
    detail.status === "manager_review_submitted" &&
    !!pendingByReview[detail.id];

  return (
    <ErrorBoundary fallback={<ErrorFallback />}>
      <Box sx={{ p: 2 }}>
        <DataList
          ariaLabel="Performance reviews"
          data={reviews}
          columns={columns}
          loading={loading}
          onRowClick={openDetail}
          emptyMessage="No reviews yet — a review appears here once HR starts a review cycle that includes you"
          search={{
            value: globalFilter,
            onChange: setGlobalFilter,
            placeholder: "Search by employee or cycle…",
          }}
          toolbarActions={
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <FilterList
                sx={{ fontSize: 18, color: "text.secondary", opacity: 0.7 }}
              />
              <Box sx={{ minWidth: 180 }}>
                <Dropdown
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.value)}
                  options={[
                    { label: "All", value: "All" },
                    { label: "Draft", value: "draft" },
                    {
                      label: "Self-Assessment Submitted",
                      value: "self_assessment_submitted",
                    },
                    {
                      label: "Manager Review Submitted",
                      value: "manager_review_submitted",
                    },
                    { label: "Approved", value: "approved" },
                    { label: "Rejected", value: "rejected" },
                  ]}
                  placeholder="Select Status"
                  className="w-full"
                  style={{ minWidth: "180px" }}
                  appendTo={() =>
                    document.querySelector("#root .App") as HTMLElement
                  }
                />
              </Box>
            </Box>
          }
        />
      </Box>

      <Dialog
        open={!!detail}
        onClose={closeDetail}
        maxWidth="sm"
        fullWidth
        disablePortal
      >
        <DialogTitle>
          {detail &&
            `${cycleNames[detail.cycleId] || ""} — ${
              detail.userId === user?.id
                ? "You"
                : employeeNames[detail.userId] || detail.userId
            }`}
        </DialogTitle>
        <DialogContent
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            pt: "16px !important",
          }}
        >
          {detail && (
            <>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <StatusChip status={detail.status} />
              </Box>

              <StatusTimeline stages={buildTimeline(detail)} />

              {(detail.selfComments || detail.selfRating > 0) && (
                <>
                  <Divider />
                  <Box>
                    <Typography variant="subtitle2">
                      Self-Assessment (Rating: {detail.selfRating || "—"})
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{ color: "text.secondary" }}
                    >
                      {detail.selfComments || "—"}
                    </Typography>
                  </Box>
                </>
              )}

              {(detail.managerComments || detail.managerRating > 0) && (
                <>
                  <Divider />
                  <Box>
                    <Typography variant="subtitle2">
                      Manager Review (Rating: {detail.managerRating || "—"},
                      Overall: {detail.overallRating || "—"})
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{ color: "text.secondary" }}
                    >
                      {detail.managerComments || "—"}
                    </Typography>
                    {detail.recommendedIncrementPct > 0 && (
                      <Typography
                        variant="body2"
                        sx={{ color: "text.secondary", mt: 0.5 }}
                      >
                        Recommended: {detail.recommendedIncrementPct}% increment
                      </Typography>
                    )}
                  </Box>
                </>
              )}

              {canSelfAssess && (
                <>
                  <Divider />
                  <Typography variant="subtitle2">
                    Submit Self-Assessment
                  </Typography>
                  <TextField
                    label="Self Rating"
                    type="number"
                    size="small"
                    fullWidth
                    value={selfForm.selfRating}
                    onChange={(e) =>
                      setSelfForm((f) => ({ ...f, selfRating: e.target.value }))
                    }
                  />
                  <TextField
                    label="Comments"
                    size="small"
                    multiline
                    rows={3}
                    fullWidth
                    value={selfForm.selfComments}
                    onChange={(e) =>
                      setSelfForm((f) => ({
                        ...f,
                        selfComments: e.target.value,
                      }))
                    }
                  />
                  <Button
                    onClick={handleSelfSubmit}
                    variant="primary"
                    size="small"
                    disabled={submitting || !selfForm.selfRating}
                    loading={submitting}
                    loadingText="Submitting…"
                  >
                    Submit Self-Assessment
                  </Button>
                </>
              )}

              {canManagerReview && (
                <>
                  <Divider />
                  <Typography variant="subtitle2">
                    Submit Manager Review
                  </Typography>
                  <Box sx={{ display: "flex", gap: 2 }}>
                    <TextField
                      label="Manager Rating"
                      type="number"
                      size="small"
                      fullWidth
                      value={managerForm.managerRating}
                      onChange={(e) =>
                        setManagerForm((f) => ({
                          ...f,
                          managerRating: e.target.value,
                        }))
                      }
                    />
                    <TextField
                      label="Overall Rating"
                      type="number"
                      size="small"
                      fullWidth
                      value={managerForm.overallRating}
                      onChange={(e) =>
                        setManagerForm((f) => ({
                          ...f,
                          overallRating: e.target.value,
                        }))
                      }
                    />
                  </Box>
                  <TextField
                    label="Manager Comments"
                    size="small"
                    multiline
                    rows={3}
                    fullWidth
                    value={managerForm.managerComments}
                    onChange={(e) =>
                      setManagerForm((f) => ({
                        ...f,
                        managerComments: e.target.value,
                      }))
                    }
                  />
                  <TextField
                    label="Recommended Increment (%)"
                    type="number"
                    size="small"
                    fullWidth
                    value={managerForm.recommendedIncrementPct}
                    onChange={(e) =>
                      setManagerForm((f) => ({
                        ...f,
                        recommendedIncrementPct: e.target.value,
                      }))
                    }
                  />
                  <div className="form-field-container">
                    <label
                      htmlFor="effectiveFrom"
                      style={{
                        display: "block",
                        marginBottom: 4,
                        fontSize: "0.875rem",
                        fontWeight: 500,
                      }}
                    >
                      Effective From
                    </label>
                    <Calendar
                      inputId="effectiveFrom"
                      value={managerForm.effectiveFrom}
                      onChange={(e) =>
                        setManagerForm((f) => ({
                          ...f,
                          effectiveFrom: e.value as Date,
                        }))
                      }
                      dateFormat="dd/mm/yy"
                      showIcon
                      showButtonBar
                      placeholder="Select date"
                      appendTo={() =>
                        document.querySelector("#root .App") as HTMLElement
                      }
                      style={{ width: "100%" }}
                    />
                  </div>
                  <Button
                    onClick={handleManagerSubmit}
                    variant="primary"
                    size="small"
                    disabled={
                      submitting ||
                      !managerForm.managerRating ||
                      !managerForm.overallRating
                    }
                    loading={submitting}
                    loadingText="Submitting…"
                  >
                    Submit Manager Review
                  </Button>
                </>
              )}

              {canApprove && (
                <>
                  <Divider />
                  <Typography variant="subtitle2">
                    Your approval is needed for this review
                  </Typography>
                  <TextField
                    label="Comment (optional)"
                    size="small"
                    multiline
                    rows={2}
                    fullWidth
                    value={approveComment}
                    onChange={(e) => setApproveComment(e.target.value)}
                  />
                  <Box sx={{ display: "flex", gap: 1 }}>
                    <Button
                      onClick={() => handleApprovalAction("approved")}
                      variant="primary"
                      size="small"
                      disabled={submitting}
                      loading={submitting}
                      loadingText="Submitting…"
                    >
                      Approve
                    </Button>
                    <Button
                      onClick={() => handleApprovalAction("rejected")}
                      variant="danger"
                      size="small"
                      disabled={submitting}
                    >
                      Reject
                    </Button>
                  </Box>
                </>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button variant="ghost" onClick={closeDetail} size="small">
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </ErrorBoundary>
  );
}

export default memo(Reviews);
