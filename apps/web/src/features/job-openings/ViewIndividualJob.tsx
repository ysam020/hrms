import React, { useState } from "react";
import { useParams } from "react-router-dom";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Paper from "@mui/material/Paper";
import Container from "@mui/material/Container";
import Chip from "@mui/material/Chip";
import Work from "@mui/icons-material/Work";
import JobDetails from "./JobDetails";
import JobApplications from "./JobApplications";
import ScheduleInterviewModal from "./ScheduleInterviewModal";
import useFetchData from "@web/shared/hooks/useFetchData";
import HiringModal from "./HiringModal";
import RejectModal from "./RejectModal";
import InfoModal from "./InfoModal";
import TabsPanel from "@web/shared/components/TabsPanel";
import CircularProgress from "@mui/material/CircularProgress";

function ViewIndividualJob() {
  const { _id } = useParams();
  const [statusFilter, setStatusFilter] = useState("All");
  const [applicantData, setApplicantData] = useState({});
  const [openInterviewModal, setOpenInterviewModal] = useState(false);
  const [openHiringModal, setOpenHiringModal] = useState(false);
  const [openRejectModal, setOpenRejectModal] = useState(false);
  const [openInfoModal, setOpenInfoModal] = useState(false);

  // Fetch job opening details using custom hook
  const { data, loading: loadingJob } = useFetchData(
    `/view-job-opening/${_id}`,
    "get",
    [_id],
    null,
    null,
  );

  // Build the applications URL with status filter
  const applicationsUrl = `/view-applications/${_id}${
    statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : ""
  }`;

  // Fetch job applications using custom hook with status filter
  const { data: jobApplications, refetch: refetchApplications } = useFetchData(
    applicationsUrl,
    "get",
    [_id, statusFilter, data], // Include data to refetch when job data changes
    null,
    null,
  );

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

  // Use the refetch function instead of getJobApplications
  const getJobApplications = () => {
    refetchApplications();
  };

  if (loadingJob) {
    return (
      <Container maxWidth="xl" sx={{ p: 0 }}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            p: 4,
          }}
        >
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  if (!data) {
    return (
      <Container maxWidth="xl" sx={{ p: 0 }}>
        <Box sx={{ display: "flex", justifyContent: "center" }}>
          <Typography>Job not found</Typography>
        </Box>
      </Container>
    );
  }

  const tabData = [
    {
      label: "Job Details",
      component: (
        <JobDetails {...data} jobApplications={jobApplications || []} />
      ),
    },
    {
      label: "Applications",
      component: (
        <JobApplications
          jobApplications={jobApplications || []}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          handleOpenInterviewModal={handleOpenInterviewModal}
          handleOpenHiringModal={handleOpenHiringModal}
          handleOpenRejectModal={handleOpenRejectModal}
          handleOpenInfoModal={handleOpenInfoModal}
        />
      ),
    },
  ];

  return (
    <Container maxWidth="xl" sx={{ p: 0 }}>
      <Paper
        elevation={3}
        sx={{
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <Box
          sx={{
            background: "background.paper",
            color: "white",
            p: 3,
          }}
        >
          <Stack direction="row" alignItems="center" spacing={2}>
            <Work sx={{ fontSize: 32 }} />
            <Box sx={{ flex: 1 }}>
              <Typography variant="h4" fontWeight={600} gutterBottom>
                {data?.jobTitle}
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap">
                <Chip
                  label={`${data?.candidatesHired || 0}/${
                    data?.numberOfVacancies || 0
                  } Hired`}
                  color={
                    data?.candidatesHired === data?.numberOfVacancies
                      ? "success"
                      : "warning"
                  }
                  size="small"
                />
                <Chip
                  label={`${jobApplications?.length || 0} Applications`}
                  color="info"
                  size="small"
                />
              </Stack>
            </Box>
          </Stack>
        </Box>

        {/* TabsPanel Content */}
        <Box sx={{ p: 0 }}>
          <TabsPanel tabData={tabData} tabKey="view_individual_job_tab_value" />
        </Box>
      </Paper>

      <ScheduleInterviewModal
        open={openInterviewModal}
        handleClose={handleCloseInterviewModal}
        getJobApplications={getJobApplications}
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
        getJobApplications={getJobApplications}
      />
    </Container>
  );
}

export default React.memo(ViewIndividualJob);
