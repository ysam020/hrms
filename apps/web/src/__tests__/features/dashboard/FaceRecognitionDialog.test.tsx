import { render, screen } from "@testing-library/react";
import { FaceRecognitionDialog } from "@web/features/dashboard/FaceRecognitionDialog";
import { ThemeContext } from "@web/app/providers/ThemeContext";

function renderDialog(overrides: Partial<any> = {}) {
  return render(
    <ThemeContext.Provider
      value={{ theme: "light", toggleTheme: vi.fn() } as any}
    >
      <FaceRecognitionDialog
        dialogOpen={true}
        faceRecognitionState={{ step: "verification", showVideo: false }}
        videoCallbackRef={{ current: null }}
        getStepMessage={() => "Please look at the camera"}
        theme="light"
        {...overrides}
      />
    </ThemeContext.Provider>,
  );
}

describe("FaceRecognitionDialog", () => {
  it("renders nothing (dialog closed) when dialogOpen is false", () => {
    renderDialog({ dialogOpen: false });
    expect(
      screen.queryByText("Face Recognition Verification"),
    ).not.toBeInTheDocument();
  });

  it("shows verification copy for a non-enrollment step", () => {
    renderDialog({
      faceRecognitionState: { step: "verification", showVideo: false },
    });
    expect(
      screen.getByText("Face Recognition Verification"),
    ).toBeInTheDocument();
  });

  it("shows enrollment copy and the enrollment security notice for an enrollment step", () => {
    renderDialog({
      faceRecognitionState: { step: "enrollment_liveness", showVideo: false },
    });
    expect(screen.getByText("Face Enrollment")).toBeInTheDocument();
    expect(screen.getByText(/One-time Setup:/)).toBeInTheDocument();
  });

  it("shows the verification security notice for a non-enrollment step", () => {
    renderDialog({
      faceRecognitionState: { step: "verification", showVideo: false },
    });
    expect(screen.getByText(/Secure Verification:/)).toBeInTheDocument();
  });

  it("shows the loading section when the video stream is not yet ready", () => {
    renderDialog({
      faceRecognitionState: { step: "verification", showVideo: false },
    });
    expect(
      screen.getByText("Preparing camera for face recognition..."),
    ).toBeInTheDocument();
  });

  it("shows the live video feed once the stream is ready", () => {
    renderDialog({
      faceRecognitionState: {
        step: "verification",
        showVideo: true,
        videoStream: {},
      },
    });
    expect(document.querySelector("video")).toBeInTheDocument();
    expect(
      screen.queryByText("Preparing camera for face recognition..."),
    ).not.toBeInTheDocument();
  });

  it("shows the head-movement progress overlay only during a liveness step", () => {
    renderDialog({
      faceRecognitionState: {
        step: "liveness_head_movement",
        showVideo: true,
        videoStream: {},
        headMovementDetected: false,
        progress: 40,
      },
    });
    expect(screen.getByText("Head Movement Detection")).toBeInTheDocument();
    expect(screen.getByText("Move Head")).toBeInTheDocument();
  });

  it("shows a Detected chip once head movement is confirmed", () => {
    renderDialog({
      faceRecognitionState: {
        step: "liveness_head_movement",
        showVideo: true,
        videoStream: {},
        headMovementDetected: true,
        progress: 100,
      },
    });
    expect(screen.getByText("✓ Detected")).toBeInTheDocument();
  });

  it("hides the progress overlay outside of a liveness step", () => {
    renderDialog({
      faceRecognitionState: {
        step: "verification",
        showVideo: true,
        videoStream: {},
      },
    });
    expect(
      screen.queryByText("Head Movement Detection"),
    ).not.toBeInTheDocument();
  });

  it("shows liveness instructions during a liveness step", () => {
    renderDialog({
      faceRecognitionState: {
        step: "liveness_instruction",
        showVideo: true,
        videoStream: {},
      },
    });
    expect(screen.getByText(/Slowly turn your head/)).toBeInTheDocument();
  });

  it("shows enrollment-specific positioning instructions", () => {
    renderDialog({
      faceRecognitionState: {
        step: "enrollment_capture",
        showVideo: true,
        videoStream: {},
      },
    });
    expect(
      screen.getByText(/Position your face clearly in the circle/),
    ).toBeInTheDocument();
  });

  it("shows verification positioning instructions by default", () => {
    renderDialog({
      faceRecognitionState: {
        step: "verification",
        showVideo: true,
        videoStream: {},
      },
    });
    expect(
      screen.getByText("👤 Position your face in the circle"),
    ).toBeInTheDocument();
  });

  it("renders the step message from getStepMessage", () => {
    renderDialog({ getStepMessage: () => "Custom step message" });
    expect(screen.getByText("Custom step message")).toBeInTheDocument();
  });
});
