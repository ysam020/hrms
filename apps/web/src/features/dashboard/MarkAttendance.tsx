import React, { Suspense, useContext, useState, useCallback } from "react";
import Skeleton from "@mui/material/Skeleton";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Grid from "@mui/material/Grid2";
import Login from "@mui/icons-material/Login";
import Logout from "@mui/icons-material/Logout";
import Today from "@mui/icons-material/Today";
import { AlertContext } from "@web/app/providers/AlertContext";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import { addAttendance } from "@web/shared/utils/addAttendance";
import { useDashboard } from "@web/app/providers/DashboardContext";
import { useAttendanceData } from "@web/shared/hooks/useAttendanceData";
import { useCurrentTime } from "@web/shared/hooks/useCurrentTime";
import { useFaceRecognition } from "@web/shared/hooks/useFaceRecognition";
import { useVideoCallback } from "@web/shared/hooks/useVideoCallback";
import { useStepMessage } from "@web/shared/hooks/useStepMessage";
import { useAttendanceProcess } from "@web/shared/hooks/useAttendanceProcess";

// Components
import Button from "@web/shared/components/Button";

const FaceRecognitionDialog = React.lazy(() =>
  import("./FaceRecognitionDialog").then((module) => ({
    default: module.FaceRecognitionDialog,
  })),
);

const LocationConsentDrawer = React.lazy(
  () => import("@web/shared/components/LocationConsentDrawer"),
);

const CameraConsentDrawer = React.lazy(
  () => import("@web/shared/components/CameraConsentDrawer"),
);

