import React, {
  Suspense,
  useContext,
  useEffect,
  useState,
  useMemo,
  useRef,
  useCallback,
} from "react";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import {
  Skeleton,
  Dialog,
  DialogContent,
  Box,
  Typography,
} from "@mui/material";
import { AlertContext } from "../../contexts/AlertContext";
import { UserContext } from "../../contexts/UserContext";
import apiClient from "../../config/axiosConfig";
import { getGeolocation } from "@hrms/auth";
import { addAttendance } from "../../utils/addAttendance";
import * as faceapi from "face-api.js";

const CustomCalendar = React.lazy(() => import("../customComponents/Calendar"));
const LocationConsentDrawer = React.lazy(() =>
  import("../customComponents/LocationConsentDrawer")
);

function MarkAttendance() {
  const [attendances, setAttendances] = useState([]);
  const [todayTimeIn, setTodayTimeIn] = useState("");
  const [todayTimeOut, setTodayTimeOut] = useState("");
  const [field, setField] = useState("");
  const [showConsentDrawer, setShowConsentDrawer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Consolidated face recognition state to prevent multiple re-renders
  const [faceRecognitionState, setFaceRecognitionState] = useState({
    step: "",
    showVideo: false,
    videoStream: null,
    progress: 0,
    headMovementDetected: false,
  });

  // Use refs for values that don't need to trigger re-renders
  const livenessDataRef = useRef({
    headPositions: [],
    frameCount: 0,
    lastUpdateTime: 0,
  });

  // Add a stable ref for the video element to prevent recreation
  const videoCallbackRef = useCallback(
    (node) => {
      if (node && faceRecognitionState.videoStream) {
        node.srcObject = faceRecognitionState.videoStream;
        videoStreamRef.current = faceRecognitionState.videoStream;

        node.play().catch((error) => {
          console.error("❌ Error playing video:", error);
        });
      }
    },
    [faceRecognitionState.videoStream]
  );
  const videoStreamRef = useRef(null);

  // Add render logging
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;

  // Liveness detection parameters
  const HEAD_MOVEMENT_SAMPLES = 10;
  const UPDATE_THROTTLE = 300; // Increased throttle time

  const currentDate = new Date();
  const [month, setMonth] = useState(currentDate.getMonth());
  const [year, setYear] = useState(currentDate.getFullYear());
  const { setAlert } = useContext(AlertContext);
  const { user } = useContext(UserContext);

  // Memoize helper function to prevent recreating on each render
  const calculateHeadPose = useCallback((landmarks) => {
    const noseTip = landmarks[30];
    const leftEye = landmarks[36];
    const rightEye = landmarks[45];
    const chin = landmarks[8];

    const eyeCenter = {
      x: (leftEye.x + rightEye.x) / 2,
      y: (leftEye.y + rightEye.y) / 2,
    };

    const horizontalAngle =
      Math.atan2(noseTip.x - eyeCenter.x, noseTip.y - eyeCenter.y) *
      (180 / Math.PI);
    const verticalAngle =
      Math.atan2(chin.y - eyeCenter.y, Math.abs(chin.x - eyeCenter.x)) *
      (180 / Math.PI);

    return { horizontal: horizontalAngle, vertical: verticalAngle };
  }, []);

  const getAttendances = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get(`/get-attendances/${month + 1}/${year}`, {
        withCredentials: true,
      });
      setAttendances(res.data);
    } catch (error) {
      console.error(error.response?.data?.message || error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    getAttendances();
  }, [month, year]);

  useEffect(() => {
    const loadModels = async () => {
      const MODEL_URL = "/models";
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(
          `${MODEL_URL}/tiny_face_detector_model`
        ),
        faceapi.nets.faceLandmark68Net.loadFromUri(
          `${MODEL_URL}/face_landmark_68_model`
        ),
        faceapi.nets.faceRecognitionNet.loadFromUri(
          `${MODEL_URL}/face_recognition_model`
        ),
      ]);
    };
    loadModels();
  }, []);

  const memoizedAttendances = useMemo(() => attendances, [attendances]);

  const todayAttendance = useMemo(() => {
    const currentDate = new Date().setHours(0, 0, 0, 0);
    return memoizedAttendances.find((attendance) => {
      const attendanceDate = new Date(attendance.date).setHours(0, 0, 0, 0);
      return attendanceDate === currentDate;
    });
  }, [memoizedAttendances]);

  useEffect(() => {
    if (todayAttendance) {
      setTodayTimeIn(todayAttendance.timeIn);
      setTodayTimeOut(todayAttendance.timeOut);
    }
  }, [todayAttendance]);

  const disableFields = useMemo(
    () => ({
      timeIn: !!todayTimeIn,
      timeOut: !!todayTimeOut,
    }),
    [todayTimeIn, todayTimeOut]
  );

  const getStepMessage = useCallback((state) => {
    switch (state.step) {
      case "camera_access":
        return "Requesting camera access...";
      case "camera_setup":
        return "Setting up camera...";
      case "face_detection":
        return "Detecting face...";
      case "liveness_instruction":
        return "Please follow the instructions to verify you're a real person";
      case "liveness_head_movement":
        return "Slowly turn your head left and right";
      case "face_analysis":
        return "Analyzing facial features...";
      case "face_matching":
        return "Matching with stored face data...";
      case "location_access":
        return "Getting location...";
      case "recording_attendance":
        return "Recording attendance...";
      default:
        return "Processing...";
    }
  }, []);

  // Throttled state update function to prevent flickering
  const updateFaceRecognitionState = useCallback(
    (newState) => {
      const now = Date.now();

      // Always allow step changes immediately
      if (newState.step && newState.step !== faceRecognitionState.step) {
        setFaceRecognitionState((prev) => {
          return { ...prev, ...newState };
        });
        livenessDataRef.current.lastUpdateTime = now;
        return;
      }

      // Throttle progress updates
      if (now - livenessDataRef.current.lastUpdateTime > UPDATE_THROTTLE) {
        setFaceRecognitionState((prev) => ({ ...prev, ...newState }));
        livenessDataRef.current.lastUpdateTime = now;
      }
    },
    [faceRecognitionState.step]
  );

  // Setup video stream effect - runs only when videoStream changes
  useEffect(() => {
    if (
      faceRecognitionState.showVideo &&
      faceRecognitionState.videoStream &&
      videoCallbackRef.current
    ) {
      const video = videoCallbackRef.current;
      // Only set srcObject if it's different
      if (video.srcObject !== faceRecognitionState.videoStream) {
        video.srcObject = faceRecognitionState.videoStream;
        videoStreamRef.current = faceRecognitionState.videoStream;

        video.play().catch((error) => {
          console.error("Error playing video:", error);
        });
      }
    }
  }, [faceRecognitionState.showVideo, faceRecognitionState.videoStream]);

  // Cleanup effect
  useEffect(() => {
    return () => {
      if (videoStreamRef.current) {
        videoStreamRef.current.getTracks().forEach((track) => track.stop());
        videoStreamRef.current = null;
      }
    };
  }, []);

  const performLivenessDetection = async (video) => {
    return new Promise((resolve, reject) => {
      // Reset refs
      livenessDataRef.current = {
        headPositions: [],
        frameCount: 0,
        lastUpdateTime: 0,
      };

      let maxHeadMovement = 0;

      const detectionInterval = setInterval(async () => {
        try {
          const detection = await faceapi
            .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
            .withFaceLandmarks();

          if (!detection) {
            return;
          }

          const landmarks = detection.landmarks.positions;

          // Head Movement Detection
          const headPose = calculateHeadPose(landmarks);
          livenessDataRef.current.headPositions.push(headPose);

          if (
            livenessDataRef.current.headPositions.length > HEAD_MOVEMENT_SAMPLES
          ) {
            livenessDataRef.current.headPositions.shift();
          }

          if (livenessDataRef.current.headPositions.length >= 2) {
            const movements = [];
            for (
              let i = 1;
              i < livenessDataRef.current.headPositions.length;
              i++
            ) {
              const horizontalDiff = Math.abs(
                livenessDataRef.current.headPositions[i].horizontal -
                  livenessDataRef.current.headPositions[i - 1].horizontal
              );
              const verticalDiff = Math.abs(
                livenessDataRef.current.headPositions[i].vertical -
                  livenessDataRef.current.headPositions[i - 1].vertical
              );
              movements.push(Math.max(horizontalDiff, verticalDiff));
            }

            maxHeadMovement = Math.max(...movements);
          }

          livenessDataRef.current.frameCount++;

          // Throttled UI update - progress is based on head movement only
          const headProgress = Math.min(maxHeadMovement / 15, 1) * 100;

          updateFaceRecognitionState({
            headMovementDetected: maxHeadMovement > 15,
            progress: headProgress,
          });

          // Check if liveness detection is complete (head movement only)
          if (maxHeadMovement > 15) {
            clearInterval(detectionInterval);
            resolve(true);
          }

          // Timeout after 30 seconds
          if (livenessDataRef.current.frameCount > 300) {
            clearInterval(detectionInterval);
            reject(new Error("Liveness detection timeout. Please try again."));
          }
        } catch (error) {
          console.error("❌ Liveness detection error:", error);
        }
      }, 100);
    });
  };

  const handleAttendance = async (fieldType) => {
    let stream = null;
    let video = null;

    try {
      setField(fieldType);
      setDialogOpen(true);

      // Single state update instead of multiple
      setFaceRecognitionState({
        step: "camera_access",
        showVideo: false,
        videoStream: null,
        progress: 0,
        headMovementDetected: false,
      });

      if (!user?.face_descriptor) {
        throw new Error("Face data not available for user.");
      }

      let descriptorArray = user.face_descriptor;
      if (typeof descriptorArray === "string") {
        descriptorArray = JSON.parse(descriptorArray);
      }

      const storedDescriptor = new Float32Array(descriptorArray);

      updateFaceRecognitionState({ step: "camera_setup" });

      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user",
        },
      });

      video = document.createElement("video");
      video.srcObject = stream;
      video.setAttribute("autoplay", true);
      video.setAttribute("muted", true);
      video.setAttribute("playsinline", true);

      updateFaceRecognitionState({
        step: "face_detection",
        showVideo: true,
        videoStream: stream,
      });

      await video.play();
      await new Promise((resolve) => setTimeout(resolve, 1000));

      updateFaceRecognitionState({ step: "liveness_instruction" });
      await new Promise((resolve) => setTimeout(resolve, 2000));

      updateFaceRecognitionState({ step: "liveness_head_movement" });

      // Perform liveness detection
      await performLivenessDetection(video);

      // Face verification after liveness check
      updateFaceRecognitionState({ step: "face_analysis" });
      const detection = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!detection || !detection.descriptor) {
        throw new Error(
          "Face not detected during verification. Please try again."
        );
      }

      updateFaceRecognitionState({ step: "face_matching" });
      const distance = faceapi.euclideanDistance(
        storedDescriptor,
        detection.descriptor
      );

      if (distance > 0.6) {
        throw new Error("Face does not match. Please try again.");
      }

      setDialogOpen(false);

      const geoLocation = await getGeolocation(setAlert, setShowConsentDrawer);
      if (!geoLocation) return;

      await addAttendance(
        fieldType,
        setAlert,
        getAttendances,
        geoLocation.latitude,
        geoLocation.longitude
      );
    } catch (err) {
      console.error("❌ Face recognition error:", err);
      setDialogOpen(false);
      setAlert({
        open: true,
        message: err.message || "Error verifying identity. Please try again.",
        severity: "error",
      });
    } finally {
      if (stream) stream.getTracks().forEach((track) => track.stop());
      if (video) video.remove();

      // Reset state in one update
      setFaceRecognitionState({
        step: "",
        showVideo: false,
        videoStream: null,
        progress: 0,
        headMovementDetected: false,
      });
    }
  };

  // Memoize the dialog component to prevent unnecessary re-renders
  const FaceRecognitionDialog = React.memo(() => {
    const isLivenessStep = [
      "liveness_instruction",
      "liveness_head_movement",
    ].includes(faceRecognitionState.step);

    return (
      <Dialog
        open={dialogOpen}
        maxWidth="sm"
        fullWidth
        disableEscapeKeyDown
        onClose={() => console.log("Dialog close attempt blocked")}
        keepMounted={false}
        transitionDuration={0}
      >
        <DialogContent sx={{ textAlign: "center", py: 4 }}>
          <Typography
            variant="h6"
            sx={{
              mb: 2,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            Face Recognition in Progress
          </Typography>

          <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
            {getStepMessage(faceRecognitionState)}
          </Typography>

          {faceRecognitionState.showVideo &&
            faceRecognitionState.videoStream && (
              <Box
                sx={{
                  position: "relative",
                  width: "400px",
                  height: "300px",
                  margin: "10px auto",
                  border: "3px solid #1976d2",
                  borderRadius: "12px",
                  overflow: "hidden",
                  backgroundColor: "#000",
                }}
              >
                <video
                  ref={videoCallbackRef}
                  autoPlay
                  muted
                  playsInline
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />

                <Box
                  sx={{
                    position: "absolute",
                    top: "10%",
                    left: "25%",
                    right: "25%",
                    bottom: "15%",
                    border: "2px dashed rgba(255, 255, 255, 0.8)",
                    borderRadius: "50%",
                    pointerEvents: "none",
                  }}
                />

                {isLivenessStep && (
                  <Box
                    sx={{
                      position: "absolute",
                      top: "10px",
                      left: "50%",
                      transform: "translateX(-50%)",
                      color: "white",
                    }}
                  >
                    <Box
                      sx={{
                        backgroundColor:
                          faceRecognitionState.headMovementDetected
                            ? "rgba(76, 175, 80, 0.8)"
                            : "rgba(0, 0, 0, 0.7)",
                        padding: "4px 8px",
                        borderRadius: "4px",
                        fontSize: "12px",
                      }}
                    >
                      🔄 Head Movement:{" "}
                      {faceRecognitionState.headMovementDetected ? "✓" : "..."}
                    </Box>
                  </Box>
                )}

                <Typography
                  variant="caption"
                  sx={{
                    position: "absolute",
                    bottom: "10px",
                    left: "50%",
                    transform: "translateX(-50%)",
                    color: "white",
                    backgroundColor: "rgba(0,0,0,0.7)",
                    padding: "8px",
                    borderRadius: "4px",
                    maxWidth: "90%",
                    textAlign: "center",
                  }}
                >
                  {isLivenessStep
                    ? "Slowly turn your head left and right to verify you're real"
                    : "Position your face in the circle"}
                </Typography>
              </Box>
            )}
        </DialogContent>
      </Dialog>
    );
  });

  return (
    <div className="dashboard-container mark-attendance">
      <div className="flex-div">
        <div style={{ flex: 1 }}>
          {!disableFields.timeIn && (
            <button
              onClick={() => handleAttendance("timeIn")}
              className="btn"
              disabled={dialogOpen}
            >
              <AccessTimeIcon sx={{ fontSize: "20px", marginRight: "5px" }} />
              Punch In
            </button>
          )}
          {disableFields.timeIn && !disableFields.timeOut && (
            <button
              onClick={() => handleAttendance("timeOut")}
              className="btn"
              disabled={dialogOpen}
            >
              <AccessTimeIcon sx={{ fontSize: "20px", marginRight: "5px" }} />
              Punch Out
            </button>
          )}
        </div>

        <div>
          {loading ? (
            <Skeleton variant="text" width={100} />
          ) : (
            <>
              <p>
                <strong>Time In:</strong> {todayTimeIn || "Not recorded yet"}
              </p>
              <p>
                <strong>Time Out:</strong> {todayTimeOut || "Not recorded yet"}
              </p>
            </>
          )}
        </div>
      </div>

      <Suspense fallback={<div>Loading...</div>}>
        <CustomCalendar
          attendances={memoizedAttendances}
          month={month}
          setMonth={setMonth}
          year={year}
          setYear={setYear}
          currentDate={currentDate}
        />
      </Suspense>

      <div className="legend-container">
        <span className="legend-item">
          <span className="dot present"></span>Present
        </span>
        <span className="legend-item">
          <span className="dot half"></span>Half Day
        </span>
        <span className="legend-item">
          <span className="dot leave"></span>Leave
        </span>
        <span className="legend-item">
          <span className="dot holiday"></span>Holiday
        </span>
        <span className="legend-item">
          <span className="dot today"></span>Today
        </span>
      </div>

      <FaceRecognitionDialog />

      <LocationConsentDrawer
        showConsentDrawer={showConsentDrawer}
        setShowConsentDrawer={setShowConsentDrawer}
        onAllowLocation={(geo) =>
          addAttendance(
            field,
            setAlert,
            getAttendances,
            geo.latitude,
            geo.longitude
          )
        }
        onDenyLocation={() =>
          setAlert({
            open: true,
            message: "Location access denied. Attendance cannot be recorded.",
            severity: "error",
          })
        }
      />
    </div>
  );
}

export default React.memo(MarkAttendance);
