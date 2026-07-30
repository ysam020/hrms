import { Suspense, lazy, memo, useContext, type ReactNode } from "react";
import Box from "@mui/material/Box";
import useMediaQuery from "@mui/material/useMediaQuery";
import Skeleton from "@mui/material/Skeleton";
import { ErrorBoundary } from "react-error-boundary";
import ErrorFallback from "@web/shared/components/ErrorFallback";
import { UserContext } from "@web/app/providers/UserContext";
import { DashboardProvider } from "@web/app/providers/DashboardContext";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import "../../styles/dashboard.scss";

// Lazy-loaded widgets
const HrActivities = lazy(() => import("./HrActivities"));
const AttendanceCalendar = lazy(() => import("./AttendanceCalendar"));
const QuickStats = lazy(() => import("./QuickStats"));
const PendingApprovals = lazy(() => import("./PendingApprovals"));
const MyWorkspace = lazy(() => import("./MyWorkspace"));
const KycStatus = lazy(() => import("./KycStatus"));
const JobOpeningsList = lazy(() => import("./JobOpeningsList"));
const BirthdayAnniversary = lazy(() => import("./BirthdayAnniversary"));
const DepartmentBreakdown = lazy(() => import("./DepartmentBreakdown"));
const WorkforceStatus = lazy(() => import("./WorkforceStatus"));

const RIGHT_PANEL_WIDTH = 270;

// Fixed dashboard arrangement — span is out of a 12-column grid, height in px.
// Each row's spans sum to 12, so items simply flow in this order.
const WIDGETS = [
  { id: "quickStats", span: 6, height: 108 },
  { id: "workforceStatus", span: 6, height: 108 },
  { id: "attendanceCalendar", span: 12, height: 108 },
  { id: "hrActivities", span: 6, height: 224 },
  { id: "pendingApprovals", span: 3, height: 224 },
  { id: "kycStatus", span: 3, height: 224 },
  { id: "jobOpeningsList", span: 4, height: 282 },
  { id: "birthdayAnniversary", span: 5, height: 282 },
  { id: "departmentBreakdown", span: 3, height: 282 },
];

const WidgetSkeleton = () => (
  <Box sx={{ p: 1, height: "100%", width: "100%" }}>
    <Skeleton variant="rounded" height="100%" animation="wave" />
  </Box>
);

function renderWidget(id) {
  switch (id) {
    case "quickStats":
      return <QuickStats />;
    case "attendanceCalendar":
      return <AttendanceCalendar />;
    case "hrActivities":
      return <HrActivities />;
    case "pendingApprovals":
      return <PendingApprovals />;
    case "kycStatus":
      return <KycStatus />;
    case "jobOpeningsList":
      return <JobOpeningsList />;
    case "birthdayAnniversary":
      return <BirthdayAnniversary />;
    case "departmentBreakdown":
      return <DepartmentBreakdown />;
    case "workforceStatus":
      return <WorkforceStatus />;
    default:
      return null;
  }
}

const WidgetCard = memo(
  ({ isDark, children }: { isDark: boolean; children: ReactNode }) => (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        borderRadius: 2,
        overflow: "hidden",
        boxShadow: isDark
          ? "0 1px 3px rgba(0,0,0,0.35)"
          : "0 1px 4px rgba(0,0,0,0.08)",
        bgcolor: isDark ? "#212e35" : "#fff",
      }}
    >
      <Box sx={{ flex: 1, overflow: "hidden" }}>{children}</Box>
    </Box>
  ),
);

const RightPanel = memo(({ isDark }: { isDark: boolean }) => {
  const isMobile = useMediaQuery("(max-width:767px)");
  return (
    <Box
      sx={{
        width: isMobile ? "100%" : RIGHT_PANEL_WIDTH,
        maxHeight: isMobile ? "none" : "100%",
        display: "flex",
        flexDirection: "column",
        borderRadius: 2,
        border: `1px solid ${isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)"}`,
        bgcolor: isDark ? "#1c262a" : "#fff",
        overflowY: isMobile ? "visible" : "auto",
        boxShadow: isDark
          ? "0 1px 3px rgba(0,0,0,0.35)"
          : "0 1px 4px rgba(0,0,0,0.08)",
      }}
    >
      <ErrorBoundary fallback={<ErrorFallback />}>
        <Suspense fallback={<WidgetSkeleton />}>
          <MyWorkspace isDark={isDark} />
        </Suspense>
      </ErrorBoundary>
    </Box>
  );
});

// 10px mainBox paddingTop + 64px MUI Toolbar (AppBar default height on desktop)
const APPBAR_OFFSET = 74;

function DashboardInner() {
  const { theme } = useContext(ThemeContext);
  const isDark = theme === "dark";
  const isMobile = useMediaQuery("(max-width:767px)");

  return (
    <Box
      className="dashboard dashboard-height-transition"
      data-dark={isDark ? "true" : undefined}
      sx={{
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        height: isMobile ? "auto" : `calc(100vh - ${APPBAR_OFFSET})`,
        overflow: isMobile ? "visible" : "hidden",
        bgcolor: isDark ? "#111B21" : "#F9FAFB",
      }}
    >
      {/* On mobile: workspace panel stacks above the grid */}
      {isMobile && (
        <Box sx={{ p: 1, pb: 0 }}>
          <RightPanel isDark={isDark} />
        </Box>
      )}

      {/* main grid area */}
      <Box
        sx={{
          position: "relative",
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: isMobile ? "visible" : "hidden",
          minWidth: 0,
        }}
      >
        {/* Scrollable grid */}
        <Box
          sx={{
            flex: isMobile ? "none" : 1,
            overflow: isMobile ? "visible" : "auto",
            p: 1,
          }}
        >
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "repeat(12, 1fr)",
              gap: 1,
            }}
          >
            {WIDGETS.map(({ id, span, height }) => (
              <Box
                key={id}
                sx={{
                  gridColumn: isMobile ? "1 / -1" : `span ${span}`,
                  height,
                }}
              >
                <WidgetCard isDark={isDark}>
                  <ErrorBoundary fallback={<ErrorFallback />}>
                    <Suspense fallback={<WidgetSkeleton />}>
                      {renderWidget(id)}
                    </Suspense>
                  </ErrorBoundary>
                </WidgetCard>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>

      {/* sidebar — desktop only; on mobile it renders above the grid */}
      {!isMobile && (
        <Box
          sx={{
            p: 1,
            pl: 0,
            flexShrink: 0,
            display: "flex",
            alignSelf: "flex-start",
            maxHeight: "100%",
          }}
        >
          <RightPanel isDark={isDark} />
        </Box>
      )}
    </Box>
  );
}

function Dashboard() {
  const { user } = useContext(UserContext);
  return (
    <DashboardProvider user={user}>
      <DashboardInner />
    </DashboardProvider>
  );
}

export default Dashboard;
