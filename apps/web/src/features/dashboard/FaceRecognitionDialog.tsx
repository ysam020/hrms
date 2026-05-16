import React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import Chip from "@mui/material/Chip";
import LinearProgress from "@mui/material/LinearProgress";
import Face from "@mui/icons-material/Face";
import Videocam from "@mui/icons-material/Videocam";
import useTheme from "@mui/material/styles/useTheme";
import ThemedDialog from "@web/shared/components/ThemedDialog";

const FaceRecognitionContent = React.memo(
  ({
    faceRecognitionState,
    videoCallbackRef,
    getStepMessage,
    theme,
  }: {
    faceRecognitionState: any;
    videoCallbackRef: any;
    getStepMessage: any;
    theme: any;
  }) => {
    const muiTheme = useTheme();

    const isEnrollmentMode =
      faceRecognitionState.step?.startsWith("enrollment");

    const isLivenessStep = [
      "liveness_instruction",
      "liveness_head_movement",
      "enrollment_liveness",
    ].includes(faceRecognitionState.step);

    return (
      <Box>
        {/* Header Section */}
        <Box sx={{ textAlign: "center", mb: 3 }}>
          <Box
            sx={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 56,
              height: 56,
              borderRadius: "50%",
              backgroundColor: isEnrollmentMode
                ? theme === "light"
                  ? "#e8f5e9"
                  : "#1b5e20"
                : theme === "light"
                  ? "#e3f2fd"
                  : "#1565c0",
              mb: 2,
            }}
          >
            <Face
              sx={{
                fontSize: 28,
                color: isEnrollmentMode
                  ? theme === "light"
                    ? "#2e7d32"
                    : "#a5d6a7"
                  : theme === "light"
                    ? "#1976d2"
                    : "#90caf9",
              }}
            />
          </Box>
          <Typography variant="h6" fontWeight={600} sx={{ mb: 1 }}>
            {isEnrollmentMode
              ? "Face Enrollment"
              : "Face Recognition Verification"}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {getStepMessage(faceRecognitionState)}
          </Typography>
        </Box>

        {/* Video Section */}
        {faceRecognitionState.showVideo && faceRecognitionState.videoStream && (
          <VideoSection
            faceRecognitionState={faceRecognitionState}
            videoCallbackRef={videoCallbackRef}
            isLivenessStep={isLivenessStep}
            isEnrollmentMode={isEnrollmentMode}
            muiTheme={muiTheme}
          />
        )}

        {/* Loading State */}
        {!faceRecognitionState.showVideo && <LoadingSection theme={theme} />}

        {/* Security Notice */}
        <SecurityNotice theme={theme} isEnrollmentMode={isEnrollmentMode} />
      </Box>
    );
  },
);

const VideoSection = React.memo(
  ({
    faceRecognitionState,
    videoCallbackRef,
    isLivenessStep,
    isEnrollmentMode,
    muiTheme,
  }: {
    faceRecognitionState: any;
    videoCallbackRef: any;
    isLivenessStep: boolean;
    isEnrollmentMode: boolean;
    muiTheme: any;
  }) => (
    <Box sx={{ mb: 3 }}>
      <Paper
        elevation={4}
        sx={{
          position: "relative",
          width: "100%",
          height: 240,
          borderRadius: 3,
          overflow: "hidden",
          border: `3px solid ${
            faceRecognitionState.headMovementDetected
              ? "#4caf50"
              : muiTheme.palette.primary.main
          }`,
          transition: "border-color 0.3s ease",
        }}
      >
        <video
          ref={videoCallbackRef}
          autoPlay
          muted
          playsInline
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />

        <FaceDetectionOutline />

        {isLivenessStep && (
          <ProgressOverlay faceRecognitionState={faceRecognitionState} />
        )}

        <InstructionOverlay
          isLivenessStep={isLivenessStep}
          isEnrollmentMode={isEnrollmentMode}
        />
      </Paper>
    </Box>
  ),
);

const FaceDetectionOutline = React.memo(() => (
  <Box
    sx={{
      position: "absolute",
      top: "15%",
      left: "25%",
      right: "25%",
      bottom: "20%",
      border: "3px dashed rgba(255, 255, 255, 0.9)",
      borderRadius: "50%",
      pointerEvents: "none",
      animation: "pulse 2s infinite",
      "@keyframes pulse": {
        "0%": {
          borderColor: "rgba(255, 255, 255, 0.9)",
        },
        "50%": {
          borderColor: "rgba(255, 255, 255, 0.5)",
        },
        "100%": {
          borderColor: "rgba(255, 255, 255, 0.9)",
        },
      },
    }}
  />
));