function MarkAttendance({ compact = false }) {
  const { setAlert } = useContext(AlertContext);
  const { theme } = useContext(ThemeContext);
  const { data, loading, refetch } = useDashboard();
  const attendances = data.attendances;
  const isLoading = loading.attendances;

  // Local state
  const [showCameraDrawer, setShowCameraDrawer] = useState(false);
  const [pendingAttendanceType, setPendingAttendanceType] = useState(null);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [faceApiReady, setFaceApiReady] = useState(false);

  const {
    loading: attendanceLoading,
    todayTimeIn,
    todayTimeOut,
    disableFields,
    getStatus,
  } = useAttendanceData(attendances, isLoading);

  const { currentTime, getCurrentTime } = useCurrentTime();

  // Face recognition hooks
  const faceRecognition = useFaceRecognition();
  const { videoCallbackRef } = useVideoCallback(
    faceRecognition.faceRecognitionState,
    faceRecognition.videoStreamRef,
  );
  const { getStepMessage } = useStepMessage();
  const {
    dialogOpen,
    field,
    showConsentDrawer,
    setShowConsentDrawer,
    processAttendance,
  } = useAttendanceProcess(faceRecognition, refetch);

  const loadFaceApiModels = useCallback(async () => {
    if (faceApiReady) return true; // Already loaded

    setModelsLoading(true);

    try {
      // Show loading feedback
      setAlert({
        open: true,
        message: "Loading face recognition models... This may take a moment.",
        severity: "info",
      });

      const faceApiModule = await import("@web/core/config/faceapiConfig");
      const { loadFaceApiModels: loadModels } = faceApiModule;

      // Load the models (this is a plain async function, not a hook)
      await loadModels();

      // Models loaded successfully
      setAlert({
        open: true,
        message: "Face recognition ready! Starting verification...",
        severity: "success",
      });

      setFaceApiReady(true);
      setModelsLoading(false);
      return true;
    } catch (error) {
      console.error("Model loading error:", error);
      setAlert({
        open: true,
        message: "Failed to load face recognition models. Please try again.",
        severity: "error",
      });
      setModelsLoading(false);
      return false;
    }
  }, [faceApiReady, setAlert]);

  const handleAttendance = useCallback(
    async (fieldType) => {
      try {
        const permissionStatus = await navigator.permissions.query({
          name: "camera" as PermissionName,
        });

        if (permissionStatus.state === "granted") {
          setPendingAttendanceType(fieldType);
          const loaded = await loadFaceApiModels();
          if (loaded) {
            processAttendance(fieldType);
          }
        } else {
          setPendingAttendanceType(fieldType);
          setShowCameraDrawer(true);
        }
      } catch (error) {
        setPendingAttendanceType(fieldType);
        setShowCameraDrawer(true);
      }
    },
    [loadFaceApiModels, processAttendance],
  );

  // Camera consent handlers
  const handleCameraAllow = useCallback(async () => {
    setShowCameraDrawer(false);
    const loaded = await loadFaceApiModels();
    if (loaded) {
      processAttendance(pendingAttendanceType);
    }
  }, [loadFaceApiModels, processAttendance, pendingAttendanceType]);

  const handleCameraDeny = useCallback(() => {
    setAlert({
      open: true,
      message: "Camera access is required for face verification.",
      severity: "error",
    });
    setPendingAttendanceType(null);
    setShowCameraDrawer(false);
  }, [setAlert]);

  // Location consent handlers
  const handleLocationConsent = useCallback(
    async (geo) => {
      await addAttendance(
        field,
        setAlert,
        refetch,
        geo.latitude,
        geo.longitude,
      );
      setShowConsentDrawer(false);
    },
    [field, setAlert, refetch, setShowConsentDrawer],
  );

  const handleLocationDenied = useCallback(() => {
    setAlert({
      open: true,
      message: "Location access denied. Attendance cannot be recorded.",
      severity: "error",
    });
    setShowConsentDrawer(false);
  }, [setAlert, setShowConsentDrawer]);

  const status = getStatus();

  const isInitialLoading =
    attendanceLoading &&
    todayTimeIn === undefined &&
    todayTimeOut === undefined;

  // compact mode: render minimal punch-in/out buttons for the sidebar
  if (compact) {
    const Dialogs = (
      <>
        {showCameraDrawer && (
          <Suspense fallback={null}>
            <CameraConsentDrawer
              showConsentDrawer={showCameraDrawer}
              setShowConsentDrawer={setShowCameraDrawer}
              onAllowCamera={handleCameraAllow}
              onDenyCamera={handleCameraDeny}
            />
          </Suspense>
        )}
        <Suspense fallback={null}>
          <FaceRecognitionDialog
            dialogOpen={dialogOpen}
            faceRecognitionState={faceRecognition.faceRecognitionState}
            videoCallbackRef={videoCallbackRef}
            getStepMessage={getStepMessage}
            theme={theme}
          />
        </Suspense>
        {showConsentDrawer && (
          <Suspense fallback={null}>
            <LocationConsentDrawer
              showConsentDrawer={showConsentDrawer}
              setShowConsentDrawer={setShowConsentDrawer}
              onAllowLocation={handleLocationConsent}
              onDenyLocation={handleLocationDenied}
            />
          </Suspense>
        )}
      </>
    );

    if (isInitialLoading) {
      return (
        <>
          <Skeleton
            variant="rounded"
            height={36}
            sx={{ width: "100%", borderRadius: 1.5 }}
          />
          {Dialogs}
        </>
      );
    }

    if (disableFields.timeIn && disableFields.timeOut) {
      return (
        <>
          <Typography
            variant="caption"
            sx={{ color: "#10b981", fontWeight: 600, fontSize: "0.72rem" }}
          >
            ✓ Attendance complete for today
          </Typography>
          {Dialogs}
        </>
      );
    }

    return (
      <>
        <Stack direction="row" spacing={0.75}>
          {!disableFields.timeIn && (
            <Button
              onClick={() => handleAttendance("timeIn")}
              disabled={dialogOpen || modelsLoading}
              loading={modelsLoading}
              loadingText="Loading..."
              style={{
                flex: 1,
                marginBottom: 0,
                opacity: dialogOpen || modelsLoading ? 0.6 : 1,
              }}
            >
              <Login sx={{ fontSize: 14, mr: 0.5 }} />
              Punch In
            </Button>
          )}
          {disableFields.timeIn && !disableFields.timeOut && (
            <Button
              onClick={() => handleAttendance("timeOut")}
              disabled={dialogOpen || modelsLoading}
              loading={modelsLoading}
              loadingText="Loading..."
              style={{
                flex: 1,
                marginBottom: 0,
                opacity: dialogOpen || modelsLoading ? 0.6 : 1,
              }}
            >
              <Logout sx={{ fontSize: 14, mr: 0.5 }} />
              Punch Out
            </Button>
          )}
        </Stack>
        {Dialogs}
      </>
    );
  }

  return (
    <div
      className="dashboard-container attendance"
      style={{
        backgroundImage: `url(/assets/images/m-bg.webp)`,
      }}
    >
      {/* Main Attendance Card */}
      <AttendanceCard
        status={status}
        currentTime={currentTime}
        getCurrentTime={getCurrentTime}
        disableFields={disableFields}
        handleAttendance={handleAttendance}
        modelsLoading={modelsLoading}
        isInitialLoading={isInitialLoading}
        dialogOpen={dialogOpen}
      />

      {/* Time Display Cards */}
      <TimeDisplayCards
        loading={attendanceLoading}
        todayTimeIn={todayTimeIn}
        todayTimeOut={todayTimeOut}
        theme={theme}
        isInitialLoading={isInitialLoading}
      />

      {/* Camera Consent Drawer */}
      {showCameraDrawer && (
        <Suspense fallback={null}>
          <CameraConsentDrawer
            showConsentDrawer={showCameraDrawer}
            setShowConsentDrawer={setShowCameraDrawer}
            onAllowCamera={handleCameraAllow}
            onDenyCamera={handleCameraDeny}
          />
        </Suspense>
      )}

      {/* Face Recognition Dialog - always mounted so lazy load completes before dialog opens */}
      <Suspense fallback={null}>
        <FaceRecognitionDialog
          dialogOpen={dialogOpen}
          faceRecognitionState={faceRecognition.faceRecognitionState}
          videoCallbackRef={videoCallbackRef}
          getStepMessage={getStepMessage}
          theme={theme}
        />
      </Suspense>

      {/* Location Consent Drawer */}
      {showConsentDrawer && (
        <Suspense fallback={null}>
          <LocationConsentDrawer
            showConsentDrawer={showConsentDrawer}
            setShowConsentDrawer={setShowConsentDrawer}
            onAllowLocation={handleLocationConsent}
            onDenyLocation={handleLocationDenied}
          />
        </Suspense>
      )}
    </div>
  );
}

