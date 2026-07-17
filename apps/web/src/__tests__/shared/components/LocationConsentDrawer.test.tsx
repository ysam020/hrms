import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import LocationConsentDrawer from "@web/shared/components/LocationConsentDrawer";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import { BottomDrawerProvider } from "@web/app/providers/BottomDrawerContext";

function mockPermissions(state: "granted" | "denied" | "prompt") {
  Object.defineProperty(navigator, "permissions", {
    value: { query: vi.fn().mockResolvedValue({ state }) },
    configurable: true,
  });
}

function mockGeolocation(
  behavior: (success: (pos: any) => void, error: (err: any) => void) => void,
) {
  Object.defineProperty(navigator, "geolocation", {
    value: { getCurrentPosition: vi.fn(behavior) },
    configurable: true,
  });
}

function renderDrawer({
  showConsentDrawer = true,
  onAllowLocation = vi.fn(),
  onDenyLocation = vi.fn(),
  setShowConsentDrawer = vi.fn(),
} = {}) {
  render(
    <ThemeContext.Provider
      value={{ theme: "light", toggleTheme: vi.fn() } as any}
    >
      <BottomDrawerProvider>
        <LocationConsentDrawer
          showConsentDrawer={showConsentDrawer}
          setShowConsentDrawer={setShowConsentDrawer}
          onAllowLocation={onAllowLocation}
          onDenyLocation={onDenyLocation}
        />
      </BottomDrawerProvider>
    </ThemeContext.Provider>,
  );
  return { onAllowLocation, onDenyLocation, setShowConsentDrawer };
}

describe("LocationConsentDrawer", () => {
  it("gets the current position and calls onAllowLocation when allowed", async () => {
    mockPermissions("prompt");
    mockGeolocation((success) =>
      success({ coords: { latitude: 12.9, longitude: 77.5 } }),
    );
    const { onAllowLocation, setShowConsentDrawer } = renderDrawer();

    fireEvent.click(screen.getByText("Allow Location", { selector: "span" }));

    await waitFor(() =>
      expect(onAllowLocation).toHaveBeenCalledWith({
        latitude: 12.9,
        longitude: 77.5,
      }),
    );
    expect(setShowConsentDrawer).toHaveBeenCalledWith(false);
  });

  it("shows the blocked view directly when the permission is already denied", async () => {
    mockPermissions("denied");
    mockGeolocation(() => {
      throw new Error("should not be called");
    });
    renderDrawer();

    fireEvent.click(screen.getByText("Allow Location", { selector: "span" }));

    expect(
      await screen.findByText("Location Access Blocked"),
    ).toBeInTheDocument();
  });

  it("shows the blocked view when the browser prompt itself is denied", async () => {
    mockPermissions("prompt");
    mockGeolocation((_success, error) =>
      error({ code: 1, PERMISSION_DENIED: 1 }),
    );
    renderDrawer();

    fireEvent.click(screen.getByText("Allow Location", { selector: "span" }));

    expect(
      await screen.findByText("Location Access Blocked"),
    ).toBeInTheDocument();
  });

  it("closes and reports a device error for a non-permission geolocation failure", async () => {
    mockPermissions("prompt");
    mockGeolocation((_success, error) =>
      error({ code: 2, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2 }),
    );
    const { onDenyLocation, setShowConsentDrawer } = renderDrawer();

    fireEvent.click(screen.getByText("Allow Location", { selector: "span" }));

    await waitFor(() =>
      expect(onDenyLocation).toHaveBeenCalledWith({
        locationUnavailable: true,
        reason: "error-2",
      }),
    );
    expect(setShowConsentDrawer).toHaveBeenCalledWith(false);
  });

  it("reports 'unknown-error' when the permissions query itself throws", async () => {
    Object.defineProperty(navigator, "permissions", {
      value: { query: vi.fn().mockRejectedValue(new Error("not supported")) },
      configurable: true,
    });
    const { onDenyLocation, setShowConsentDrawer } = renderDrawer();

    fireEvent.click(screen.getByText("Allow Location", { selector: "span" }));

    await waitFor(() =>
      expect(onDenyLocation).toHaveBeenCalledWith({
        locationUnavailable: true,
        reason: "unknown-error",
      }),
    );
    expect(setShowConsentDrawer).toHaveBeenCalledWith(false);
  });

  it("reports 'user-denied' when Skip is clicked", () => {
    const { onDenyLocation, setShowConsentDrawer } = renderDrawer();
    fireEvent.click(screen.getByText("Skip", { selector: "span" }));
    expect(onDenyLocation).toHaveBeenCalledWith({
      locationUnavailable: true,
      reason: "user-denied",
    });
    expect(setShowConsentDrawer).toHaveBeenCalledWith(false);
  });

  it("reports 'drawer-closed' when the close button is clicked", () => {
    const { onDenyLocation } = renderDrawer();
    fireEvent.click(screen.getByLabelText("Close location consent dialog"));
    expect(onDenyLocation).toHaveBeenCalledWith({
      locationUnavailable: true,
      reason: "drawer-closed",
    });
  });

  it("reports 'permission-blocked' from the blocked view's proceed button", async () => {
    mockPermissions("denied");
    const { onDenyLocation } = renderDrawer();
    fireEvent.click(screen.getByText("Allow Location", { selector: "span" }));
    await screen.findByText("Location Access Blocked");

    fireEvent.click(
      screen.getByText("Proceed Without Location", { selector: "span" }),
    );
    expect(onDenyLocation).toHaveBeenCalledWith({
      locationUnavailable: true,
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
    fireEvent.click(screen.getByText("Allow Location", { selector: "span" }));
    await screen.findByText("Location Access Blocked");

    fireEvent.click(screen.getByText("Reload Page", { selector: "span" }));
    expect(reloadSpy).toHaveBeenCalled();
  });
});
