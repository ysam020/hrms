import React, { useContext } from "react";
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
import {
  ApprovalsBadgeContext,
  type PendingApprovalItem,
  type KycApprovalItem,
} from "@web/app/providers/ApprovalsBadgeContext";

dayjs.extend(relativeTime);

// ChainApprovalItem.module is typed as plain `string`, so
// `item.module === "kyc"` alone doesn't narrow the union away from it —
// need an explicit type predicate.
const isKycItem = (item: PendingApprovalItem): item is KycApprovalItem =>
  item.module === "kyc";

const MODULE_LABELS: Record<string, string> = {
  leave: "Leave",
  resignation: "Resignation",
  overtime: "Overtime",
  wfh: "WFH",
  salary_advance: "Salary Advance",
  kyc: "KYC",
  join_request: "Join Request",
};

function initialsOf(name: string): string {
  return name
    .split(/[.\s]+/)
    .map((p) => p[0]?.toUpperCase())
    .filter(Boolean)
    .slice(0, 2)
    .join("");
}

// Reads from ApprovalsBadgeContext — the single shared fetch of
// GET /approvals/pending-all, which the server aggregates from the
// chain-engine modules (leave, resignation, overtime, wfh, salary advance),
// KYC submissions/edit-access requests, and tenant join requests. See that
// context for why this used to be 3 independent fetches per surface.
function PendingApprovals() {
  const navigate = useNavigate();
  const { pendingApprovalItems, loadingPendingApprovals } = useContext(
    ApprovalsBadgeContext,
  );

  const isLoading =
    loadingPendingApprovals && pendingApprovalItems.length === 0;
  const items = pendingApprovalItems;

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
            const targetPath = isKycItem(item)
              ? `/view-kyc/${item.username}`
              : item.module === "join_request"
                ? "/settings?tab=join-requests"
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