// ==========================================
// SUB-COMPONENTS
// ==========================================

const AttendanceCard = React.memo(
  ({
    status,
    disableFields,
    dialogOpen,
    handleAttendance,
    modelsLoading,
    isInitialLoading,
  }: {
    status: any;
    disableFields: any;
    dialogOpen: boolean;
    handleAttendance: any;
    modelsLoading: boolean;
    isInitialLoading: boolean;
    currentTime?: any;
    getCurrentTime?: any;
  }) => (
    <Card
      elevation={0}
      sx={{
        boxShadow: "none !important",
        mb: 1,
        bgcolor: "transparent",
      }}
    >
      <CardContent sx={{ p: 0, "&:last-child": { pb: 0 } }}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mb: 1,
            boxShadow: "none !important",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center" }}>
            <Today sx={{ mr: 1, fontSize: 20 }} />
            <Typography variant="subtitle1" fontWeight={600}>
              Today's Attendance
            </Typography>
          </Box>

          {isInitialLoading ? (
            <Skeleton
              variant="rounded"
              width={80}
              height={24}
              sx={{ borderRadius: 3 }}
            />
          ) : (
            <Chip
              size="small"
              label={status.text}
              color={status.color}
              sx={{ fontWeight: 600, fontSize: "0.7rem" }}
            />
          )}
        </Box>

        <AttendanceButtons
          disableFields={disableFields}
          dialogOpen={dialogOpen}
          modelsLoading={modelsLoading}
          handleAttendance={handleAttendance}
          isInitialLoading={isInitialLoading}
        />
      </CardContent>
    </Card>
  ),
);

