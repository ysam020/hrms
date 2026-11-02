import { useTransitionNavigate } from "@next/motion";
import { Button, Page } from "@next/ui";
import { MyMonth } from "./components/MyMonth";
import { LeaveApplications } from "./components/LeaveApplications";
import { TeamAttendance } from "./components/TeamAttendance";
import { Correction } from "./components/Correction";
import { ApplyLeave } from "./components/ApplyLeave";

// Attendance & Leave pages (one per sidebar entry, Classic's paths):
//   /attendance                          My Attendance
//   /attendance/view-all-attendances     All Attendance
//   /attendance/attendance-correction    Corrections
//   /attendance/view-leave-applications  Leave Applications
//   /attendance/apply-leave              Apply for Leave

export function MyAttendancePage() {
  return (
    <Page
      title="My Attendance"
      description="Your punches, hours and time away for the month."
    >
      <MyMonth />
    </Page>
  );
}

export function AllAttendancePage() {
  return (
    <Page title="All Attendance">
      <TeamAttendance />
    </Page>
  );
}

export function CorrectionsPage() {
  return (
    <Page
      title="Attendance Corrections"
      width="wide"
      description="Fix a missed or wrong punch. Corrections count toward the employee’s monthly allowance, shown once you choose them."
    >
      <Correction />
    </Page>
  );
}

export function LeaveApplicationsPage() {
  const navigate = useTransitionNavigate();
  return (
    <Page
      title="Leave Applications"
      actions={
        <Button
          variant="primary"
          icon="plus"
          onClick={() => navigate("/attendance/apply-leave")}
          data-tour="leave-apply"
        >
          Apply for Leave
        </Button>
      }
    >
      <LeaveApplications />
    </Page>
  );
}

export function ApplyLeavePage() {
  const navigate = useTransitionNavigate();
  return (
    <Page
      title="Apply for Leave"
      width="wide"
      description="Request time off. It goes to your approver for a decision once you submit."
      back={{
        to: "/attendance/view-leave-applications",
        label: "Leave Applications",
      }}
    >
      <ApplyLeave
        inline
        open
        onClose={() => navigate(-1)}
        onApplied={() => navigate("/attendance/view-leave-applications")}
      />
    </Page>
  );
}

export { ApplyLeave };
