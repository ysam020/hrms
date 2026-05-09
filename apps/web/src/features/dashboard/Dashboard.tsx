import React, {
  Suspense,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
} from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Skeleton from "@mui/material/Skeleton";
import Typography from "@mui/material/Typography";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import CloseIcon from "@mui/icons-material/Close";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import { Responsive, WidthProvider } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { ErrorBoundary } from "react-error-boundary";
import ErrorFallback from "@web/shared/components/ErrorFallback";
import { UserContext } from "@web/app/providers/UserContext";
import { DashboardProvider } from "@web/app/providers/DashboardContext";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import { useDashboardEdit } from "@web/app/providers/DashboardEditContext";
import { useBottomDrawer } from "@web/app/providers/BottomDrawerContext";
import "../../styles/dashboard.scss";

const ResponsiveGridLayout = WidthProvider(Responsive);

// Lazy-loaded widgets
const HrActivities = React.lazy(() => import("./HrActivities"));
const AttendanceCalendar = React.lazy(() => import("./AttendanceCalendar"));
const QuickStats = React.lazy(() => import("./QuickStats"));
const PendingApprovals = React.lazy(() => import("./PendingApprovals"));
const MyWorkspace = React.lazy(() => import("./MyWorkspace"));
const KycStatus = React.lazy(() => import("./KycStatus"));
const JobOpeningsList = React.lazy(() => import("./JobOpeningsList"));
const BirthdayAnniversary = React.lazy(() => import("./BirthdayAnniversary"));
const DepartmentBreakdown = React.lazy(() => import("./DepartmentBreakdown"));
const WorkforceStatus = React.lazy(() => import("./WorkforceStatus"));

// Constants
const STORAGE_KEY_LAYOUT = "db_layout_v12";
const STORAGE_KEY_VISIBILITY = "db_visibility_v12";
const RIGHT_PANEL_WIDTH = 270;

const WIDGET_LABELS = {
  quickStats: "Quick Stats",
  workforceStatus: "Workforce Status",
  attendanceCalendar: "Calendar",
  hrActivities: "HR Activities",
  pendingApprovals: "Pending Approvals",
  kycStatus: "KYC Status",
  jobOpeningsList: "Open Positions",
  birthdayAnniversary: "Birthdays & Anniversaries",
  departmentBreakdown: "Departments",
};

const DEFAULT_LAYOUTS = {
  lg: [
    { i: "quickStats", x: 0, y: 0, w: 6, h: 2, minW: 4, minH: 2 },
    { i: "workforceStatus", x: 6, y: 0, w: 6, h: 2, minW: 4, minH: 2 },
    { i: "attendanceCalendar", x: 0, y: 2, w: 12, h: 2, minW: 6, minH: 2 },
    { i: "hrActivities", x: 0, y: 4, w: 6, h: 3, minW: 4, minH: 2 },
    { i: "pendingApprovals", x: 6, y: 4, w: 3, h: 3, minW: 3, minH: 2 },
    { i: "kycStatus", x: 9, y: 4, w: 3, h: 3, minW: 2, minH: 2 },
    { i: "jobOpeningsList", x: 0, y: 7, w: 4, h: 5, minW: 3, minH: 2 },
    { i: "birthdayAnniversary", x: 4, y: 7, w: 5, h: 5, minW: 3, minH: 2 },
    { i: "departmentBreakdown", x: 9, y: 7, w: 3, h: 5, minW: 2, minH: 2 },
  ],
  md: [
    { i: "quickStats", x: 0, y: 0, w: 5, h: 2, minW: 4, minH: 2 },
    { i: "workforceStatus", x: 5, y: 0, w: 5, h: 2, minW: 4, minH: 2 },
    { i: "attendanceCalendar", x: 0, y: 2, w: 10, h: 2, minW: 6, minH: 2 },
    { i: "hrActivities", x: 0, y: 4, w: 5, h: 3, minW: 4, minH: 2 },
    { i: "pendingApprovals", x: 5, y: 4, w: 3, h: 3, minW: 2, minH: 2 },
    { i: "kycStatus", x: 8, y: 4, w: 2, h: 3, minW: 2, minH: 2 },
    { i: "jobOpeningsList", x: 0, y: 7, w: 3, h: 5, minW: 3, minH: 2 },
    { i: "birthdayAnniversary", x: 3, y: 7, w: 4, h: 5, minW: 3, minH: 2 },
    { i: "departmentBreakdown", x: 7, y: 7, w: 3, h: 5, minW: 2, minH: 2 },
  ],
};

