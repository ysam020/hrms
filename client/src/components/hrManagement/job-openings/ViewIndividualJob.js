import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import Divider from "@mui/material/Divider";
import ListItemText from "@mui/material/ListItemText";
import Grid from "@mui/material/Grid";
import {
  MaterialReactTable,
  useMaterialReactTable,
} from "material-react-table";
import ScheduleInterviewModal from "./ScheduleInterviewModal";
import useTableConfig from "../../../hooks/useTableConfig";
import apiClient from "../../../config/axiosConfig";
import HiringModal from "./HiringModal";
import RejectModal from "./RejectModal";
import ErrorFallback from "../../customComponents/ErrorFallback";
import { ErrorBoundary } from "react-error-boundary";
import InfoModal from "./InfoModal";

import { Dropdown } from "primereact/dropdown";

function ViewIndividualJob() {
  const { _id } = useParams();
  const [data, setData] = useState(null);
  const [jobApplications, setJobApplications] = useState([]);
  const [statusFilter, setStatusFilter] = useState("All");

  const [applicantData, setApplicantData] = useState({});
  const [openInterviewModal, setOpenInterviewModal] = useState(false);
  const [openHiringModal, setOpenHiringModal] = useState(false);
  const [openRejectModal, setOpenRejectModal] = useState(false);
  const [openInfoModal, setOpenInfoModal] = useState(false);

  const handleOpenInterviewModal = (data) => {
    setApplicantData(data);
    setOpenInterviewModal(true);
  };
  const handleCloseInterviewModal = () => setOpenInterviewModal(false);
  const handleOpenHiringModal = (data) => {
    setApplicantData(data);
    setOpenHiringModal(true);
  };
  const handleCloseHiringModal = () => setOpenHiringModal(false);
  const handleOpenRejectModal = (data) => {
    setApplicantData(data);
    setOpenRejectModal(true);
  };
  const handleCloseRejectModal = () => setOpenRejectModal(false);
  const handleOpenInfoModal = (data) => {
    setApplicantData(data);
    setOpenInfoModal(true);
  };
  const handleCloseInfoModal = () => setOpenInfoModal(false);

  useEffect(() => {
    let isMounted = true;

    async function getData() {
      try {
        const res = await apiClient(`/view-job-opening/${_id}`);

        // Only update state if component is still mounted
        if (isMounted) {
          setData(res.data);
        }
      } catch (error) {
        console.error(error);
      }
    }

    getData();

    return () => {
      isMounted = false;
    };
  }, [_id]);

  // Modified getJobApplications to accept status parameter
  const getJobApplications = async () => {
    try {
      let url = `/view-applications/${_id}`;
      if (statusFilter) {
        url += `?status=${encodeURIComponent(statusFilter)}`;
      }
      const res = await apiClient(url);
      setJobApplications(res.data);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    getJobApplications(statusFilter);
    // eslint-disable-next-line
  }, [statusFilter, data, _id]);

  const columns = [
    { accessorKey: "name", header: "Name", size: 250 },
    { accessorKey: "mobile", header: "Mobile", size: 100 },
    { accessorKey: "email", header: "Email", size: 300 },
    {
      accessorKey: "resume",
      header: "Resume",
      size: 120,
      Cell: ({ cell }) => {
        const base64PDF = cell.row.original.resume;
        const handleDownload = () => {
          const link = document.createElement("a");
          link.href = `data:application/pdf;base64,${base64PDF}`;
          link.download = "Resume.pdf";
          link.click();
        };
        return base64PDF ? (
          <span onClick={handleDownload} className="link">
            Download
          </span>
        ) : null;
      },
    },
    { accessorKey: "status", header: "Status", size: 150 },
    {
      accessorKey: "scheduleInterviewDate",
      header: "Interview",
      size: 120,
      Cell: ({ cell }) => (
        <span
          className="link"
          onClick={() =>
            handleOpenInterviewModal({
              name: cell.row.original.name,
              email: cell.row.original.email,
              round: cell.row.original.interviews.length + 1,
            })
          }
        >
          Schedule
        </span>
      ),
    },
    {
      accessorKey: "action",
      header: "Actions",
      size: 220,
      Cell: ({ cell }) => (
        <>
          <span
            className="link info-link"
            onClick={() => handleOpenInfoModal(cell.row.original)}
          >
            View Details
          </span>
          <span
            className="link approve-link"
            onClick={() => handleOpenHiringModal(cell.row.original)}
          >
            Hire
          </span>
          <span
            className="link reject-link"
            onClick={() => handleOpenRejectModal(cell.row.original)}
          >
            Reject
          </span>
        </>
      ),
    },
  ];

  const baseConfig = useTableConfig(jobApplications, columns);

  const table = useMaterialReactTable({
    ...baseConfig,
    renderTopToolbarCustomActions: () => (
      <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
        <Dropdown
          value={statusFilter}
          options={[
            { label: "All Applications", value: "All" },
            { label: "Applied", value: "Applied" },
            { label: "Round 1 Scheduled", value: "Round 1 Scheduled" },
            { label: "Round 1 Rescheduled", value: "Round 1 Rescheduled" },
            { label: "Round 1 Completed", value: "Round 1 Completed" },
            { label: "Round 1 Cleared", value: "Round 1 Cleared" },
            { label: "Round 2 Scheduled", value: "Round 2 Scheduled" },
            { label: "Round 2 Rescheduled", value: "Round 2 Rescheduled" },
            { label: "Round 2 Completed", value: "Round 2 Completed" },
            { label: "Round 2 Cleared", value: "Round 2 Cleared" },
            { label: "Hired", value: "Hired" },
            { label: "Rejected", value: "Rejected" },
          ]}
          onChange={(e) => setStatusFilter(e.value)}
          placeholder="Filter by Status"
          style={{ minWidth: "200px" }}
        />
      </div>
    ),
  });

  return (
    <Grid container spacing={2} className="profile-container">
      <Grid item xs={12} md={6}>
        <List>
          <ListItem alignItems="flex-start">
            <ListItemText primary="Job Title" />
            <ListItemText secondary={data?.jobTitle} />
          </ListItem>
          <Divider />
          <ListItem alignItems="flex-start">
            <ListItemText primary="Job Posting Date" />
            <ListItemText
              secondary={new Date(data?.jobPostingDate).toLocaleDateString()}
            />
          </ListItem>
          <Divider />
          <ListItem alignItems="flex-start">
            <ListItemText primary="Application Deadline" />
            <ListItemText
              secondary={new Date(
                data?.applicationDeadline
              ).toLocaleDateString()}
            />
          </ListItem>
          <Divider />
          <ListItem alignItems="flex-start">
            <ListItemText primary="Job Description" />
            <ListItemText secondary={data?.jobDescription} />
          </ListItem>
          <Divider />
          <ListItem alignItems="flex-start">
            <ListItemText primary="Required Skills" />
            <ListItemText secondary={data?.requiredSkills} />
          </ListItem>
          <ListItem alignItems="flex-start">
            <ListItemText primary="Number of Vacancies" />
            <ListItemText secondary={data?.numberOfVacancies} />
          </ListItem>
        </List>
      </Grid>

      <Grid item xs={12} md={6}>
        <List>
          <ListItem>
            <ListItemText primary="Candidates Hired" />
            <ListItemText secondary={data?.candidatesHired} />
          </ListItem>
          <ListItem>
            <ListItemText primary="Required Experience" />
            <ListItemText secondary={`${data?.experience} Years`} />
          </ListItem>
          <Divider />
          <ListItem>
            <ListItemText primary="Location" />
            <ListItemText secondary={data?.location} />
          </ListItem>
          <Divider />
          <ListItem>
            <ListItemText primary="Budget" />
            <ListItemText
              secondary={
                data?.budget
                  ? `${data.budget[0]} - ${data.budget[1]} LPA`
                  : "N/A"
              }
            />
          </ListItem>
          <Divider />
          <ListItem>
            <ListItemText primary="Hiring Manager" />
            <ListItemText secondary={data?.hiringManager} />
          </ListItem>
        </List>
      </Grid>

      <Grid item xs={12}>
        <h3>Applications</h3>
        <ErrorBoundary fallback={<ErrorFallback />}>
          <MaterialReactTable table={table} />
        </ErrorBoundary>
      </Grid>

      <ScheduleInterviewModal
        open={openInterviewModal}
        handleClose={handleCloseInterviewModal}
        getJobApplications={() => getJobApplications(statusFilter)}
        applicantData={applicantData}
        _id={_id}
      />
      <HiringModal
        open={openHiringModal}
        handleClose={handleCloseHiringModal}
        applicantData={applicantData}
        _id={_id}
        jobTitle={data?.jobTitle}
      />
      <RejectModal
        open={openRejectModal}
        handleClose={handleCloseRejectModal}
        _id={_id}
        applicantData={applicantData}
        jobTitle={data?.jobTitle}
      />
      <InfoModal
        open={openInfoModal}
        handleClose={handleCloseInfoModal}
        jobTitle={data?.jobTitle}
        _id={_id}
        applicantData={applicantData}
        getJobApplications={() => getJobApplications(statusFilter)}
      />
    </Grid>
  );
}

export default React.memo(ViewIndividualJob);
