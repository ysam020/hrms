import { useCallback } from "react";

export const useStepMessage = () => {
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
      case "enrollment_instruction":
        return "First-time setup: position your face clearly in the frame";
      case "enrollment_liveness":
        return "Slowly turn your head left and right to confirm you're present";
      case "enrollment_capture":
        return "Capturing your face...";
      case "enrollment_saving":
        return "Saving your face data for future attendance...";
      case "location_access":
        return "Getting location...";
      case "recording_attendance":
        return "Recording attendance...";
      default:
        return "Processing...";
    }
  }, []);

  return { getStepMessage };
};
