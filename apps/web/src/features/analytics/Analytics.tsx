import React, { useContext, lazy, Suspense, useMemo, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Paper from "@mui/material/Paper";
import CircularProgress from "@mui/material/CircularProgress";
import TrendingUp from "@mui/icons-material/TrendingUp";
import People from "@mui/icons-material/People";
import AttachMoney from "@mui/icons-material/AttachMoney";
import BusinessCenter from "@mui/icons-material/BusinessCenter";
import { ThemeContext } from "@web/app/providers/ThemeContext";

// Lazy-loaded chart components
const LeaveApprovalGauge = lazy(() => import("./charts/LeaveApprovalGauge"));
const AttendanceTrends = lazy(() => import("./charts/AttendanceTrends"));
const WorkingHoursHistogram = lazy(
  () => import("./charts/WorkingHoursHistogram"),
);
const LeaveTypeBar = lazy(() => import("./charts/LeaveTypeBar"));
const LeavePatternHeatmap = lazy(() => import("./charts/LeavePatternHeatmap"));
const JobStatusPie = lazy(() => import("./charts/JobStatusPie"));
const ApplicationsByRole = lazy(() => import("./charts/ApplicationsByRole"));
const HiringFunnel = lazy(() => import("./charts/HiringFunnel"));
const HiringManagerTable = lazy(() => import("./charts/HiringManagerTable"));
const SalaryDistributionBox = lazy(
  () => import("./charts/SalaryDistributionBox"),
);
const CompensationBreakdown = lazy(
  () => import("./charts/CompensationBreakdown"),
);
const SalaryByDesignation = lazy(() => import("./charts/SalaryByDesignation"));
const SalaryBandsHistogram = lazy(
  () => import("./charts/SalaryBandsHistogram"),
);
const EmployeeStatusPie = lazy(() => import("./charts/EmployeeStatusPie"));
const EmploymentTypeBreakdown = lazy(
  () => import("./charts/EmploymentTypeBreakdown"),
);
const TenureDistribution = lazy(() => import("./charts/TenureDistribution"));
const HeadcountGrowth = lazy(() => import("./charts/HeadcountGrowth"));
const EmployeeDepartments = lazy(() => import("./charts/EmployeeDepartments"));
const EmployeeDesignations = lazy(
  () => import("./charts/EmployeeDesignations"),
);
const AgeDistribution = lazy(() => import("./charts/AgeDistribution"));
const JoiningInfo = lazy(() => import("./charts/JoiningInfo"));

const Loader = () => (
  <Box
    sx={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      py: 4,
    }}
  >
    <CircularProgress size={28} />
  </Box>
);

function TabPanel({ children, value, index }) {
  const isActive = value === index;
  return (
    <div role="tabpanel" hidden={!isActive}>
      {isActive && <Box sx={{ py: 1 }}>{children}</Box>}
    </div>
  );
}

const tabSlugs = ["workforce", "leave-attendance", "recruitment", "salary"];

