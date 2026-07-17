import { memo, useContext, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Paper from "@mui/material/Paper";
import Container from "@mui/material/Container";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Work from "@mui/icons-material/Work";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import JobDetails from "./JobDetails";
import JobApplications from "./JobApplications";
import ScheduleInterviewModal from "./ScheduleInterviewModal";
import useFetchData from "@web/shared/hooks/useFetchData";
import HiringModal from "./HiringModal";
import RejectModal from "./RejectModal";
import InfoModal from "./InfoModal";
import TabsPanel from "@web/shared/components/TabsPanel";
import CircularProgress from "@mui/material/CircularProgress";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";

function ViewIndividualJob() {
  const { _id } = useParams();
  const { setAlert } = useContext(AlertContext);
  const { user } = useContext(UserContext);
  const [statusFilter, setStatusFilter] = useState("All");
  const [applicationSearch, setApplicationSearch] = useState("");
  const [debouncedApplicationSearch, setDebouncedApplicationSearch] =
    useState("");
  const [applicantData, setApplicantData] = useState<any>({});
  const [openInterviewModal, setOpenInterviewModal] = useState(false);
  const [openHiringModal, setOpenHiringModal] = useState(false);
  const [openRejectModal, setOpenRejectModal] = useState(false);
  const [openInfoModal, setOpenInfoModal] = useState(false);

  // Fetch job opening details using custom hook
  const {
    data,
    loading: loadingJob,
    refetch: refetchJob,
  } = useFetchData(`/view-job-opening/${_id}`, "get", [_id], null, null);

  // Debounce the applicant search box before it drives a server round-trip —
  // mirrors the searchRef/debounceRef pattern used with useServerPagination
  // elsewhere, adapted to this file's plain useFetchData-driven fetch.
  useEffect(() => {
    const handle = setTimeout(
      () => setDebouncedApplicationSearch(applicationSearch),
      400,
    );
    return () => clearTimeout(handle);
  }, [applicationSearch]);

  const applicationsUrl = `/view-applications/${_id}?${new URLSearchParams({
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(debouncedApplicationSearch
      ? { search: debouncedApplicationSearch }
      : {}),
  }).toString()}`;

  // Fetch job applications using custom hook with status filter
  const { data: jobApplications, refetch: refetchApplications } = useFetchData(
    applicationsUrl,
    "get",
    [_id, statusFilter, debouncedApplicationSearch, data], // Include data to refetch when job data changes
    null,
    null,
  );

  // applicantData is a one-time snapshot taken when a modal is opened — it
  // never updates on its own. getJobApplications() refetches jobApplications
  // after every status change, but a modal left open (or reopened for the
  // same candidate) kept showing that stale snapshot since its reference
  // never changed, so InfoModal's sync effect never re-ran. Re-derive from
  // the latest fetched row whenever one matches, falling back to the
  // snapshot (e.g. if the row briefly drops out of the current status filter).
  const liveApplicantData = useMemo(() => {
    if (!applicantData?.id) return applicantData;
    const fresh = (jobApplications || []).find(
      (a: any) => a.id === applicantData.id,
    );
    return fresh ? { ...applicantData, ...fresh } : applicantData;
  }, [jobApplications, applicantData]);

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

  const getJobApplications = () => {
    refetchApplications();
    refetchJob();
  };

  const handleCopyApplyLink = () => {
    if (!user?.tenantSlug || !_id) return;
    const link = `${window.location.origin}/careers/${user.tenantSlug}/apply/${_id}`;
    navigator.clipboard.writeText(link);
    setAlert({ open: true, message: "Apply link copied", severity: "success" });
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
          searchTerm={applicationSearch}
          setSearchTerm={setApplicationSearch}
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
            {user?.tenantSlug && (
              <Tooltip title="Copy public apply link">
                <IconButton
                  onClick={handleCopyApplyLink}
                  size="small"
                  sx={{ color: "inherit" }}
                  aria-label="Copy public apply link"
                >
                  <ContentCopyIcon sx={{ fontSize: 20 }} />
                </IconButton>
              </Tooltip>
            )}
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
        applicantData={liveApplicantData}
        _id={_id}
      />
      <HiringModal
        open={openHiringModal}
        handleClose={handleCloseHiringModal}
        applicantData={liveApplicantData}
        _id={_id}
        jobTitle={data?.jobTitle}
        getJobApplications={getJobApplications}
      />
      <RejectModal
        open={openRejectModal}
        handleClose={handleCloseRejectModal}
        _id={_id}
        applicantData={liveApplicantData}
        jobTitle={data?.jobTitle}
        getJobApplications={getJobApplications}
      />
      <InfoModal
        open={openInfoModal}
        handleClose={handleCloseInfoModal}
        jobTitle={data?.jobTitle}
        _id={_id}
        applicantData={liveApplicantData}
        getJobApplications={getJobApplications}
      />
    </Container>
  );
}

export default memo(ViewIndividualJob);
