import Box from "@mui/material/Box";
import BeachAccessIcon from "@mui/icons-material/BeachAccess";
import PaymentsIcon from "@mui/icons-material/Payments";
import PersonIcon from "@mui/icons-material/Person";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import AssignmentIcon from "@mui/icons-material/Assignment";
import BadgeIcon from "@mui/icons-material/Badge";
import { ActionBtn, SectionLabel } from "./components";

const QUICK_ACTIONS = [
  {
    icon: <BeachAccessIcon sx={{ fontSize: 18 }} />,
    label: "Apply Leave",
    path: "/attendance/view-leave-applications?action=apply",
  },
  {
    icon: <PaymentsIcon sx={{ fontSize: 18 }} />,
    label: "My Payslips",
    path: "/payroll/my-payslips",
  },
  {
    icon: <PersonIcon sx={{ fontSize: 18 }} />,
    label: "My Profile",
    path: "/profile",
  },
  {
    icon: <CalendarMonthIcon sx={{ fontSize: 18 }} />,
    label: "Calendar",
    path: "/calendar",
  },
  {
    icon: <AssignmentIcon sx={{ fontSize: 18 }} />,
    label: "Attendance",
    path: "/attendance/view-all-attendances",
  },
  {
    icon: <BadgeIcon sx={{ fontSize: 18 }} />,
    label: "KYC",
    path: "/kyc/complete-kyc",
  },
];

export function QuickActionsSection({
  borderColor,
  isDark,
  onNavigate,
}: {
  borderColor: string;
  isDark: boolean;
  onNavigate: (path: string) => void;
}) {
  return (
    <Box
      sx={{
        px: 2,
        pt: 1.25,
        pb: 1,
        borderBottom: `1px solid ${borderColor}`,
      }}
    >
      <SectionLabel>Quick Actions</SectionLabel>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 0.75,
        }}
      >
        {QUICK_ACTIONS.map((a) => (
          <ActionBtn
            key={a.label}
            icon={a.icon}
            label={a.label}
            onClick={() => onNavigate(a.path)}
            isDark={isDark}
          />
        ))}
      </Box>
    </Box>
  );
}
