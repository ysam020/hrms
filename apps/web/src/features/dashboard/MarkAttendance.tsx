import { Suspense, lazy, memo, useCallback, useContext, useState } from "react";
import Skeleton from "@mui/material/Skeleton";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Login from "@mui/icons-material/Login";
import Logout from "@mui/icons-material/Logout";
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
import { AttendanceCard } from "./mark-attendance/AttendanceCard";
import { TimeDisplayCards } from "./mark-attendance/TimeDisplayCards";

const FaceRecognitionDialog = lazy(() =>
  import("./FaceRecognitionDialog").then((module) => ({
    default: module.FaceRecognitionDialog,
  })),
);

const LocationConsentDrawer = lazy(
  () => import("@web/shared/components/LocationConsentDrawer"),
);

const CameraConsentDrawer = lazy(
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

export default memo(MarkAttendance);
