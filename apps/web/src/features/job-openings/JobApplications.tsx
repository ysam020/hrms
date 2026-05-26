import type { MRT_DensityState } from "material-react-table";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Person from "@mui/icons-material/Person";
import Container from "@mui/material/Container";
import IconButton from "@mui/material/IconButton";
import Chip from "@mui/material/Chip";
import Tooltip from "@mui/material/Tooltip";
import FilterList from "@mui/icons-material/FilterList";
import Info from "@mui/icons-material/Info";
import FileDownload from "@mui/icons-material/FileDownload";
import EventIcon from "@mui/icons-material/Event";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import { useContext } from "react";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import {
  MaterialReactTable,
  useMaterialReactTable,
} from "material-react-table";
import useTableConfig from "@web/shared/hooks/useTableConfig";
import ErrorFallback from "@web/shared/components/ErrorFallback";
import { ErrorBoundary } from "react-error-boundary";
import { Dropdown } from "primereact/dropdown";
import { interviewStatus } from "@web/assets/data/interviewStatus";

const JobApplications = (props) => {
  const { theme } = useContext(ThemeContext);

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
      accessorKey: "name",
      header: "Applicant",
      size: 250,
      Cell: ({ cell }) => (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Person
            sx={{ fontSize: 14, color: "text.secondary", opacity: 0.6 }}
          />
          <Typography variant="body2" fontSize="0.8rem" fontWeight={500}>
            {cell.getValue()}
          </Typography>
        </Box>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      size: 120,
      Cell: ({ cell }) => getStatusChip(cell.getValue()),
    },
    {
      accessorKey: "resume",
      header: "Resume",
      size: 120,
      enableSorting: false,
      Cell: ({ cell }) => {
        const base64PDF = cell.row.original.resume;
        const handleDownload = () => {
          const link = document.createElement("a");
          link.href = base64PDF;
          link.download = `${cell.row.original.name}_Resume.pdf`;
          link.click();
        };
        return base64PDF ? (
          <Tooltip title="Download resume">
            <IconButton
              size="small"
              aria-label={`Download resume for ${cell.row.original.name}`}
              onClick={handleDownload}
              sx={{
                width: 28,
                height: 28,
                borderRadius: "6px",
                color: theme === "light" ? "#059669" : "#34d399",
                backgroundColor:
                  theme === "light"
                    ? "rgba(16, 185, 129, 0.12)"
                    : "rgba(52, 211, 153, 0.15)",
                "&:hover": {
                  backgroundColor:
                    theme === "light"
                      ? "rgba(16, 185, 129, 0.2)"
                      : "rgba(52, 211, 153, 0.25)",
                },
              }}
            >
              <FileDownload sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        ) : (
          <Typography variant="caption" fontSize="0.7rem" color="text.disabled">
            —
          </Typography>
        );
      },
    },
    {
      accessorKey: "interview",
      header: "Interview",
      size: 150,
      enableSorting: false,
      Cell: ({ cell }) => (
        <Tooltip title="Schedule interview">
          <IconButton
            size="small"
            aria-label={`Schedule interview for ${cell.row.original.name}`}
            onClick={() =>
              props.handleOpenInterviewModal({
                ...cell.row.original,
                round: cell.row.original.interviews?.length + 1 || 1,
              })
            }
            sx={{
              width: 28,
              height: 28,
              borderRadius: "6px",
              color: theme === "light" ? "#6366f1" : "#818cf8",
              backgroundColor:
                theme === "light"
                  ? "rgba(99, 102, 241, 0.12)"
                  : "rgba(129, 140, 248, 0.15)",
              "&:hover": {
                backgroundColor:
                  theme === "light"
                    ? "rgba(99, 102, 241, 0.2)"
                    : "rgba(129, 140, 248, 0.25)",
              },
            }}
          >
            <EventIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      ),
    },
    {
      accessorKey: "actions",
      header: "Actions",
      size: 120,
      enableSorting: false,
      Cell: ({ cell }) => (
        <Box sx={{ display: "flex", gap: 0.5 }}>
          <Tooltip title="Hire candidate">
            <IconButton
              size="small"
              aria-label={`Hire ${cell.row.original.name}`}
              onClick={() => props.handleOpenHiringModal(cell.row.original)}
              sx={{
                width: 28,
                height: 28,
                borderRadius: "6px",
                color: theme === "light" ? "#059669" : "#34d399",
                backgroundColor:
                  theme === "light"
                    ? "rgba(16, 185, 129, 0.12)"
                    : "rgba(52, 211, 153, 0.15)",
                "&:hover": {
                  backgroundColor:
                    theme === "light"
                      ? "rgba(16, 185, 129, 0.2)"
                      : "rgba(52, 211, 153, 0.25)",
                },
              }}
            >
              <CheckCircleIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Reject candidate">
            <IconButton
              size="small"
              aria-label={`Reject ${cell.row.original.name}`}
              onClick={() => props.handleOpenRejectModal(cell.row.original)}
              sx={{
                width: 28,
                height: 28,
                borderRadius: "6px",
                color: theme === "light" ? "#dc2626" : "#f87171",
                backgroundColor:
                  theme === "light"
                    ? "rgba(239, 68, 68, 0.12)"
                    : "rgba(248, 113, 113, 0.15)",
                "&:hover": {
                  backgroundColor:
                    theme === "light"
                      ? "rgba(239, 68, 68, 0.2)"
                      : "rgba(248, 113, 113, 0.25)",
                },
              }}
            >
              <CancelIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        </Box>
      ),
    },
    {
      accessorKey: "info",
      header: "Details",
      size: 100,
      enableSorting: false,
      Cell: ({ cell }) => {
        const handleClick = () => {
          props.handleOpenInfoModal(cell.row.original);
        };

        return (
          <Tooltip title="View applicant details">
            <IconButton
              onClick={handleClick}
              size="small"
              aria-label={`View details for ${cell.row.original.name}`}
              sx={{
                width: 28,
                height: 28,
                borderRadius: "6px",
                color: theme === "light" ? "#6366f1" : "#818cf8",
                backgroundColor:
                  theme === "light"
                    ? "rgba(99, 102, 241, 0.12)"
                    : "rgba(129, 140, 248, 0.15)",
                "&:hover": {
                  backgroundColor:
                    theme === "light"
                      ? "rgba(99, 102, 241, 0.2)"
                      : "rgba(129, 140, 248, 0.25)",
                },
              }}
            >
              <Info sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        );
      },
    },
  ];

  const { table: baseConfig } = useTableConfig(
    props.jobApplications,
    columns,
    false,
  );

  const table = useMaterialReactTable({
    ...baseConfig,
    initialState: {
      ...baseConfig.initialState,
      density: "compact" as MRT_DensityState,
    },
    muiTableProps: {
      sx: {
        "& .MuiTableCell-root": {
          padding: "8px 12px",
        },
      },
    },
    renderTopToolbarCustomActions: () => (
      <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <FilterList
            sx={{ fontSize: 18, color: "text.secondary", opacity: 0.7 }}
          />
          <Typography variant="body2" fontSize="0.8rem" color="text.secondary">
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
            appendTo={() => document.querySelector("#root .App") as HTMLElement}
          />
        </Box>
      </Box>
    ),
  });

  return (
    <ErrorBoundary fallback={<ErrorFallback />}>
      <Container maxWidth="xl" sx={{ p: 0 }}>
        <MaterialReactTable table={table} />
      </Container>
    </ErrorBoundary>
  );
};

export default JobApplications;