const AttendanceButtons = React.memo(
  ({
    disableFields,
    dialogOpen,
    modelsLoading,
    handleAttendance,
    isInitialLoading,
  }: {
    disableFields: any;
    dialogOpen: boolean;
    modelsLoading: boolean;
    handleAttendance: any;
    isInitialLoading: boolean;
  }) => (
    <Stack
      direction="row"
      sx={{ mb: 0 }}
      style={{ marginBottom: "0 !important" }}
    >
      {isInitialLoading ? (
        <>
          <Skeleton
            variant="rounded"
            width={100}
            height={36}
            sx={{ borderRadius: 1 }}
          />
          <Skeleton
            variant="rounded"
            width={100}
            height={36}
            sx={{ borderRadius: 1 }}
          />
        </>
      ) : (
        <>
          {!disableFields.timeIn && (
            <Button
              onClick={() => handleAttendance("timeIn")}
              disabled={dialogOpen || modelsLoading}
              loading={modelsLoading}
              loadingText="Loading models..."
              style={{
                opacity: dialogOpen || modelsLoading ? 0.6 : 1,
                cursor: dialogOpen || modelsLoading ? "not-allowed" : "pointer",
                transition: "opacity 0.2s ease-in-out",
                marginBottom: 0,
              }}
            >
              <Login sx={{ fontSize: 16, mr: 0.5 }} />
              Punch In
            </Button>
          )}
          {disableFields.timeIn && !disableFields.timeOut && (
            <Button
              onClick={() => handleAttendance("timeOut")}
              disabled={dialogOpen || modelsLoading}
              loading={modelsLoading}
              loadingText="Loading models..."
              style={{
                opacity: dialogOpen || modelsLoading ? 0.6 : 1,
                cursor: dialogOpen || modelsLoading ? "not-allowed" : "pointer",
                transition: "opacity 0.2s ease-in-out",
                marginBottom: 0,
              }}
            >
              <Logout sx={{ fontSize: 16 }} />
              Punch Out
            </Button>
          )}
        </>
      )}
    </Stack>
  ),
);

const TimeDisplayCards = React.memo(
  ({
    loading,
    todayTimeIn,
    todayTimeOut,
    theme,
    isInitialLoading,
  }: {
    loading: boolean;
    todayTimeIn: any;
    todayTimeOut: any;
    theme: any;
    isInitialLoading: boolean;
  }) => (
    <div style={{ marginBottom: 0, boxShadow: "none !important" }}>
      <CardContent sx={{ p: 0, "&:last-child": { pb: 0 } }}>
        <Grid container spacing={1}>
          <Grid size={{ xs: 6 }}>
            <TimeCard
              label="Time In"
              time={todayTimeIn}
              loading={loading}
              isInitialLoading={isInitialLoading}
              colorScheme={{
                background: todayTimeIn
                  ? theme === "light"
                    ? "rgba(46, 125, 50, 0.15)"
                    : "rgba(165, 214, 167, 0.15)"
                  : theme === "light"
                    ? "rgba(255, 255, 255, 0.25)"
                    : "rgba(255, 255, 255, 0.1)",
                color: todayTimeIn
                  ? theme === "light"
                    ? "#2e7d32"
                    : "#a5d6a7"
                  : theme === "light"
                    ? "#333"
                    : "#ccc",
                border: todayTimeIn
                  ? theme === "light"
                    ? "1px solid rgba(46, 125, 50, 0.3)"
                    : "1px solid rgba(165, 214, 167, 0.3)"
                  : theme === "light"
                    ? "1px solid rgba(255, 255, 255, 0.4)"
                    : "1px solid rgba(255, 255, 255, 0.2)",
              }}
            />
          </Grid>
          <Grid size={{ xs: 6 }}>
            <TimeCard
              label="Time Out"
              time={todayTimeOut}
              loading={loading}
              isInitialLoading={isInitialLoading}
              colorScheme={{
                background: todayTimeOut
                  ? theme === "light"
                    ? "rgba(230, 81, 0, 0.15)"
                    : "rgba(255, 204, 128, 0.15)"
                  : theme === "light"
                    ? "rgba(255, 255, 255, 0.25)"
                    : "rgba(255, 255, 255, 0.1)",
                color: todayTimeOut
                  ? theme === "light"
                    ? "#e65100"
                    : "#ffcc80"
                  : theme === "light"
                    ? "#333"
                    : "#ccc",
                border: todayTimeOut
                  ? theme === "light"
                    ? "1px solid rgba(230, 81, 0, 0.3)"
                    : "1px solid rgba(255, 204, 128, 0.3)"
                  : theme === "light"
                    ? "1px solid rgba(255, 255, 255, 0.4)"
                    : "1px solid rgba(255, 255, 255, 0.2)",
              }}
            />
          </Grid>
        </Grid>
      </CardContent>
    </div>
  ),
);

