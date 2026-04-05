import React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Skeleton from "@mui/material/Skeleton";
import VerifiedUserIcon from "@mui/icons-material/VerifiedUser";
import { useNavigate } from "react-router-dom";
import { useDashboard } from "@web/app/providers/DashboardContext";

function KycStatus() {
  const navigate = useNavigate();
  const { data, loading } = useDashboard();
  const isLoading = loading.kycInsights;
  const overview = data.kycInsights?.overview;

  const stats = [
    { label: "Approved", value: overview?.approvedKyc, color: "#10b981" },
    { label: "Pending", value: overview?.pendingKyc, color: "#f59e0b" },
    { label: "Rejected", value: overview?.rejectedKyc, color: "#ef4444" },
    {
      label: "Done",
      value:
        overview?.completionRate != null
          ? `${Math.round(overview.completionRate)}%`
          : null,
      color: "#3b82f6",
    },
  ];

  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        cursor: "pointer",
      }}
      onClick={() => navigate("/kyc")}
    >
      {/* Header */}
      <Box
        sx={{
          px: 1.5,
          py: 0.75,
          display: "flex",
          alignItems: "center",
          gap: 0.75,
          borderBottom: 1,
          borderColor: "divider",
          flexShrink: 0,
        }}
      >
        <VerifiedUserIcon sx={{ fontSize: 14, color: "text.secondary" }} />
        <Typography
          variant="subtitle2"
          fontWeight={700}
          sx={{ fontSize: "0.8rem" }}
        >
          KYC Status
        </Typography>
      </Box>

      {/* Stat pills — 2×2 grid */}
      <Box
        sx={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 0.75,
          px: 1,
          py: 0.75,
          alignContent: "center",
        }}
      >
        {stats.map((s) => (
          <Box
            key={s.label}
            sx={{
              textAlign: "center",
              py: 0.5,
              borderRadius: 1.5,
              bgcolor: `${s.color}12`,
              border: `1px solid ${s.color}30`,
            }}
          >
            {isLoading ? (
              <Skeleton width={28} height={22} sx={{ mx: "auto" }} />
            ) : (
              <Typography
                fontWeight={800}
                sx={{ fontSize: "1rem", color: s.color, lineHeight: 1.1 }}
              >
                {s.value ?? "—"}
              </Typography>
            )}
            <Typography
              variant="caption"
              sx={{ fontSize: "0.58rem", color: "text.secondary" }}
            >
              {s.label}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

export default React.memo(KycStatus);
