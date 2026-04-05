import React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Skeleton from "@mui/material/Skeleton";
import Avatar from "@mui/material/Avatar";
import AssignmentIcon from "@mui/icons-material/Assignment";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import dayjs from "dayjs";
import { useNavigate } from "react-router-dom";
import { useDashboard } from "@web/app/providers/DashboardContext";

function PendingApprovals() {
  const navigate = useNavigate();
  const { data, loading } = useDashboard();
  const items = Array.isArray(data.pendingLeaves) ? data.pendingLeaves : [];
  const isLoading = loading.pendingLeaves;

  // Map leave type codes to readable labels
  const leaveTypeLabel = (type) => {
    if (!type) return "Leave";
    if (type === "PL" || type === "pl") return "Paid Leave";
    if (type === "LWP" || type === "lwp") return "Unpaid (LWP)";
    return type;
  };

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
            const displayName = item.username || item.userId || "?";
            const initials = displayName
              .split(".")
              .map((p) => p[0]?.toUpperCase())
              .join("")
              .slice(0, 2);

            const from = item.from || item.startDate || "";
            const to = item.to || item.endDate || "";
            const days =
              from && to
                ? dayjs(to).diff(dayjs(from), "day") + 1
                : item.days || item.totalDays;

            return (
              <Box
                key={i}
                onClick={() => navigate("/attendance")}
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
                    {displayName}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ color: "text.secondary", fontSize: "0.67rem" }}
                  >
                    {from ? dayjs(from).format("DD MMM") : ""}
                    {to && from !== to
                      ? ` – ${dayjs(to).format("DD MMM")}`
                      : ""}
                    {days ? ` · ${days}d` : ""}
                    {item.leaveType
                      ? ` · ${leaveTypeLabel(item.leaveType)}`
                      : ""}
                  </Typography>
                </Box>

                <Chip
                  size="small"
                  label="Pending"
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