const DEFAULT_VISIBILITY = Object.keys(WIDGET_LABELS).reduce((acc, k) => {
  acc[k] = true;
  return acc;
}, {});

function loadFromStorage(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

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

const WidgetCard = React.memo(
  ({
    label,
    editMode,
    onHide,
    isDark,
    children,
  }: {
    label: string;
    editMode: boolean;
    onHide: () => void;
    isDark: boolean;
    children: React.ReactNode;
  }) => (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        borderRadius: 2,
        overflow: "hidden",
        border: editMode
          ? `2px dashed ${isDark ? "rgba(99,102,241,0.55)" : "rgba(99,102,241,0.45)"}`
          : "none",
        boxShadow: editMode
          ? "none"
          : isDark
            ? "0 1px 3px rgba(0,0,0,0.35)"
            : "0 1px 4px rgba(0,0,0,0.08)",
        bgcolor: isDark ? "#212e35" : "#fff",
        transition: "border 0.2s, box-shadow 0.2s",
      }}
    >
      {editMode && (
        <Box
          className="drag-handle"
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            px: 1.5,
            py: 0.5,
            background: isDark
              ? "linear-gradient(135deg,#1a237e,#283593)"
              : "linear-gradient(135deg,#3949ab,#5c6bc0)",
            cursor: "grab",
            userSelect: "none",
            flexShrink: 0,
            "&:active": { cursor: "grabbing" },
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
            <DragIndicatorIcon
              sx={{ fontSize: 13, color: "rgba(255,255,255,0.7)" }}
            />
            <Typography
              variant="caption"
              sx={{ color: "#fff", fontWeight: 600, fontSize: "0.7rem" }}
            >
              {label}
            </Typography>
          </Box>
          <IconButton
            size="small"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={onHide}
            sx={{
              color: "rgba(255,255,255,0.7)",
              p: 0.2,
              "&:hover": { color: "#fff", bgcolor: "rgba(255,255,255,0.18)" },
            }}
          >
            <CloseIcon sx={{ fontSize: 13 }} />
          </IconButton>
        </Box>
      )}
      <Box sx={{ flex: 1, overflow: "hidden" }}>{children}</Box>
    </Box>
  ),
);

