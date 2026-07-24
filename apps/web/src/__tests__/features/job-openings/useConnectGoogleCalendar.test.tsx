import { renderHook, act } from "@testing-library/react";
import { AlertContext } from "@web/app/providers/AlertContext";
import apiClient from "@web/core/http/axiosConfig";
import { useConnectGoogleCalendar } from "@web/features/job-openings/useConnectGoogleCalendar";

vi.mock("@web/core/http/axiosConfig", () => ({ default: { get: vi.fn() } }));
const mockGet = apiClient.get as unknown as ReturnType<typeof vi.fn>;

function renderWithAlert(setAlert = vi.fn()) {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <AlertContext.Provider value={{ setAlert } as any}>
      {children}
    </AlertContext.Provider>
  );
  const result = renderHook(() => useConnectGoogleCalendar(), { wrapper });
  return { ...result, setAlert };
}

// The hook polls popup.closed on a real setInterval — fake timers let tests
// control exactly when that poll fires instead of racing real 500ms waits
// (and avoid leaking a live interval into later tests).
describe("useConnectGoogleCalendar", () => {
  let mockPopup: { close: ReturnType<typeof vi.fn>; closed: boolean };
  let windowOpenSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockGet.mockReset();
    mockPopup = { close: vi.fn(), closed: false };
    windowOpenSpy = vi
      .spyOn(window, "open")
      .mockImplementation(() => mockPopup as unknown as Window);
  });

  afterEach(() => {
    windowOpenSpy.mockRestore();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("starts with the prompt closed", () => {
    const { result } = renderWithAlert();
    expect(result.current.promptOpen).toBe(false);
  });

  it("requestConnect opens the prompt", () => {
    const { result } = renderWithAlert();
    act(() => result.current.requestConnect(vi.fn()));
    expect(result.current.promptOpen).toBe(true);
  });

  it("closePrompt closes the prompt and clears the pending retry", () => {
    const { result } = renderWithAlert();
    act(() => result.current.requestConnect(vi.fn()));
    act(() => result.current.closePrompt());
    expect(result.current.promptOpen).toBe(false);
  });

  it("fetches the authorize URL and opens it in a popup", async () => {
    mockGet.mockResolvedValue({
      data: {
        data: { url: "https://accounts.google.com/o/oauth2/v2/auth?x=1" },
      },
    });
    const { result } = renderWithAlert();

    await act(async () => {
      await result.current.startConnectFlow();
    });

    expect(mockGet).toHaveBeenCalledWith("/auth/google-calendar/connect");
    expect(windowOpenSpy).toHaveBeenCalledWith(
      "https://accounts.google.com/o/oauth2/v2/auth?x=1",
      "connect-google-calendar",
      "width=520,height=650",
    );
  });

  it("shows an error and does not open a popup when fetching the URL fails", async () => {
    mockGet.mockRejectedValue({
      response: { data: { message: "boom" } },
    });
    const { result, setAlert } = renderWithAlert();

    await act(async () => {
      await result.current.startConnectFlow();
    });

    expect(windowOpenSpy).not.toHaveBeenCalled();
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({ severity: "error", message: "boom" }),
    );
  });

  it("warns when the popup is blocked", async () => {
    windowOpenSpy.mockReturnValue(null);
    mockGet.mockResolvedValue({
      data: { data: { url: "https://accounts.google.com/o/oauth2/v2/auth" } },
    });
    const { result, setAlert } = renderWithAlert();

    await act(async () => {
      await result.current.startConnectFlow();
    });

    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "error",
        message: expect.stringContaining("popup"),
      }),
    );
  });

  it("closes the prompt, shows success, and retries on a same-origin google-calendar-connected message", async () => {
    mockGet.mockResolvedValue({
      data: { data: { url: "https://accounts.google.com/o/oauth2/v2/auth" } },
    });
    const retry = vi.fn();
    const { result, setAlert } = renderWithAlert();

    act(() => result.current.requestConnect(retry));
    await act(async () => {
      await result.current.startConnectFlow();
    });

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: window.location.origin,
          data: { type: "google-calendar-connected" },
        }),
      );
    });

    expect(retry).toHaveBeenCalled();
    expect(result.current.promptOpen).toBe(false);
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({ severity: "success" }),
    );
  });

  it("surfaces the error message and does not retry on a google-calendar-error message", async () => {
    mockGet.mockResolvedValue({
      data: { data: { url: "https://accounts.google.com/o/oauth2/v2/auth" } },
    });
    const retry = vi.fn();
    const { result, setAlert } = renderWithAlert();

    act(() => result.current.requestConnect(retry));
    await act(async () => {
      await result.current.startConnectFlow();
    });

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: window.location.origin,
          data: {
            type: "google-calendar-error",
            message: "Connection failed.",
          },
        }),
      );
    });

    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "error",
        message: "Connection failed.",
      }),
    );
    expect(retry).not.toHaveBeenCalled();
  });

  it("ignores messages from an untrusted origin", async () => {
    mockGet.mockResolvedValue({
      data: { data: { url: "https://accounts.google.com/o/oauth2/v2/auth" } },
    });
    const retry = vi.fn();
    const { result } = renderWithAlert();

    act(() => result.current.requestConnect(retry));
    await act(async () => {
      await result.current.startConnectFlow();
    });

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: "https://evil.example.com",
          data: { type: "google-calendar-connected" },
        }),
      );
    });

    expect(retry).not.toHaveBeenCalled();
    expect(result.current.promptOpen).toBe(true);
  });

  // The window.opener channel is unreliable against Google's own COOP
  // header (see the hook's comment) — these cover the real fallback path:
  // detecting the popup closed, then asking the backend what happened.
  describe("popup-closed polling fallback (no message ever arrives)", () => {
    it("succeeds and retries once the popup closes and the status endpoint reports connected", async () => {
      mockGet
        .mockResolvedValueOnce({
          data: {
            data: { url: "https://accounts.google.com/o/oauth2/v2/auth" },
          },
        })
        .mockResolvedValueOnce({ data: { data: { connected: true } } });
      const retry = vi.fn();
      const { result, setAlert } = renderWithAlert();

      act(() => result.current.requestConnect(retry));
      await act(async () => {
        await result.current.startConnectFlow();
      });

      mockPopup.closed = true;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });

      expect(mockGet).toHaveBeenCalledWith("/auth/google-calendar/status");
      expect(retry).toHaveBeenCalled();
      expect(result.current.promptOpen).toBe(false);
      expect(setAlert).toHaveBeenCalledWith(
        expect.objectContaining({ severity: "success" }),
      );
    });

    it("does not retry and shows no error when the popup closes without connecting (user cancelled)", async () => {
      mockGet
        .mockResolvedValueOnce({
          data: {
            data: { url: "https://accounts.google.com/o/oauth2/v2/auth" },
          },
        })
        .mockResolvedValueOnce({ data: { data: { connected: false } } });
      const retry = vi.fn();
      const { result, setAlert } = renderWithAlert();

      act(() => result.current.requestConnect(retry));
      await act(async () => {
        await result.current.startConnectFlow();
      });

      mockPopup.closed = true;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });

      expect(retry).not.toHaveBeenCalled();
      // Prompt stays open (user can click Connect again) — no error toast
      // for what's most likely just the user cancelling out of Google's screen.
      expect(result.current.promptOpen).toBe(true);
      expect(setAlert).not.toHaveBeenCalledWith(
        expect.objectContaining({ severity: "error" }),
      );
    });

    it("stops polling once the message event already resolved it (no duplicate status call)", async () => {
      mockGet.mockResolvedValue({
        data: { data: { url: "https://accounts.google.com/o/oauth2/v2/auth" } },
      });
      const retry = vi.fn();
      const { result } = renderWithAlert();

      act(() => result.current.requestConnect(retry));
      await act(async () => {
        await result.current.startConnectFlow();
      });

      act(() => {
        window.dispatchEvent(
          new MessageEvent("message", {
            origin: window.location.origin,
            data: { type: "google-calendar-connected" },
          }),
        );
      });
      expect(retry).toHaveBeenCalledTimes(1);

      mockPopup.closed = true;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });

      // Only the one initial GET for the authorize URL — no status poll,
      // and retry wasn't called a second time.
      expect(mockGet).toHaveBeenCalledTimes(1);
      expect(retry).toHaveBeenCalledTimes(1);
    });

    it("does not poll while the popup remains open", async () => {
      mockGet.mockResolvedValue({
        data: { data: { url: "https://accounts.google.com/o/oauth2/v2/auth" } },
      });
      const { result } = renderWithAlert();

      act(() => result.current.requestConnect(vi.fn()));
      await act(async () => {
        await result.current.startConnectFlow();
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });

      expect(mockGet).toHaveBeenCalledTimes(1);
    });
  });
});
