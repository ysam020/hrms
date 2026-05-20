import React, { useContext, lazy, useMemo } from "react";
import Box from "@mui/material/Box";
import TrendingUp from "@mui/icons-material/TrendingUp";
import People from "@mui/icons-material/People";
import AttachMoney from "@mui/icons-material/AttachMoney";
import BusinessCenter from "@mui/icons-material/BusinessCenter";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import TabsPanel from "@web/shared/components/TabsPanel";

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

function Analytics() {
  const { theme } = useContext(ThemeContext);

  const tabData = useMemo(
    () => [
      {
        label: "Workforce",
        slug: "workforce",
        icon: <People />,
        component: (
          <Box sx={{ display: "grid", gap: 1 }}>
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
            <Box sx={{ display: "grid", gap: 1 }}>
              <EmployeeDesignations theme={theme} />
            </Box>
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
            <Box sx={{ display: "grid", gap: 1 }}>
              <JoiningInfo theme={theme} />
            </Box>
            <HeadcountGrowth theme={theme} />
          </Box>
        ),
      },
      {
        label: "Leave & Attendance",
        slug: "leave-attendance",
        icon: <TrendingUp />,
        component: (
          <Box sx={{ display: "grid", gap: 1 }}>
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
            <AttendanceTrends theme={theme} />
            <LeavePatternHeatmap theme={theme} />
          </Box>
        ),
      },
      {
        label: "Recruitment",
        slug: "recruitment",
        icon: <BusinessCenter />,
        component: (
          <Box sx={{ display: "grid", gap: 1 }}>
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
            <ApplicationsByRole theme={theme} />
            <HiringFunnel theme={theme} />
          </Box>
        ),
      },
      {
        label: "Salary",
        slug: "salary",
        icon: <AttachMoney />,
        component: (
          <Box sx={{ display: "grid", gap: 1 }}>
            <SalaryDistributionBox theme={theme} />
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
            <SalaryBandsHistogram theme={theme} />
          </Box>
        ),
      },
    ],
    [theme],
  );

  return (
    <TabsPanel
      tabData={tabData}
      tabKey="analytics_tab_value"
      basePath="/analytics"
    />
  );
}

export default React.memo(Analytics);
