import React, { useCallback } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Skeleton from "@mui/material/Skeleton";
import Avatar from "@mui/material/Avatar";
import AssignmentIcon from "@mui/icons-material/Assignment";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useNavigate } from "react-router-dom";
import useFetchData from "@web/shared/hooks/useFetchData";
import useSocketEvent from "@web/shared/hooks/useSocketEvent";
import { API_ENDPOINTS } from "@web/shared/constants";

dayjs.extend(relativeTime);

interface PendingApprovalItem {
  instanceId: string;
  module: string;
  username?: string;
  requestedByName: string;
  createdAt: string;
  summary: string;
}

const MODULE_LABELS: Record<string, string> = {
  leave: "Leave",
  resignation: "Resignation",
  overtime: "Overtime",
  wfh: "WFH",
  salary_advance: "Salary Advance",
  kyc: "KYC",
};

function initialsOf(name: string): string {
  return name
    .split(/[.\s]+/)
    .map((p) => p[0]?.toUpperCase())
    .filter(Boolean)
    .slice(0, 2)
    .join("");
}

// Merges two sources: GET /approvals/pending (the chain-engine-backed
// modules — leave, resignation, overtime, wfh, salary advance) and GET
// /kyc-approvals/pending (KYC submissions awaiting approval, and KYC
// edit-access requests, neither of which are chain-engine instances since
// several people can be eligible to act on either — see submitKyc.ts /
// allowKycEdit.ts). KYC items live-update via socket instead of polling:
// kyc-submitted/kyc-edit-requested add one, kyc-edit-allowed/
// kyc-edit-resolved remove one (the latter fires for every OTHER eligible
// approver the moment one of them acts, so a stale, already-handled item
// never lingers in someone else's list).
function PendingApprovals() {
  const navigate = useNavigate();
  const {
    data: approvals,
    loading: loadingApprovals,
    refetch: refetchApprovals,
  } = useFetchData<PendingApprovalItem[]>(
    API_ENDPOINTS.GET_PENDING_APPROVALS,
    "get",
    [],
  );
  const {
    data: kycRequests,
    loading: loadingKyc,
    refetch: refetchKyc,
  } = useFetchData<PendingApprovalItem[]>(
    API_ENDPOINTS.GET_PENDING_KYC_APPROVALS,
    "get",
    [],
  );

  // Every event that can add or resolve a pending item — leave applied,
  // resignation submitted, KYC edit requested/allowed/resolved, etc. —
  // already goes through notificationWorker.ts, which emits the generic
  // "notification" socket event to the relevant recipients (the same
  // channel the bell/toast system relies on). Reusing it here means this
  // widget updates live with no polling and no dedicated push event per
  // module.
  const refetchBoth = useCallback(() => {
    refetchApprovals?.();
    refetchKyc?.();
  }, [refetchApprovals, refetchKyc]);
  useSocketEvent("notification", refetchBoth);

  const isLoading = loadingApprovals || loadingKyc;
  // Each source list is already sorted newest-first server-side, but
  // merging the two doesn't interleave them by date on its own.
  const items = [
    ...(Array.isArray(approvals) ? approvals : []),
    ...(Array.isArray(kycRequests) ? kycRequests : []),
  ].sort(
    (a, b) =>
      new Date(b.createdAt ?? 0).getTime() -
      new Date(a.createdAt ?? 0).getTime(),
  );

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <Box
        sx={{
          px: 1.5,
          py: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: 1,
          borderColor: "divider",
          flexShrink: 0,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
          <AssignmentIcon sx={{ fontSize: 15, color: "text.secondary" }} />
          <Typography variant="subtitle2" fontWeight={700}>
            Pending Approvals
          </Typography>
        </Box>
        {!isLoading && (
          <Chip
            size="small"
            label={items.length === 0 ? "All clear" : items.length}
            color={items.length === 0 ? "success" : "warning"}
            sx={{
              height: 18,
              fontSize: "0.65rem",
              "& .MuiChip-label": { px: 0.75 },
            }}
          />
        )}
      </Box>

      {/* Content */}
      <Box sx={{ flex: 1, overflow: "auto" }}>
        {isLoading ? (
          [...Array(3)].map((_, i) => (
            <Box
              key={i}
              sx={{
                px: 1.5,
                py: 0.75,
                display: "flex",
                alignItems: "center",
                gap: 1,
              }}
            >
              <Skeleton variant="circular" width={28} height={28} />
              <Box sx={{ flex: 1 }}>
                <Skeleton height={13} width="55%" />
                <Skeleton height={11} width="70%" sx={{ mt: 0.25 }} />
              </Box>
            </Box>
          ))
        ) : items.length === 0 ? (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              gap: 0.5,
              color: "text.disabled",
            }}
          >
            <CheckCircleOutlineIcon
              sx={{ fontSize: 28, color: "#10b981", opacity: 0.7 }}
            />
            <Typography
              variant="caption"
              sx={{ color: "#10b981", fontWeight: 600 }}
            >
              No pending approvals
            </Typography>
          </Box>
        ) : (
          items.slice(0, 5).map((item, i) => {
            const displayName = item.requestedByName || "?";
            const initials = initialsOf(displayName);
            const targetPath =
              item.module === "kyc" && item.username
                ? `/view-kyc/${item.username}`
                : "/approvals";

            return (
              <Box
                key={item.instanceId ?? i}
                onClick={() => navigate(targetPath)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    navigate(targetPath);
                  }
                }}
                role="button"
                tabIndex={0}
                aria-label={`Pending approval: ${item.summary}`}
                sx={{
                  px: 1.5,
                  py: 0.8,
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  cursor: "pointer",
                  transition: "background 0.1s",
                  "&:hover": { bgcolor: "action.hover" },
                  borderBottom:
                    i < items.slice(0, 5).length - 1 ? "1px solid" : "none",
                  borderColor: "divider",
                }}
              >
                <Avatar
                  sx={{
                    width: 28,
                    height: 28,
                    fontSize: "0.65rem",
                    fontWeight: 700,
                    bgcolor: `hsl(${(i * 67) % 360},60%,50%)`,
                    flexShrink: 0,
                  }}
                >
                  {initials}
                </Avatar>

                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    variant="body2"
                    fontWeight={600}
                    sx={{
                      fontSize: "0.78rem",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {item.summary || displayName}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ color: "text.secondary", fontSize: "0.67rem" }}
                  >
                    {displayName}
                    {item.createdAt
                      ? ` · ${dayjs(item.createdAt).fromNow()}`
                      : ""}
                  </Typography>
                </Box>

                <Chip
                  size="small"
                  label={MODULE_LABELS[item.module] ?? item.module ?? "Pending"}
                  color="warning"
                  variant="outlined"
                  sx={{
                    fontSize: "0.58rem",
                    height: 16,
                    "& .MuiChip-label": { px: 0.5 },
                    flexShrink: 0,
                  }}
                />
              </Box>
            );
          })
        )}
      </Box>
    </Box>
  );
}

export default React.memo(PendingApprovals);