const TimeCard = React.memo(
  ({
    label,
    time,
    loading,
    colorScheme,
    isInitialLoading,
  }: {
    label: string;
    time: any;
    loading: boolean;
    colorScheme: any;
    isInitialLoading: boolean;
  }) => (
    <Paper
      sx={{
        p: 0.5,
        textAlign: "center",
        backgroundColor: "transparent",
        color: colorScheme.color,
        borderRadius: 3,
        border: colorScheme.border,
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        boxShadow: `
          0 8px 32px rgba(0, 0, 0, 0.1),
          inset 0 1px 0 rgba(255, 255, 255, 0.1),
          0 1px 3px rgba(0, 0, 0, 0.05)
        `,
        transition: "all 0.3s ease-in-out",
        position: "relative",
        overflow: "hidden",
        "&::before": {
          content: '""',
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: `linear-gradient(135deg, 
            rgba(255, 255, 255, 0.1) 0%, 
            rgba(255, 255, 255, 0.05) 50%, 
            rgba(255, 255, 255, 0.02) 100%
          )`,
          borderRadius: "inherit",
          pointerEvents: "none",
        },
        "&:hover": {
          transform: "translateY(-2px)",
          boxShadow: `
            0 12px 40px rgba(0, 0, 0, 0.15),
            inset 0 1px 0 rgba(255, 255, 255, 0.15),
            0 2px 8px rgba(0, 0, 0, 0.08)
          `,
        },
      }}
    >
      {isInitialLoading ? (
        <>
          <Skeleton
            variant="text"
            width={60}
            height={16}
            sx={{ mx: "auto", mb: 0.5 }}
          />
          <Skeleton variant="text" width={80} height={28} sx={{ mx: "auto" }} />
        </>
      ) : (
        <>
          <Typography
            variant="caption"
            display="block"
            fontWeight={600}
            sx={{
              position: "relative",
              zIndex: 1,
              textShadow: "0 1px 2px rgba(0, 0, 0, 0.1)",
            }}
          >
            {label}
          </Typography>
          {loading && time === undefined ? (
            <Skeleton
              variant="text"
              width={60}
              height={28}
              sx={{ mx: "auto" }}
            />
          ) : (
            <Typography
              variant="h6"
              fontWeight={700}
              sx={{
                fontSize: "1.1rem",
                transition: "all 0.2s ease-in-out",
                position: "relative",
                zIndex: 1,
                textShadow: "0 1px 2px rgba(0, 0, 0, 0.1)",
              }}
            >
              {time || "--:--"}
            </Typography>
          )}
        </>
      )}
    </Paper>
  ),
);

export default React.memo(MarkAttendance);
