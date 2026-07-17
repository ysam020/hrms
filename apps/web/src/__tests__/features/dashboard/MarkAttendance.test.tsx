import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import MarkAttendance from "@web/features/dashboard/MarkAttendance";
import { AlertContext } from "@web/app/providers/AlertContext";
import { useDashboard } from "@web/app/providers/DashboardContext";
import { useAttendanceData } from "@web/shared/hooks/useAttendanceData";
import { useAttendanceProcess } from "@web/shared/hooks/useAttendanceProcess";
import { addAttendance } from "@web/shared/utils/addAttendance";

vi.mock("@web/app/providers/DashboardContext", () => ({
  useDashboard: vi.fn(),
}));
vi.mock("@web/shared/hooks/useAttendanceData", () => ({
  useAttendanceData: vi.fn(),
}));
vi.mock("@web/shared/hooks/useCurrentTime", () => ({
  useCurrentTime: () => ({ currentTime: "10:00 AM", getCurrentTime: vi.fn() }),
}));
vi.mock("@web/shared/hooks/useFaceRecognition", () => ({
  useFaceRecognition: () => ({
    faceRecognitionState: {},
    videoStreamRef: { current: null },
  }),
}));
vi.mock("@web/shared/hooks/useVideoCallback", () => ({
  useVideoCallback: () => ({ videoCallbackRef: { current: null } }),
}));
vi.mock("@web/shared/hooks/useStepMessage", () => ({
  useStepMessage: () => ({ getStepMessage: vi.fn() }),
}));
vi.mock("@web/shared/hooks/useAttendanceProcess", () => ({
  useAttendanceProcess: vi.fn(),
}));
vi.mock("@web/shared/utils/addAttendance", () => ({ addAttendance: vi.fn() }));
vi.mock("@web/core/config/faceapiConfig", () => ({
  loadFaceApiModels: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@web/features/dashboard/FaceRecognitionDialog", () => ({
  FaceRecognitionDialog: () => <div>Stub FaceRecognitionDialog</div>,
}));
vi.mock("@web/shared/components/LocationConsentDrawer", () => ({
  default: (props: any) => (
    <div>
      <span>LocationConsentDrawer</span>
      <button
        onClick={() => props.onAllowLocation({ latitude: 1, longitude: 2 })}
      >
        allow-location
      </button>
      <button onClick={props.onDenyLocation}>deny-location</button>
    </div>
  ),
}));
vi.mock("@web/shared/components/CameraConsentDrawer", () => ({
  default: (props: any) => (
    <div>
      <span>CameraConsentDrawer</span>
      <button onClick={props.onAllowCamera}>allow-camera</button>
      <button onClick={props.onDenyCamera}>deny-camera</button>
    </div>
  ),
}));

const mockUseDashboard = useDashboard as unknown as ReturnType<typeof vi.fn>;
const mockUseAttendanceData = useAttendanceData as unknown as ReturnType<
  typeof vi.fn
>;
const mockUseAttendanceProcess = useAttendanceProcess as unknown as ReturnType<
  typeof vi.fn
>;
const mockAddAttendance = addAttendance as unknown as ReturnType<typeof vi.fn>;

function mockPermissions(state: "granted" | "prompt" | "denied" | "error") {
  (global as any).navigator.permissions = {
    query:
      state === "error"
        ? vi.fn().mockRejectedValue(new Error("not supported"))
        : vi.fn().mockResolvedValue({ state }),
  };
}

function renderMarkAttendance(compact = false, setAlert = vi.fn()) {
  return render(
    <AlertContext.Provider value={{ setAlert } as any}>
      <MarkAttendance compact={compact} />
    </AlertContext.Provider>,
  );
}

