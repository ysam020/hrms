import { renderHook, waitFor, act } from "@testing-library/react";
import { useAttendanceProcess } from "@web/shared/hooks/useAttendanceProcess";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import { getGeolocation } from "@web/core/auth";
import { addAttendance } from "@web/shared/utils/addAttendance";
import apiClient from "@web/core/http/axiosConfig";

vi.mock("@web/core/http/axiosConfig", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

vi.mock("@web/core/auth", () => ({
  getGeolocation: vi.fn(),
}));

vi.mock("@web/shared/utils/addAttendance", () => ({
  addAttendance: vi.fn(),
}));

const mockGet = apiClient.get as unknown as ReturnType<typeof vi.fn>;
const mockPost = apiClient.post as unknown as ReturnType<typeof vi.fn>;
const mockGetGeolocation = getGeolocation as unknown as ReturnType<
  typeof vi.fn
>;
const mockAddAttendance = addAttendance as unknown as ReturnType<typeof vi.fn>;

function makeFaceRecognition() {
  return {
    updateFaceRecognitionState: vi.fn(),
    performLivenessDetection: vi.fn().mockResolvedValue(undefined),
    performFaceVerification: vi.fn().mockResolvedValue(undefined),
    performFaceEnrollment: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    setupCamera: vi.fn().mockResolvedValue({ stream: null, video: null }),
    cleanupCamera: vi.fn(),
  };
}

function wrapper(setAlert: any, setUser: any) {
  return ({ children }: any) => (
    <AlertContext.Provider value={{ setAlert } as any}>
      <UserContext.Provider value={{ setUser } as any}>
        {children}
      </UserContext.Provider>
    </AlertContext.Provider>
  );
}

describe("useAttendanceProcess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs the enrollment flow when no descriptor is stored yet, then punches in", async () => {
    mockGet.mockResolvedValue({ data: { data: { hasDescriptor: false } } });
    mockGetGeolocation.mockResolvedValue({ latitude: 1, longitude: 2 });
    const setAlert = vi.fn();
    const setUser = vi.fn();
    const faceRecognition = makeFaceRecognition();
    const refreshAttendances = vi.fn();

    const { result } = renderHook(
      () => useAttendanceProcess(faceRecognition, refreshAttendances),
      {
        wrapper: wrapper(setAlert, setUser),
      },
    );

    await act(async () => {
      result.current.processAttendance("timeIn");
      await vi.runAllTimersAsync();
    });

    expect(faceRecognition.performFaceEnrollment).toHaveBeenCalled();
    expect(mockPost).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ descriptor: [0.1, 0.2, 0.3] }),
    );
    expect(setUser).toHaveBeenCalled();
    expect(mockAddAttendance).toHaveBeenCalledWith(
      "timeIn",
      setAlert,
      refreshAttendances,
      1,
      2,
    );
    expect(result.current.dialogOpen).toBe(false);
  });

  it("runs the verification flow when a descriptor already exists", async () => {
    mockGet.mockResolvedValue({
      data: { data: { hasDescriptor: true, descriptor: [0.5, 0.6] } },
    });
    mockGetGeolocation.mockResolvedValue({ latitude: 9, longitude: 10 });
    const faceRecognition = makeFaceRecognition();
    const refreshAttendances = vi.fn();

    const { result } = renderHook(
      () => useAttendanceProcess(faceRecognition, refreshAttendances),
      {
        wrapper: wrapper(vi.fn(), vi.fn()),
      },
    );

    await act(async () => {
      result.current.processAttendance("timeOut");
      await vi.runAllTimersAsync();
    });

    expect(faceRecognition.performFaceEnrollment).not.toHaveBeenCalled();
    expect(faceRecognition.performFaceVerification).toHaveBeenCalledWith(
      null,
      expect.any(Float32Array),
    );
    expect(mockAddAttendance).toHaveBeenCalledWith(
      "timeOut",
      expect.any(Function),
      refreshAttendances,
      9,
      10,
    );
  });

  it("does not mark attendance when geolocation is unavailable", async () => {
    mockGet.mockResolvedValue({
      data: { data: { hasDescriptor: true, descriptor: [0.1] } },
    });
    mockGetGeolocation.mockResolvedValue(null);
    const faceRecognition = makeFaceRecognition();
    const refreshAttendances = vi.fn();

    const { result } = renderHook(
      () => useAttendanceProcess(faceRecognition, refreshAttendances),
      {
        wrapper: wrapper(vi.fn(), vi.fn()),
      },
    );

    await act(async () => {
      result.current.processAttendance("timeIn");
      await vi.runAllTimersAsync();
    });

    expect(mockAddAttendance).not.toHaveBeenCalled();
  });

  it("shows an error alert, closes the dialog, and cleans up the camera when a step throws", async () => {
    mockGet.mockResolvedValue({
      data: { data: { hasDescriptor: true, descriptor: [0.1] } },
    });
    const setAlert = vi.fn();
    const faceRecognition = makeFaceRecognition();
    faceRecognition.performLivenessDetection.mockRejectedValue(
      new Error("Liveness check failed"),
    );
    const stream = { getTracks: vi.fn().mockReturnValue([{ stop: vi.fn() }]) };
    const video = { remove: vi.fn() };
    faceRecognition.setupCamera.mockResolvedValue({ stream, video });

    const { result } = renderHook(
      () => useAttendanceProcess(faceRecognition, vi.fn()),
      {
        wrapper: wrapper(setAlert, vi.fn()),
      },
    );

    await act(async () => {
      result.current.processAttendance("timeIn");
      await vi.runAllTimersAsync();
    });

    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "error",
        message: "Liveness check failed",
      }),
    );
    expect(result.current.dialogOpen).toBe(false);
    expect(stream.getTracks).toHaveBeenCalled();
    expect(video.remove).toHaveBeenCalled();
    expect(faceRecognition.cleanupCamera).toHaveBeenCalled();
  });

  it("falls back to a generic error message when the thrown error has no message", async () => {
    mockGet.mockRejectedValue({});
    const setAlert = vi.fn();
    const faceRecognition = makeFaceRecognition();

    const { result } = renderHook(
      () => useAttendanceProcess(faceRecognition, vi.fn()),
      {
        wrapper: wrapper(setAlert, vi.fn()),
      },
    );

    await act(async () => {
      result.current.processAttendance("timeIn");
      await vi.runAllTimersAsync();
    });

    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Error verifying identity. Please try again.",
      }),
    );
  });
});
