import { render, screen, fireEvent } from "@testing-library/react";
import { GeofencingSection } from "@web/features/settings/org-settings/GeofencingSection";
import { SCHEMA_DEFAULTS } from "@web/features/settings/org-settings/types";

vi.mock("@web/shared/components/LocationPicker", () => ({
  default: (props: any) => (
    <div>
      Stub LocationPicker lat={String(props.lat)}
      <button
        onClick={() => props.onChange({ lat: 12.9, lng: 77.5, name: "HQ" })}
      >
        set-location
      </button>
    </div>
  ),
}));

function renderSection(
  overrides: Partial<any> = {},
  onChange = vi.fn(),
  readOnly = false,
) {
  render(
    <GeofencingSection
      settings={{ ...SCHEMA_DEFAULTS, ...overrides }}
      onChange={onChange}
      readOnly={readOnly}
    />,
  );
  return { onChange };
}

describe("GeofencingSection", () => {
  it("shows Enabled/Disabled labels reflecting current toggle state", () => {
    renderSection({ wfhEnabled: true, geofencingEnabled: false });
    expect(screen.getAllByText("Enabled").length).toBe(1);
    expect(screen.getAllByText("Disabled").length).toBe(1);
  });

  it("hides the radius/location picker section until geofencing is enabled", () => {
    renderSection({ geofencingEnabled: false });
    expect(screen.queryByLabelText("Allowed radius")).not.toBeInTheDocument();
  });

  it("shows the radius/location picker section once geofencing is enabled", async () => {
    renderSection({ geofencingEnabled: true });
    expect(screen.getByLabelText("Allowed radius")).toBeInTheDocument();
    expect(await screen.findByText(/Stub LocationPicker/)).toBeInTheDocument();
  });

  it("warns when geofencing is enabled but no office location is set", () => {
    renderSection({
      geofencingEnabled: true,
      officeLatitude: null,
      officeLongitude: null,
    });
    expect(
      screen.getByText(/Set the office location above/),
    ).toBeInTheDocument();
  });

  it("omits the missing-location warning once coordinates are set", () => {
    renderSection({
      geofencingEnabled: true,
      officeLatitude: 12.9,
      officeLongitude: 77.5,
    });
    expect(
      screen.queryByText(/Set the office location above/),
    ).not.toBeInTheDocument();
  });

  it("omits the missing-location warning for a read-only viewer even without coordinates", () => {
    renderSection(
      { geofencingEnabled: true, officeLatitude: null, officeLongitude: null },
      vi.fn(),
      true,
    );
    expect(
      screen.queryByText(/Set the office location above/),
    ).not.toBeInTheDocument();
  });

  it("clamps the geofence radius to a minimum of 50m", () => {
    const { onChange } = renderSection({ geofencingEnabled: true });
    fireEvent.change(screen.getByLabelText("Allowed radius"), {
      target: { value: "10" },
    });
    expect(onChange).toHaveBeenCalledWith({ geofenceRadiusMeters: 50 });
  });

  it("toggles the WFH switch", () => {
    const { onChange } = renderSection({
      wfhEnabled: false,
      geofencingEnabled: true,
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Disabled" }));
    expect(onChange).toHaveBeenCalledWith({ wfhEnabled: true });
  });

  it("forwards a chosen office location from the picker", async () => {
    const { onChange } = renderSection({ geofencingEnabled: true });
    fireEvent.click(await screen.findByText("set-location"));
    expect(onChange).toHaveBeenCalledWith({
      officeLatitude: 12.9,
      officeLongitude: 77.5,
      officeName: "HQ",
    });
  });
});
