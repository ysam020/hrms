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

// Spacing between cards and around the dashboard edges (MUI spacing units: 1 = 8px)
const CARD_GAP = 1.5;

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

// Layout shared by every card (widget cards and right panel).
const cardBaseSx = {
  height: "100%",
  display: "flex",
  flexDirection: "column",
  borderRadius: 1.5,
  overflow: "hidden",
} as const;

// Widget cards: background from theme, soft shadow, no border.
const widgetCardSx = {
  ...cardBaseSx,
  bgcolor: "background.paper",
  border: "none",
  boxShadow: "0 6px 12px rgba(30,10,58,.04)",
} as const;

// Right panel: gradient border (padding-box fill + border-box gradient), no shadow.
const getRightPanelSurface = (isDark: boolean) => {
  const fill = isDark ? "#1c262a" : "#fff";
  return {
    border: "1px solid transparent",
    boxShadow: "none",
    background: `linear-gradient(${fill}, ${fill}) padding-box, linear-gradient(87.1deg, rgba(60,118,255,0.2) 2.38%, rgba(173,38,236,0.2) 27.97%, rgba(255,9,147,0.2) 45.03%, rgba(253,29,29,0.2) 61.64%, rgba(255,187,0,0.2) 91.27%) border-box`,
  };
};

const WidgetSkeleton = () => (
  <Box sx={{ p: 1, height: "100%", width: "100%" }}>
    <Skeleton variant="rounded" height="100%" animation="wave" />
  </Box>
);

function renderWidget(id: string) {
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

const WidgetCard = memo(({ children }: { children: ReactNode }) => (
  <Box sx={widgetCardSx}>
    <Box sx={{ flex: 1, overflow: "hidden" }}>{children}</Box>
  </Box>
));

const RightPanel = memo(({ isDark }: { isDark: boolean }) => {
  const isMobile = useMediaQuery("(max-width:767px)");
  return (
    <Box
      sx={{
        // shared layout
        ...cardBaseSx,
        // gradient border, no shadow
        ...getRightPanelSurface(isDark),
        // RightPanel-specific styles
        height: "auto",
        width: isMobile ? "100%" : RIGHT_PANEL_WIDTH,
        maxHeight: isMobile ? "none" : "100%",
        overflow: isMobile ? "visible" : "hidden",
        overflowY: isMobile ? "visible" : "auto",
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
        height: isMobile ? "auto" : `calc(100vh - ${APPBAR_OFFSET}px)`,
        overflow: isMobile ? "visible" : "hidden",
        bgcolor: isDark ? "#111B21" : "#F9FAFB",
      }}
    >
      {/* On mobile: workspace panel stacks above the grid */}
      {isMobile && (
        <Box sx={{ p: CARD_GAP, pb: 0 }}>
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
            p: CARD_GAP,
          }}
        >
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "repeat(12, 1fr)",
              gap: CARD_GAP,
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
                <WidgetCard>
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
            p: CARD_GAP,
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