const ProgressOverlay = React.memo(
  ({ faceRecognitionState }: { faceRecognitionState: any }) => (
    <Box
      sx={{
        position: "absolute",
        bottom: 12,
        left: 12,
        right: 12,
        backgroundColor: "rgba(0, 0, 0, 0.8)",
        borderRadius: 2,
        p: 1.5,
        backdropFilter: "blur(8px)",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: 1,
        }}
      >
        <Typography
          variant="caption"
          sx={{
            color: "white",
            fontSize: "0.75rem",
            fontWeight: 600,
          }}
        >
          Head Movement Detection
        </Typography>
        <Chip
          size="small"
          label={
            faceRecognitionState.headMovementDetected
              ? "✓ Detected"
              : "Move Head"
          }
          color={
            faceRecognitionState.headMovementDetected ? "success" : "default"
          }
          sx={{
            height: 20,
            fontSize: "0.65rem",
            fontWeight: 600,
          }}
        />
      </Box>
      <LinearProgress
        variant="determinate"
        value={faceRecognitionState.progress}
        sx={{
          height: 6,
          borderRadius: 1,
          backgroundColor: "rgba(255, 255, 255, 0.2)",
          "& .MuiLinearProgress-bar": {
            backgroundColor: faceRecognitionState.headMovementDetected
              ? "#4caf50"
              : "#2196f3",
          },
        }}
      />
    </Box>
  ),
);

const InstructionOverlay = React.memo(
  ({
    isLivenessStep,
    isEnrollmentMode,
  }: {
    isLivenessStep: boolean;
    isEnrollmentMode: boolean;
  }) => (
    <Box
      sx={{
        position: "absolute",
        top: 12,
        left: 12,
        right: 12,
      }}
    >
      <Typography
        variant="caption"
        sx={{
          color: "white",
          backgroundColor: "rgba(0, 0, 0, 0.7)",
          padding: "8px 12px",
          borderRadius: 2,
          fontSize: "0.75rem",
          display: "block",
          textAlign: "center",
          fontWeight: 500,
        }}
      >
        {isLivenessStep
          ? "🔄 Slowly turn your head left and right"
          : isEnrollmentMode
            ? "📸 Position your face clearly in the circle"
            : "👤 Position your face in the circle"}
      </Typography>
    </Box>
  ),
);

const LoadingSection = React.memo(({ theme }: { theme: any }) => (
  <Box sx={{ textAlign: "center", py: 4 }}>
    <Box
      sx={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 64,
        height: 64,
        borderRadius: "50%",
        backgroundColor: theme === "light" ? "#f5f5f5" : "#2a2a2a",
        mb: 2,
      }}
    >
      <Videocam sx={{ fontSize: 32, color: "text.secondary" }} />
    </Box>
    <Typography variant="body2" color="text.secondary">
      Preparing camera for face recognition...
    </Typography>
  </Box>
));

const SecurityNotice = React.memo(
  ({ theme, isEnrollmentMode }: { theme: any; isEnrollmentMode: boolean }) => (
    <Box
      sx={{
        p: 2,
        backgroundColor:
          theme === "light"
            ? "rgba(33, 150, 243, 0.1)"
            : "rgba(33, 150, 243, 0.15)",
        borderRadius: 2,
        border: `1px solid ${
          theme === "light"
            ? "rgba(33, 150, 243, 0.2)"
            : "rgba(33, 150, 243, 0.3)"
        }`,
      }}
    >
      <Typography
        variant="body2"
        sx={{
          fontSize: "0.8rem",
          color: "text.secondary",
          lineHeight: 1.4,
          textAlign: "center",
        }}
      >
        🔒{" "}
        {isEnrollmentMode ? (
          <>
            <strong>One-time Setup:</strong> Your face will be securely stored
            and used for future attendance check-ins. The camera stops
            automatically once enrollment is complete.
          </>
        ) : (
          <>
            <strong>Secure Verification:</strong> Your face data is processed
            locally and used only for attendance verification. The camera will
            automatically stop after verification is complete.
          </>
        )}
      </Typography>
    </Box>
  ),
);

const FaceRecognitionDialog = React.memo(
  ({
    dialogOpen,
    faceRecognitionState,
    videoCallbackRef,
    getStepMessage,
    theme,
  }: {
    dialogOpen: boolean;
    faceRecognitionState: any;
    videoCallbackRef: any;
    getStepMessage: any;
    theme: any;
  }) => {
    return (
      <ThemedDialog
        open={dialogOpen}
        onClose={() => {}}
        title=""
        maxWidth="xs"
        fullWidth
        theme={theme}
        paperProps={{
          sx: {
            borderRadius: 3,
            margin: 1,
          },
        }}
      >
        <FaceRecognitionContent
          faceRecognitionState={faceRecognitionState}
          videoCallbackRef={videoCallbackRef}
          getStepMessage={getStepMessage}
          theme={theme}
        />
      </ThemedDialog>
    );
  },
);

export { FaceRecognitionDialog };
