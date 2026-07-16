import RateReviewIcon from "@mui/icons-material/RateReview";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import TaskAltIcon from "@mui/icons-material/TaskAlt";

export const STATUS_OPTIONS = [
  { label: "All", value: "All" },
  { label: "Open", value: "open" },
  { label: "In Review", value: "in_review" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
  { label: "Resolved", value: "resolved" },
];

export const ISSUE_TYPES = [
  { value: "malfunction", label: "Malfunction" },
  { value: "damage", label: "Damage" },
  { value: "lost", label: "Lost" },
  { value: "stolen", label: "Stolen" },
  { value: "return_request", label: "Return Request" },
  { value: "other", label: "Other" },
];

export const PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

export const STATUS_CFG: Record<string, { color: string; bg: string }> = {
  open: { color: "#d97706", bg: "rgba(217,119,6,0.15)" },
  in_review: { color: "#6366f1", bg: "rgba(99,102,241,0.15)" },
  approved: { color: "#059669", bg: "rgba(5,150,105,0.15)" },
  rejected: { color: "#dc2626", bg: "rgba(220,38,38,0.15)" },
  resolved: { color: "#64748b", bg: "rgba(100,116,139,0.15)" },
};

export const PRIORITY_CFG: Record<string, { color: string }> = {
  low: { color: "#64748b" },
  medium: { color: "#d97706" },
  high: { color: "#ea580c" },
  critical: { color: "#dc2626" },
};

// Allowed HR actions per current status.
export const NEXT_ACTIONS: Record<
  string,
  { status: string; label: string; icon: React.ReactNode }[]
> = {
  open: [
    {
      status: "in_review",
      label: "Start Review",
      icon: <RateReviewIcon sx={{ fontSize: 16 }} />,
    },
  ],
  in_review: [
    {
      status: "approved",
      label: "Approve",
      icon: <CheckCircleIcon sx={{ fontSize: 16 }} />,
    },
    {
      status: "rejected",
      label: "Reject",
      icon: <CancelIcon sx={{ fontSize: 16 }} />,
    },
  ],
  approved: [
    {
      status: "resolved",
      label: "Resolve",
      icon: <TaskAltIcon sx={{ fontSize: 16 }} />,
    },
  ],
};