describe("MarkAttendance", () => {
  const processAttendance = vi.fn();
  const setShowConsentDrawer = vi.fn();

  beforeEach(() => {
    mockUseDashboard.mockReturnValue({
      data: { attendances: [] },
      loading: { attendances: false },
      refetch: vi.fn(),
    });
    mockUseAttendanceProcess.mockReturnValue({
      dialogOpen: false,
      field: "timeIn",
      showConsentDrawer: false,
      setShowConsentDrawer,
      processAttendance,
    });
    processAttendance.mockClear();
    setShowConsentDrawer.mockClear();
    mockAddAttendance.mockClear();
    mockPermissions("granted");
  });

  describe("compact mode", () => {
    it("shows a skeleton while initial data is loading", () => {
      mockUseAttendanceData.mockReturnValue({
        loading: true,
        todayTimeIn: undefined,
        todayTimeOut: undefined,
        disableFields: { timeIn: false, timeOut: false },
        getStatus: () => ({ text: "Not Started", color: "default" }),
      });
      const { container } = renderMarkAttendance(true);
      expect(container.querySelector(".MuiSkeleton-root")).toBeInTheDocument();
    });

    it("shows a completion message once both punches are recorded", () => {
      mockUseAttendanceData.mockReturnValue({
        loading: false,
        todayTimeIn: "09:00",
        todayTimeOut: "18:00",
        disableFields: { timeIn: true, timeOut: true },
        getStatus: () => ({ text: "Complete", color: "success" }),
      });
      renderMarkAttendance(true);
      expect(
        screen.getByText("✓ Attendance complete for today"),
      ).toBeInTheDocument();
    });

    it("shows the Punch In button before check-in", () => {
      mockUseAttendanceData.mockReturnValue({
        loading: false,
        todayTimeIn: undefined,
        todayTimeOut: undefined,
        disableFields: { timeIn: false, timeOut: false },
        getStatus: () => ({ text: "Not Started", color: "default" }),
      });
      renderMarkAttendance(true);
      expect(screen.getByText("Punch In")).toBeInTheDocument();
    });
  });

  describe("full mode / handleAttendance permission flow", () => {
    beforeEach(() => {
      mockUseAttendanceData.mockReturnValue({
        loading: false,
        todayTimeIn: undefined,
        todayTimeOut: undefined,
        disableFields: { timeIn: false, timeOut: false },
        getStatus: () => ({ text: "Not Started", color: "default" }),
      });
    });

    it("loads face models and starts attendance processing when camera permission is already granted", async () => {
      mockPermissions("granted");
      renderMarkAttendance(false);
      fireEvent.click(screen.getByText("Punch In"));

      await waitFor(() =>
        expect(processAttendance).toHaveBeenCalledWith("timeIn"),
      );
      expect(screen.queryByText("CameraConsentDrawer")).not.toBeInTheDocument();
    });

    it("shows the camera consent drawer when permission is not yet granted", async () => {
      mockPermissions("prompt");
      renderMarkAttendance(false);
      fireEvent.click(screen.getByText("Punch In"));

      expect(
        await screen.findByText("CameraConsentDrawer"),
      ).toBeInTheDocument();
      expect(processAttendance).not.toHaveBeenCalled();
    });

    it("shows the camera consent drawer when the permissions API itself throws", async () => {
      mockPermissions("error");
      renderMarkAttendance(false);
      fireEvent.click(screen.getByText("Punch In"));

      expect(
        await screen.findByText("CameraConsentDrawer"),
      ).toBeInTheDocument();
    });

    it("allowing camera from the consent drawer loads models and processes attendance", async () => {
      mockPermissions("prompt");
      renderMarkAttendance(false);
      fireEvent.click(screen.getByText("Punch In"));
      fireEvent.click(await screen.findByText("allow-camera"));

      await waitFor(() =>
        expect(processAttendance).toHaveBeenCalledWith("timeIn"),
      );
    });

    it("denying camera shows an error alert and closes the drawer", async () => {
      mockPermissions("prompt");
      const setAlert = vi.fn();
      renderMarkAttendance(false, setAlert);
      fireEvent.click(screen.getByText("Punch In"));
      fireEvent.click(await screen.findByText("deny-camera"));

      expect(setAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: "error",
          message: "Camera access is required for face verification.",
        }),
      );
    });
  });

  describe("location consent", () => {
    beforeEach(() => {
      mockUseAttendanceData.mockReturnValue({
        loading: false,
        todayTimeIn: undefined,
        todayTimeOut: undefined,
        disableFields: { timeIn: false, timeOut: false },
        getStatus: () => ({ text: "Not Started", color: "default" }),
      });
    });

    it("records attendance with the granted coordinates on location allow", async () => {
      mockUseAttendanceProcess.mockReturnValue({
        dialogOpen: false,
        field: "timeIn",
        showConsentDrawer: true,
        setShowConsentDrawer,
        processAttendance,
      });
      renderMarkAttendance(false);

      fireEvent.click(await screen.findByText("allow-location"));

      await waitFor(() =>
        expect(mockAddAttendance).toHaveBeenCalledWith(
          "timeIn",
          expect.any(Function),
          expect.any(Function),
          1,
          2,
        ),
      );
      expect(setShowConsentDrawer).toHaveBeenCalledWith(false);
    });

    it("shows an error alert and closes the drawer when location is denied", async () => {
      mockUseAttendanceProcess.mockReturnValue({
        dialogOpen: false,
        field: "timeIn",
        showConsentDrawer: true,
        setShowConsentDrawer,
        processAttendance,
      });
      const setAlert = vi.fn();
      renderMarkAttendance(false, setAlert);

      fireEvent.click(await screen.findByText("deny-location"));

      expect(setAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: "error",
          message: "Location access denied. Attendance cannot be recorded.",
        }),
      );
      expect(setShowConsentDrawer).toHaveBeenCalledWith(false);
    });
  });
});
