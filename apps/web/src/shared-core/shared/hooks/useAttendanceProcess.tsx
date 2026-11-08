import { useState, useCallback, useContext, useRef } from "react";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import { getGeolocation } from "@web/core/auth";
import { addAttendance } from "@web/shared/utils/addAttendance";
import apiClient from "@web/core/http/axiosConfig";
import { API_ENDPOINTS } from "@web/shared/constants";

export const useAttendanceProcess = (faceRecognition, refreshAttendances) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [field, setField] = useState("");
  const [showConsentDrawer, setShowConsentDrawer] = useState(false);

  const { setAlert } = useContext(AlertContext);
  const { setUser } = useContext(UserContext);
  // Kept across the location-consent prompt, which finishes the punch later.
  const faceAttestationRef = useRef<string | undefined>(undefined);

  const {
    updateFaceRecognitionState,
    performLivenessDetection,
    performFaceEnrollment,
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

        const { data: descriptorStatus } = await apiClient.get(
          API_ENDPOINTS.CHECK_FACE_DESCRIPTOR,
        );
        const hasDescriptor = descriptorStatus?.data?.hasDescriptor === true;
        faceAttestationRef.current = undefined;

        updateFaceRecognitionState({ step: "camera_setup" });

        const cameraSetup = await setupCamera();
        stream = cameraSetup.stream;
        video = cameraSetup.video;

        updateFaceRecognitionState({
          step: "face_detection",
          showVideo: true,
          videoStream: stream,
        });

        if (!hasDescriptor) {
          // ── Enrollment mode ─────────────────────────────────────────────────
          updateFaceRecognitionState({ step: "enrollment_instruction" });
          await new Promise((resolve) => setTimeout(resolve, 2500));

          updateFaceRecognitionState({ step: "enrollment_liveness" });
          await performLivenessDetection(video);

          updateFaceRecognitionState({ step: "enrollment_capture" });
          const descriptor = await performFaceEnrollment(video);

          updateFaceRecognitionState({ step: "enrollment_saving" });
          const { data: saved } = await apiClient.post(
            API_ENDPOINTS.SAVE_FACE_DESCRIPTOR,
            { descriptor },
          );
          faceAttestationRef.current = saved?.data?.attestation;

          // Persist in user context so subsequent punch-outs use verification
          setUser((prev: any) => ({ ...prev, face_descriptor: descriptor }));
        } else {
          // ── Verification mode ───────────────────────────────────────────────
          updateFaceRecognitionState({ step: "liveness_instruction" });
          await new Promise((resolve) => setTimeout(resolve, 2000));

          updateFaceRecognitionState({ step: "liveness_head_movement" });
          await performLivenessDetection(video);

          updateFaceRecognitionState({ step: "face_analysis" });
          const liveDescriptor = await performFaceEnrollment(video);

          updateFaceRecognitionState({ step: "face_matching" });
          const { data: challenge } = await apiClient.post(
            API_ENDPOINTS.FACE_CHALLENGE,
          );
          const { data: verified } = await apiClient.post(
            API_ENDPOINTS.FACE_VERIFY,
            {
              challengeId: challenge?.data?.challengeId,
              descriptor: liveDescriptor,
            },
          );
          faceAttestationRef.current = verified?.data?.attestation;
        }

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
          faceAttestationRef.current,
        );
      } catch (err) {
        console.error("Face recognition error:", err);
        setDialogOpen(false);
        setAlert({
          open: true,
          message:
            err.response?.data?.message ||
            err.message ||
            "Error verifying identity. Please try again.",
          severity: "error",
        });
      } finally {
        if (stream) stream.getTracks().forEach((track) => track.stop());
        if (video) video.remove();
        cleanupCamera();
      }
    },
    [
      setUser,
      setAlert,
      updateFaceRecognitionState,
      setupCamera,
      performLivenessDetection,
      performFaceEnrollment,
      cleanupCamera,
      refreshAttendances,
    ],
  );

  return {
    faceAttestationRef,
    dialogOpen,
    setDialogOpen,
    field,
    showConsentDrawer,
    setShowConsentDrawer,
    processAttendance,
  };
};
