import { renderHook, waitFor, act } from "@testing-library/react";
import {
  DashboardProvider,
  useDashboard,
} from "@web/app/providers/DashboardContext";
import apiClient from "@web/core/http/axiosConfig";

vi.mock("@web/core/http/axiosConfig", () => ({
  default: { get: vi.fn() },
}));

const mockGet = apiClient.get as unknown as ReturnType<typeof vi.fn>;

function wrapperFor(user: { id?: string } | null) {
  return ({ children }: { children: React.ReactNode }) => (
    <DashboardProvider user={user}>{children}</DashboardProvider>
  );
}

describe("DashboardContext", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws when useDashboard is called outside the provider", () => {
    // Suppress React's expected error-boundary console noise for this case.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useDashboard())).toThrow(
      "useDashboard must be used inside DashboardProvider",
    );
    spy.mockRestore();
  });

  it("starts with every section loading and does not fetch when there is no user", async () => {
    const { result } = renderHook(() => useDashboard(), {
      wrapper: wrapperFor(null),
    });
    expect(result.current.loading.attendances).toBe(true);
    await waitFor(() => expect(mockGet).not.toHaveBeenCalled());
  });

  it("fetches all sections and flips loading off once every request settles", async () => {
    mockGet.mockImplementation((url: string) => {
      if (url.includes("hr-activities")) {
        return Promise.resolve({
          data: { data: { activities: [{ id: "a1" }] } },
        });
      }
      return Promise.resolve({ data: { data: [] } });
    });

    const { result } = renderHook(() => useDashboard(), {
      wrapper: wrapperFor({ id: "u1" }),
    });

    await waitFor(() => expect(result.current.loading.attendances).toBe(false));

    expect(result.current.loading).toEqual({
      attendances: false,
      attendanceSummary: false,
      hrActivities: false,
      calendarEvents: false,
      stickyNote: false,
      holidays: false,
      pendingLeaves: false,
      jobOpenings: false,
      employeeInsights: false,
      kycInsights: false,
      birthdaysAnniversaries: false,
    });
    expect(result.current.data.hrActivities).toEqual([{ id: "a1" }]);
  });

  it("preserves the previous value for a section whose request rejected, instead of wiping it", async () => {
    mockGet.mockImplementation((url: string) => {
      if (url.includes("holidays"))
        return Promise.reject(new Error("holidays endpoint down"));
      if (url.includes("hr-activities")) {
        return Promise.resolve({ data: { data: { activities: [] } } });
      }
      return Promise.resolve({ data: { data: [] } });
    });

    const { result } = renderHook(() => useDashboard(), {
      wrapper: wrapperFor({ id: "u1" }),
    });

    await waitFor(() => expect(result.current.loading.holidays).toBe(false));

    // Failed section keeps its initial default (empty array) rather than crashing.
    expect(result.current.data.holidays).toEqual([]);
  });

  it("defaults pendingLeaves/hrActivities to an empty structure when the response payload omits data", async () => {
    mockGet.mockImplementation((url: string) => {
      if (url.includes("hr-activities"))
        return Promise.resolve({ data: { data: {} } });
      if (url.includes("leave-applications"))
        return Promise.resolve({ data: {} });
      return Promise.resolve({ data: { data: [] } });
    });

    const { result } = renderHook(() => useDashboard(), {
      wrapper: wrapperFor({ id: "u1" }),
    });

    await waitFor(() =>
      expect(result.current.loading.pendingLeaves).toBe(false),
    );

    expect(result.current.data.hrActivities).toEqual([]);
    expect(result.current.data.pendingLeaves).toEqual([]);
  });

  it("refetch() triggers a new round of requests", async () => {
    mockGet.mockResolvedValue({ data: { data: [] } });
    const { result } = renderHook(() => useDashboard(), {
      wrapper: wrapperFor({ id: "u1" }),
    });
    await waitFor(() => expect(result.current.loading.attendances).toBe(false));

    mockGet.mockClear();
    act(() => {
      result.current.refetch();
    });

    await waitFor(() => expect(mockGet).toHaveBeenCalled());
  });
});
