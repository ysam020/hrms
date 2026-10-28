import { useCallback, useEffect } from "react";

export const useVideoCallback = (faceRecognitionState, videoStreamRef) => {
  const videoCallbackRef = useCallback(
    (node) => {
      if (node && faceRecognitionState.videoStream) {
        node.srcObject = faceRecognitionState.videoStream;
        videoStreamRef.current = faceRecognitionState.videoStream;
        node.play().catch((error) => {
          console.error("Error playing video:", error);
        });
      }
    },
    [faceRecognitionState.videoStream, videoStreamRef],
  );

  useEffect(() => {
    return () => {
      if (videoStreamRef.current) {
        videoStreamRef.current.getTracks().forEach((track) => track.stop());
        videoStreamRef.current = null;
      }
    };
  }, [videoStreamRef]);

  return { videoCallbackRef };
};