function Analytics() {
  const { theme } = useContext(ThemeContext);
  const navigate = useNavigate();
  const location = useLocation();

  const activeTab = useMemo(() => {
    const slug = location.pathname.split("/").pop();
    const index = tabSlugs.indexOf(slug || "");
    return index >= 0 ? index : 0;
  }, [location.pathname]);

  useEffect(() => {
    const parts = location.pathname.split("/").filter(Boolean);
    if (parts.length < 2 || !tabSlugs.includes(parts[1])) {
      const savedSlug = localStorage.getItem("analytics_tab_value");
      const targetSlug =
        savedSlug && tabSlugs.includes(savedSlug) ? savedSlug : tabSlugs[0];
      navigate(`/analytics/${targetSlug}`, { replace: true });
    }
  }, [location.pathname, navigate]);

  const handleTabChange = (event, newValue) => {
    const slug = tabSlugs[newValue];
    localStorage.setItem("analytics_tab_value", slug);
    navigate(`/analytics/${slug}`);
  };

  const tabs = [
    { label: "Workforce", icon: <People /> },
    { label: "Leave & Attendance", icon: <TrendingUp /> },
    { label: "Recruitment", icon: <BusinessCenter /> },
    { label: "Salary", icon: <AttachMoney /> },
  ];

  return (
    <Container maxWidth="xl">
      {/* Tabs */}
      <Paper elevation={1}>
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          variant="scrollable"
          scrollButtons="auto"
        >
          {tabs.map((tab, index) => (
            <Tab
              key={index}
              label={tab.label}
              icon={tab.icon}
              iconPosition="start"
            />
          ))}
        </Tabs>
      </Paper>

      {/* Workforce Analytics (lazy-loaded when this tab is active) */}
      <TabPanel value={activeTab} index={0}>
        <Suspense fallback={<Loader />}>
          <Box sx={{ display: "grid", gap: 1 }}>
            {/* Row 1: Existing charts */}
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" },
                gap: 1,
              }}
            >
              <EmploymentTypeBreakdown theme={theme} />
              <AgeDistribution theme={theme} />
              <EmployeeStatusPie theme={theme} />
            </Box>

            {/* Row 2: Status and Diversity */}
            <Box sx={{ display: "grid", gap: 1 }}>
              <EmployeeDesignations theme={theme} />
            </Box>

            {/* Row 3: Age and Employment Type */}
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)" },
                gap: 1,
              }}
            >
              <EmployeeDepartments theme={theme} />
              <TenureDistribution theme={theme} />
            </Box>

            {/* Row 4: Tenure and Growth */}
            <Box sx={{ display: "grid", gap: 1 }}>
              <JoiningInfo theme={theme} />
            </Box>

            {/* Row 5: Headcount Growth - Full Width */}
            <HeadcountGrowth theme={theme} />
          </Box>
        </Suspense>
      </TabPanel>

      {/* Leave & Attendance Analytics (lazy-loaded when this tab is active) */}
      <TabPanel value={activeTab} index={1}>
        <Suspense fallback={<Loader />}>
          <Box sx={{ display: "grid", gap: 1 }}>
            {/* Row 1: Balance and Approval */}
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" },
                gap: 1,
              }}
            >
              <LeaveApprovalGauge theme={theme} />
              <LeaveTypeBar theme={theme} />
              <WorkingHoursHistogram theme={theme} />
            </Box>

            {/* Row 2: Attendance Trends - Full Width */}
            <AttendanceTrends theme={theme} />

            {/* Row 3: Working Hours and Leave Type (kept empty in original) */}
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)" },
                gap: 1,
              }}
            ></Box>

            {/* Row 4: Leave Pattern Heatmap - Full Width */}
            <LeavePatternHeatmap theme={theme} />
          </Box>
        </Suspense>
      </TabPanel>

      {/* Recruitment Analytics (lazy-loaded when this tab is active) */}
      <TabPanel value={activeTab} index={2}>
        <Suspense fallback={<Loader />}>
          <Box sx={{ display: "grid", gap: 1 }}>
            {/* Row 1: Job Status and Time to Fill */}
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)" },
                gap: 1,
              }}
            >
              <JobStatusPie theme={theme} />
              <HiringManagerTable theme={theme} />
            </Box>

            {/* Row 2: Applications by Role - Full Width */}
            <ApplicationsByRole theme={theme} />

            {/* Row 3: Hiring Funnel - Full Width */}
            <HiringFunnel theme={theme} />
          </Box>
        </Suspense>
      </TabPanel>

      {/* Salary Analytics (lazy-loaded when this tab is active) */}
      <TabPanel value={activeTab} index={3}>
        <Suspense fallback={<Loader />}>
          <Box sx={{ display: "grid", gap: 1 }}>
            {/* Row 1: Salary Distribution - Full Width */}
            <SalaryDistributionBox theme={theme} />

            {/* Row 2: Compensation and Salary by Designation */}
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)" },
                gap: 1,
              }}
            >
              <CompensationBreakdown theme={theme} />
              <SalaryByDesignation theme={theme} />
            </Box>

            {/* Row 3: Salary Bands - Full Width */}
            <SalaryBandsHistogram theme={theme} />
          </Box>
        </Suspense>
      </TabPanel>
    </Container>
  );
}

export default React.memo(Analytics);
