import { addAttendance } from "@web/shared/utils/addAttendance";
import apiClient from "@web/core/http/axiosConfig";

vi.mock("@web/core/http/axiosConfig", () => ({
  default: { post: vi.fn() },
}));

const mockPost = apiClient.post as unknown as ReturnType<typeof vi.fn>;

describe("addAttendance", () => {
  beforeEach(() => vi.clearAllMocks());

  it("maps 'timeIn' to a CHECK_IN request and shows the punch-in success message", async () => {
    mockPost.mockResolvedValue({ data: {} });
    const setAlert = vi.fn();
    const getAttendances = vi.fn();

    await addAttendance("timeIn", setAlert, getAttendances, 12.34, 56.78);

    expect(mockPost).toHaveBeenCalledWith(expect.any(String), {
      type: "CHECK_IN",
      latitude: 12.34,
      longitude: 56.78,
    });
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Punched in successfully",
      }),
    );
    expect(getAttendances).toHaveBeenCalled();
  });

  it("maps 'timeOut' to a CHECK_OUT request and shows the punch-out success message", async () => {
    mockPost.mockResolvedValue({ data: {} });
    await addAttendance("timeOut", vi.fn(), vi.fn(), null, null);
    expect(mockPost).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ type: "CHECK_OUT" }),
    );
  });

  it("passes an unmapped field through as-is with a generic success message", async () => {
    mockPost.mockResolvedValue({ data: {} });
    const setAlert = vi.fn();
    await addAttendance("breakStart", setAlert, vi.fn(), null, null);
    expect(mockPost).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ type: "breakStart" }),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Attendance recorded successfully" }),
    );
  });

  it("shows the server error message and does not call getAttendances on failure", async () => {
    mockPost.mockRejectedValue({
      response: { data: { error: "Outside geofence" } },
    });
    const setAlert = vi.fn();
    const getAttendances = vi.fn();

    await addAttendance("timeIn", setAlert, getAttendances, 0, 0);

    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "error",
        message: "Outside geofence",
      }),
    );
    expect(getAttendances).not.toHaveBeenCalled();
  });
});
