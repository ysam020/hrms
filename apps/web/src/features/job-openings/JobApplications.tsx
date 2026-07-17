import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Person from "@mui/icons-material/Person";
import Container from "@mui/material/Container";
import Chip from "@mui/material/Chip";
import FilterList from "@mui/icons-material/FilterList";
import Info from "@mui/icons-material/Info";
import FileDownload from "@mui/icons-material/FileDownload";
import EventIcon from "@mui/icons-material/Event";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import { useContext } from "react";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import { UserContext } from "@web/app/providers/UserContext";
import DataList from "@web/shared/components/DataList";
import ErrorFallback from "@web/shared/components/ErrorFallback";
import { ErrorBoundary } from "react-error-boundary";
import { Dropdown } from "primereact/dropdown";
import { interviewStatus } from "@web/assets/data/interviewStatus";
import hasPermission from "@web/shared/utils/permissions/hasPermission";

const JobApplications = (props) => {
  const { theme } = useContext(ThemeContext);
  const { user } = useContext(UserContext);
  const canViewApplications = hasPermission(
    "JobOpenings",
    "view_applications",
    "-",
    user?.isSuperUser,
    user?.permissions || [],
  );
  const canScheduleInterview = hasPermission(
    "JobOpenings",
    "schedule_interview",
    "-",
    user?.isSuperUser,
    user?.permissions || [],
  );
  const canHire = hasPermission(
    "JobOpenings",
    "hire_candidate",
    "-",
    user?.isSuperUser,
    user?.permissions || [],
  );
  const canReject = hasPermission(
    "JobOpenings",
    "reject_candidate",
    "-",
    user?.isSuperUser,
    user?.permissions || [],
  );

  const getStatusChip = (status) => {
    const statusMap = {
      Hired: {
        color: theme === "light" ? "#059669" : "#34d399",
        bg:
          theme === "light"
            ? "rgba(16, 185, 129, 0.15)"
            : "rgba(52, 211, 153, 0.2)",
        label: "Hired",
      },
      Rejected: {
        color: theme === "light" ? "#dc2626" : "#f87171",
        bg:
          theme === "light"
            ? "rgba(239, 68, 68, 0.15)"
            : "rgba(248, 113, 113, 0.2)",
        label: "Rejected",
      },
      Applied: {
        color: theme === "light" ? "#6366f1" : "#818cf8",
        bg:
          theme === "light"
            ? "rgba(99, 102, 241, 0.15)"
            : "rgba(129, 140, 248, 0.2)",
        label: "Applied",
      },
      Interviewing: {
        color: theme === "light" ? "#d97706" : "#fbbf24",
        bg:
          theme === "light"
            ? "rgba(251, 191, 36, 0.15)"
            : "rgba(251, 191, 36, 0.2)",
        label: "Interviewing",
      },
    };

    const config = statusMap[status] || statusMap.Applied;

    return (
      <Chip
        label={config.label}
        size="small"
        sx={{
          backgroundColor: config.bg,
          color: config.color,
          fontWeight: 500,
          fontSize: "0.7rem",
          height: "22px",
          borderRadius: "4px",
          "& .MuiChip-label": {
            padding: "0 8px",
          },
        }}
      />
    );
  };

  const columns = [
    {
      key: "name",
      label: "Applicant",
      primary: true,
      hideLabel: true,
      render: (row: any) => (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Person
            sx={{ fontSize: 14, color: "text.secondary", opacity: 0.6 }}
          />
          <Typography variant="body2" fontSize="0.8rem" fontWeight={500}>
            {row.name}
          </Typography>
        </Box>
      ),
    },
    {
      key: "status",
      label: "Status",
      hideLabel: true,
      render: (row: any) => getStatusChip(row.status),
    },
  ];

  const actions = (row: any) => {
    const list: any[] = [];
    // Hired/Rejected are terminal — scheduling, hiring, or rejecting again
    // has no valid next step, so those actions are omitted entirely rather
    // than shown disabled. Mirrors the server-side guards in
    // updateApplicationStatus.ts / scheduleInterview / rescheduleInterview.
    const isTerminal = row.status === "Hired" || row.status === "Rejected";
    if (row.resume && canViewApplications) {
      list.push({
        icon: <FileDownload sx={{ fontSize: 16 }} />,
        label: `Download resume for ${row.name}`,
        color: "success" as const,
        onClick: () => {
          const link = document.createElement("a");
          link.href = row.resume;
          link.download = `${row.name}_Resume.pdf`;
          link.click();
        },
      });
    }
    if (canScheduleInterview && !isTerminal) {
      list.push({
        icon: <EventIcon sx={{ fontSize: 16 }} />,
        label: `Schedule interview for ${row.name}`,
        color: "primary" as const,
        // ScheduleInterviewModal computes the round number itself from
        // row.interviews — passing it here got stale once a round was
        // rescheduled (array length didn't track round count correctly).
        onClick: () => props.handleOpenInterviewModal(row),
      });
    }
    // Hiring requires at least one round to have been Completed and
    // Cleared — mirrors the authoritative server-side guard in
    // updateApplicationStatus.ts. Omitted entirely rather than shown
    // disabled, since there's no useful next step from this row until a
    // round is actually scheduled and cleared via Interview Details.
    const hasClearedRound = (row.interviews || []).some(
      (i: any) => i.interviewConducted && i.cleared,
    );
    if (hasClearedRound && canHire && !isTerminal) {
      list.push({
        icon: <CheckCircleIcon sx={{ fontSize: 16 }} />,
        label: `Hire ${row.name}`,
        color: "success" as const,
        onClick: () => props.handleOpenHiringModal(row),
      });
    }
    if (canReject && !isTerminal) {
      list.push({
        icon: <CancelIcon sx={{ fontSize: 16 }} />,
        label: `Reject ${row.name}`,
        color: "error" as const,
        onClick: () => props.handleOpenRejectModal(row),
      });
    }
    if (canViewApplications) {
      list.push({
        icon: <Info sx={{ fontSize: 16 }} />,
        label: `View details for ${row.name}`,
        onClick: () => props.handleOpenInfoModal(row),
      });
    }
    return list;
  };

  return (
    <ErrorBoundary fallback={<ErrorFallback />}>
      <Container maxWidth="xl" sx={{ p: 0 }}>
        <DataList
          ariaLabel="Job applications"
          data={props.jobApplications || []}
          columns={columns}
          actions={actions}
          emptyMessage="No applications found"
          search={{
            value: props.searchTerm,
            onChange: props.setSearchTerm,
            placeholder: "Search applicants…",
          }}
          toolbarActions={
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <FilterList
                  sx={{ fontSize: 18, color: "text.secondary", opacity: 0.7 }}
                />
                <Typography
                  variant="body2"
                  fontSize="0.8rem"
                  color="text.secondary"
                >
                  Filter by status:
                </Typography>
              </Box>
              <Box sx={{ minWidth: 120 }}>
                <Dropdown
                  value={props.statusFilter}
                  onChange={(e) => props.setStatusFilter(e.value)}
                  options={interviewStatus}
                  placeholder="Select Status"
                  className="w-full"
                  style={{ minWidth: "120px" }}
                  appendTo={() =>
                    document.querySelector("#root .App") as HTMLElement
                  }
                />
              </Box>
            </Box>
          }
        />
      </Container>
    </ErrorBoundary>
  );
};

export default JobApplications;
