import { useCallback, useContext, useRef, useState } from "react";
import { preconnect } from "react-dom";
import { AlertContext } from "@web/app/providers/AlertContext";
import { useFaceRecognition } from "@web/shared/hooks/useFaceRecognition";
import { useAttendanceProcess } from "@web/shared/hooks/useAttendanceProcess";
import { useVideoCallback } from "@web/shared/hooks/useVideoCallback";
import { useStepMessage } from "@web/shared/hooks/useStepMessage";
import { addAttendance } from "@web/shared/utils/addAttendance";
import { Button, Dialog, Spinner } from "@next/ui";
import { usePermissionPrimer, DEFAULT_COPY } from "@next/ui/permissionPrimer";
import { Presence } from "@next/motion";

type Field = "timeIn" | "timeOut";

/**
 * Punch in/out. The pipeline — face enrollment/verification with liveness,
 * geolocation, and the attendance write — is Classic's own hooks
 * (useFaceRecognition, useAttendanceProcess, addAttendance). This hook only
 * sequences the consent prompts that Classic's MarkAttendance component
 * shows as drawers, and renders them in Praesto Next's dialog style.
 */
export function usePunch(refresh: () => void) {
  const { setAlert } = useContext(AlertContext);
  const face = useFaceRecognition();
  const { videoCallbackRef } = useVideoCallback(
    face.faceRecognitionState,
    face.videoStreamRef,
  );
  const { getStepMessage } = useStepMessage();
  const process = useAttendanceProcess(face, refresh);
  const { ask, primer } = usePermissionPrimer();
  const [preparing, setPreparing] = useState(false);
  const pending = useRef<Field | null>(null);
  const modelsReady = useRef(false);

  const loadModels = useCallback(async () => {
    if (modelsReady.current) return true;
    setPreparing(true);
    try {
      const { loadFaceApiModels } =
        await import("@web/core/config/faceapiConfig");
      await loadFaceApiModels();
      modelsReady.current = true;
      return true;
    } catch {
      setAlert({
        open: true,
        message:
          "Face verification couldn’t start. Check your connection and try again.",
        severity: "error",
      });
      return false;
    } finally {
      setPreparing(false);
    }
  }, [setAlert]);

  const start = useCallback(
    async (field: Field) => {
      pending.current = field;
      // The face models come from jsDelivr (fetch, so CORS mode). Open that
      // connection now, while the permission check and the face-api chunk
      // load, instead of after them. Nothing is downloaded until needed.
      if (!modelsReady.current)
        preconnect("https://cdn.jsdelivr.net", { crossOrigin: "anonymous" });
      // Explains the face check before the browser's camera prompt, or how
      // to unblock the camera; resolves at once if it's already allowed.
      if (!(await ask("camera"))) return;
      if (await loadModels()) process.processAttendance(field);
    },
    [ask, loadModels, process],
  );

  const allowLocation = () => {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        process.setShowConsentDrawer(false);
        await addAttendance(
          process.field,
          setAlert,
          refresh,
          pos.coords.latitude,
          pos.coords.longitude,
          process.faceAttestationRef.current,
        );
      },
      () => {
        process.setShowConsentDrawer(false);
        setAlert({
          open: true,
          message:
            "Location access denied. Attendance can’t be recorded without it.",
          severity: "error",
        });
      },
      { timeout: 10000, maximumAge: 60000 },
    );
  };

  const step = face.faceRecognitionState.step;
  const dialogs = (
    <>
      {primer}
      <Dialog
        open={process.dialogOpen}
        onClose={() => {}}
        busy
        title={
          step?.startsWith("enrollment")
            ? "Set Up Face Check"
            : "Checking It’s You"
        }
        size="sm"
      >
        <div
          style={{
            display: "grid",
            gap: 14,
            justifyItems: "center",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: 240,
              height: 240,
              borderRadius: "50%",
              overflow: "hidden",
              background: "var(--px-neutral-soft)",
              display: "grid",
              placeItems: "center",
              boxShadow: "0 0 0 3px var(--px-accent-soft)",
            }}
          >
            {face.faceRecognitionState.showVideo ? (
              <video
                ref={videoCallbackRef}
                autoPlay
                playsInline
                muted
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  transform: "scaleX(-1)",
                }}
              />
            ) : (
              <Spinner label="Starting camera" size="large" />
            )}
          </div>
          <p
            aria-live="polite"
            className="px-secondary"
            style={{ minHeight: 40, maxWidth: 280 }}
          >
            {getStepMessage(face.faceRecognitionState)}
          </p>
        </div>
      </Dialog>
      <Dialog
        open={process.showConsentDrawer}
        onClose={() => process.setShowConsentDrawer(false)}
        title={DEFAULT_COPY.geolocation.title}
        description={DEFAULT_COPY.geolocation.reason}
        size="sm"
        icon={{ name: "pin", tone: "accent" }}
        footer={
          <>
            <Button onClick={() => process.setShowConsentDrawer(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={allowLocation}>
              Allow Location
            </Button>
          </>
        }
      >
        <ul
          className="px-secondary"
          style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 6 }}
        >
          {DEFAULT_COPY.geolocation.points?.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </Dialog>
    </>
  );

  return {
    start,
    busy: preparing || process.dialogOpen,
    dialogs,
    preparingNotice: (
      <Presence show={preparing} variant="fade">
        <span className="px-meta">Preparing face check…</span>
      </Presence>
    ),
  };
}
