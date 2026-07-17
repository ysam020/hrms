import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import CameraConsentDrawer from "@web/shared/components/CameraConsentDrawer";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import { BottomDrawerProvider } from "@web/app/providers/BottomDrawerContext";

function mockPermissions(state: "granted" | "denied" | "prompt") {
  Object.defineProperty(navigator, "permissions", {
    value: { query: vi.fn().mockResolvedValue({ state }) },
    configurable: true,
  });
}

function mockGetUserMedia(impl: () => Promise<any>) {
  Object.defineProperty(navigator, "mediaDevices", {
    value: { getUserMedia: vi.fn(impl) },
    configurable: true,
  });
}

function renderDrawer({
  showConsentDrawer = true,
  onAllowCamera = vi.fn(),
  onDenyCamera = vi.fn(),
  setShowConsentDrawer = vi.fn(),
} = {}) {
  render(
    <ThemeContext.Provider
      value={{ theme: "light", toggleTheme: vi.fn() } as any}
    >
      <BottomDrawerProvider>
        <CameraConsentDrawer
          showConsentDrawer={showConsentDrawer}
          setShowConsentDrawer={setShowConsentDrawer}
          onAllowCamera={onAllowCamera}
          onDenyCamera={onDenyCamera}
        />
      </BottomDrawerProvider>
    </ThemeContext.Provider>,
  );
  return { onAllowCamera, onDenyCamera, setShowConsentDrawer };
}

describe("CameraConsentDrawer", () => {
  it("acquires the camera, stops the stream, and calls onAllowCamera when allowed", async () => {
    mockPermissions("prompt");
    const stopTrack = vi.fn();
    mockGetUserMedia(async () => ({ getTracks: () => [{ stop: stopTrack }] }));
    const { onAllowCamera, setShowConsentDrawer } = renderDrawer();

    fireEvent.click(screen.getByText("Allow Camera", { selector: "span" }));

    await waitFor(() => expect(onAllowCamera).toHaveBeenCalled());
    expect(stopTrack).toHaveBeenCalled();
    expect(setShowConsentDrawer).toHaveBeenCalledWith(false);
  });

  it("shows the blocked view directly when the permission is already denied", async () => {
    mockPermissions("denied");
    mockGetUserMedia(async () => {
      throw new Error("should not be called");
    });
    renderDrawer();

    fireEvent.click(screen.getByText("Allow Camera", { selector: "span" }));

    expect(
      await screen.findByText("Camera Access Blocked"),
    ).toBeInTheDocument();
  });

  it("shows the blocked view when the browser prompt itself is denied", async () => {
    mockPermissions("prompt");
    mockGetUserMedia(async () => {
      const err: any = new Error("denied");
      err.name = "NotAllowedError";
      throw err;
    });
    renderDrawer();

    fireEvent.click(screen.getByText("Allow Camera", { selector: "span" }));

    expect(
      await screen.findByText("Camera Access Blocked"),
    ).toBeInTheDocument();
  });

  it("closes and reports a device error for a non-permission getUserMedia failure", async () => {
    mockPermissions("prompt");
    mockGetUserMedia(async () => {
      const err: any = new Error("no camera");
      err.name = "NotFoundError";
      throw err;
    });
    const { onDenyCamera, setShowConsentDrawer } = renderDrawer();

    fireEvent.click(screen.getByText("Allow Camera", { selector: "span" }));

    await waitFor(() =>
      expect(onDenyCamera).toHaveBeenCalledWith({
        cameraUnavailable: true,
        reason: "NotFoundError",
      }),
    );
    expect(setShowConsentDrawer).toHaveBeenCalledWith(false);
  });

  it("reports 'user-denied' when Cancel is clicked", () => {
    const { onDenyCamera, setShowConsentDrawer } = renderDrawer();
    fireEvent.click(screen.getByText("Cancel", { selector: "span" }));
    expect(onDenyCamera).toHaveBeenCalledWith({
      cameraUnavailable: true,
      reason: "user-denied",
    });
    expect(setShowConsentDrawer).toHaveBeenCalledWith(false);
  });

  it("reports 'drawer-closed' when the close button is clicked", () => {
    const { onDenyCamera } = renderDrawer();
    fireEvent.click(screen.getByLabelText("Close camera consent dialog"));
    expect(onDenyCamera).toHaveBeenCalledWith({
      cameraUnavailable: true,
      reason: "drawer-closed",
    });
  });

  it("reports 'permission-blocked' from the blocked view's Cancel Attendance button", async () => {
    mockPermissions("denied");
    const { onDenyCamera } = renderDrawer();
    fireEvent.click(screen.getByText("Allow Camera", { selector: "span" }));
    await screen.findByText("Camera Access Blocked");

    fireEvent.click(
      screen.getByText("Cancel Attendance", { selector: "span" }),
    );
    expect(onDenyCamera).toHaveBeenCalledWith({
      cameraUnavailable: true,
      reason: "permission-blocked",
    });
  });

  it("reloads the page from the blocked view", async () => {
    mockPermissions("denied");
    const reloadSpy = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...window.location, reload: reloadSpy },
      configurable: true,
    });
    renderDrawer();
    fireEvent.click(screen.getByText("Allow Camera", { selector: "span" }));
    await screen.findByText("Camera Access Blocked");

    fireEvent.click(screen.getByText("Reload Page", { selector: "span" }));
    expect(reloadSpy).toHaveBeenCalled();
  });
});
