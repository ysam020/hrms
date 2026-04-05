import { useState, useCallback, useContext } from "react";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import { getGeolocation } from "@web/core/auth";
import { addAttendance } from "@web/shared/utils/addAttendance";

export const useAttendanceProcess = (faceRecognition, refreshAttendances) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [field, setField] = useState("");
  const [showConsentDrawer, setShowConsentDrawer] = useState(false);

  const { setAlert } = useContext(AlertContext);
  const { user } = useContext(UserContext);

  const {
    updateFaceRecognitionState,
    performLivenessDetection,
    performFaceVerification,
    setupCamera,
    cleanupCamera,
  } = faceRecognition;

  const processAttendance = useCallback(
    async (fieldType) => {
      let stream: MediaStream | null = null;
      let video: HTMLVideoElement | null = null;

      try {
        setField(fieldType);
        setDialogOpen(true);

        updateFaceRecognitionState({
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

        const cameraSetup = await setupCamera();
        stream = cameraSetup.stream;
        video = cameraSetup.video;

        updateFaceRecognitionState({
          step: "face_detection",
          showVideo: true,
          videoStream: stream,
        });

        updateFaceRecognitionState({ step: "liveness_instruction" });
        await new Promise((resolve) => setTimeout(resolve, 2000));

        updateFaceRecognitionState({ step: "liveness_head_movement" });

        await performLivenessDetection(video);

        updateFaceRecognitionState({ step: "face_analysis" });

        await performFaceVerification(video, storedDescriptor);

        updateFaceRecognitionState({ step: "face_matching" });

        setDialogOpen(false);

        const geoLocation = await getGeolocation(
          setAlert as any,
          setShowConsentDrawer,
        );
        if (!geoLocation) return;

        await addAttendance(
          fieldType,
          setAlert,
          refreshAttendances,
          geoLocation.latitude,
          geoLocation.longitude,
        );
      } catch (err) {
        console.error("Face recognition error:", err);
        setDialogOpen(false);
        setAlert({
          open: true,
          message: err.message || "Error verifying identity. Please try again.",
          severity: "error",
        });
      } finally {
        if (stream) stream.getTracks().forEach((track) => track.stop());
        if (video) video.remove();
        cleanupCamera();
      }
    },
    [
      user,
      setAlert,
      updateFaceRecognitionState,
      setupCamera,
      performLivenessDetection,
      performFaceVerification,
      cleanupCamera,
      refreshAttendances,
    ],
  );

  return {
    dialogOpen,
    setDialogOpen,
    field,
    showConsentDrawer,
    setShowConsentDrawer,
    processAttendance,
  };
};