const RightPanel = React.memo(({ isDark }: { isDark: boolean }) => (
  <Box
    sx={{
      width: RIGHT_PANEL_WIDTH,
      maxHeight: "100%",
      display: "flex",
      flexDirection: "column",
      borderRadius: 2,
      border: `1px solid ${isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)"}`,
      bgcolor: isDark ? "#1c262a" : "#fff",
      overflowY: "auto",
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
));

// 10px mainBox paddingTop + 64px MUI Toolbar (AppBar default height on desktop)
const APPBAR_OFFSET = 74;
const DOCK_HEIGHT = 72;

function DashboardInner() {
  const { theme } = useContext(ThemeContext);
  const isDark = theme === "dark";
  const { dockVisible } = useBottomDrawer();

  const { editMode, registerReset } = useDashboardEdit();

  const [visibility, setVisibility] = useState(() =>
    loadFromStorage(STORAGE_KEY_VISIBILITY, DEFAULT_VISIBILITY),
  );

  const [layouts, setLayouts] = useState(() =>
    loadFromStorage(STORAGE_KEY_LAYOUT, DEFAULT_LAYOUTS),
  );

  const saveVisibility = useCallback((newVis) => {
    setVisibility(newVis);
    localStorage.setItem(STORAGE_KEY_VISIBILITY, JSON.stringify(newVis));
  }, []);

  const handleHideWidget = useCallback(
    (id) => saveVisibility({ ...visibility, [id]: false }),
    [visibility, saveVisibility],
  );

  const handleToggleWidget = useCallback(
    (id) => saveVisibility({ ...visibility, [id]: !visibility[id] }),
    [visibility, saveVisibility],
  );

  const handleResetLayout = useCallback(() => {
    setLayouts(DEFAULT_LAYOUTS);
    setVisibility(DEFAULT_VISIBILITY);
    localStorage.removeItem(STORAGE_KEY_LAYOUT);
    localStorage.removeItem(STORAGE_KEY_VISIBILITY);
  }, []);

  // Register reset fn with the appbar context
  useEffect(() => {
    registerReset(handleResetLayout);
  }, [registerReset, handleResetLayout]);

  const isMounted = useRef(false);
  const handleLayoutChange = useCallback((_cur, allLayouts) => {
    if (!isMounted.current) {
      isMounted.current = true;
      return;
    }
    setLayouts((prev) => {
      // Merge per-item within each breakpoint so hidden widgets keep their
      // stored dimensions and aren't lost when they're re-shown.
      const merged = { ...prev };
      Object.entries(allLayouts).forEach(([bp, items]) => {
        const layoutItems = items as any[];
        const incomingIds = new Set(layoutItems.map((item) => item.i));
        merged[bp] = [
          ...(prev[bp] || []).filter((item) => !incomingIds.has(item.i)),
          ...layoutItems,
        ];
      });
      localStorage.setItem(STORAGE_KEY_LAYOUT, JSON.stringify(merged));
      return merged;
    });
  }, []);

  const visibleIds = useMemo(
    () => Object.keys(WIDGET_LABELS).filter((k) => visibility[k]),
    [visibility],
  );

  return (
    <Box
      className={`dashboard dashboard-height-transition`}
      data-dark={isDark ? "true" : undefined}
      sx={{
        display: "flex",
        height: `calc(100vh - ${APPBAR_OFFSET + (dockVisible ? DOCK_HEIGHT : 0)}px)`,
        overflow: "hidden",
        bgcolor: isDark ? "#111B21" : "#F9FAFB",
      }}
    >
      {/* main grid area */}
      <Box
        sx={{
          position: "relative",
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          minWidth: 0,
        }}
      >
        {/* Widget toggles strip — only in edit mode */}
        {editMode && (
          <Box
            sx={{
              mx: 1,
              px: 1.5,
              py: 0.75,
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 0.5,
              borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)"}`,
              bgcolor: isDark ? "#1c262a" : "#fff",
              flexShrink: 0,
              borderRadius: 1,
            }}
          >
            <Typography
              variant="caption"
              sx={{
                color: "text.secondary",
                fontSize: "0.68rem",
                mr: 0.25,
                flexShrink: 0,
              }}
            >
              Show / hide:
            </Typography>
            {Object.entries(WIDGET_LABELS).map(([id, label]) => (
              <Chip
                key={id}
                size="small"
                label={label}
                onClick={() => handleToggleWidget(id)}
                variant={visibility[id] ? "filled" : "outlined"}
                color={visibility[id] ? "primary" : "default"}
                icon={
                  visibility[id] ? undefined : (
                    <VisibilityOffIcon
                      sx={{ fontSize: 11, "&&": { ml: 0.75 } }}
                    />
                  )
                }
                sx={{
                  fontSize: "0.67rem",
                  height: 22,
                  cursor: "pointer",
                  opacity: visibility[id] ? 1 : 0.5,
                  transition: "opacity 0.15s",
                }}
              />
            ))}
            <Tooltip title="Reset to default layout">
              <IconButton
                size="small"
                onClick={handleResetLayout}
                sx={{ color: "text.secondary", ml: "auto" }}
              >
                <RestartAltIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          </Box>
        )}

        {/* Scrollable grid */}
        <Box sx={{ flex: 1, overflow: "auto", p: 1 }}>
          <ResponsiveGridLayout
            className="dashboard-grid"
            layouts={layouts}
            breakpoints={{ lg: 1200, md: 996, sm: 768 }}
            cols={{ lg: 12, md: 10, sm: 6 }}
            rowHeight={50}
            margin={[8, 8]}
            containerPadding={[0, 0]}
            isDraggable={editMode}
            isResizable={editMode}
            draggableHandle=".drag-handle"
            onLayoutChange={handleLayoutChange}
            resizeHandles={["se"]}
          >
            {visibleIds.map((id) => (
              <div key={id}>
                <WidgetCard
                  label={WIDGET_LABELS[id]}
                  editMode={editMode}
                  onHide={() => handleHideWidget(id)}
                  isDark={isDark}
                >
                  <ErrorBoundary fallback={<ErrorFallback />}>
                    <Suspense fallback={<WidgetSkeleton />}>
                      {renderWidget(id)}
                    </Suspense>
                  </ErrorBoundary>
                </WidgetCard>
              </div>
            ))}
          </ResponsiveGridLayout>
        </Box>
      </Box>

      {/* sidebar */}
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
