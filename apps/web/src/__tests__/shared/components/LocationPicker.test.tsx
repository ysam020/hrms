import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import LocationPicker from "@web/shared/components/LocationPicker";
import { ThemeContext } from "@web/app/providers/ThemeContext";

vi.mock("leaflet/dist/leaflet.css", () => ({}));
vi.mock("leaflet", () => {
  const fakeMap = {
    on: vi.fn(),
    remove: vi.fn(),
    setView: vi.fn(),
    getZoom: vi.fn(() => 15),
  };
  const fakeTileLayer = { addTo: vi.fn(), remove: vi.fn() };
  const fakeMarker = {
    addTo: vi.fn(function (this: any) {
      return this;
    }),
    on: vi.fn(),
    setLatLng: vi.fn(),
    getLatLng: vi.fn(() => ({ lat: 12.9, lng: 77.5 })),
  };
  const L = {
    map: vi.fn(() => fakeMap),
    tileLayer: vi.fn(() => fakeTileLayer),
    marker: vi.fn(() => fakeMarker),
    Icon: { Default: { prototype: {}, mergeOptions: vi.fn() } },
  };
  return { default: L };
});

function renderPicker(props: Partial<any> = {}, theme = "light") {
  const onChange = vi.fn();
  render(
    <ThemeContext.Provider value={{ theme, toggleTheme: vi.fn() } as any}>
      <LocationPicker
        lat={null}
        lng={null}
        name={null}
        onChange={onChange}
        {...props}
      />
    </ThemeContext.Provider>,
  );
  return { onChange };
}

describe("LocationPicker", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => vi.unstubAllGlobals());

  it("shows a placeholder hint when no location is set yet", () => {
    renderPicker();
    expect(
      screen.getByText("Click on the map or search to set the location."),
    ).toBeInTheDocument();
  });

  it("shows the coordinate fallback label when a location is set with no name", () => {
    renderPicker({ lat: 12.971598, lng: 77.594566, name: null });
    expect(screen.getByText(/12\.971598, 77\.594566/)).toBeInTheDocument();
  });

  it("shows the location name when present", () => {
    renderPicker({ lat: 12.9, lng: 77.5, name: "Bengaluru, Karnataka" });
    expect(screen.getByText(/Bengaluru, Karnataka/)).toBeInTheDocument();
  });

  it("truncates a very long location name to 80 characters", () => {
    const longName = "A".repeat(120);
    renderPicker({ lat: 12.9, lng: 77.5, name: longName });
    expect(screen.getByText(`📍 ${"A".repeat(80)}…`)).toBeInTheDocument();
  });

  it("hides the search/location toolbar and the placeholder hint when disabled", () => {
    renderPicker({ disabled: true });
    expect(
      screen.queryByPlaceholderText("Search for a location…"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Click on the map or search to set the location."),
    ).not.toBeInTheDocument();
  });

  it("disables Search until a query is entered", () => {
    renderPicker();
    expect(
      screen.getByText("Search", { selector: "span" }).closest("button"),
    ).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText("Search for a location…"), {
      target: { value: "Bengaluru" },
    });
    expect(
      screen.getByText("Search", { selector: "span" }).closest("button"),
    ).not.toBeDisabled();
  });

  it("searches via Nominatim and calls onChange with the first result, clearing the query", async () => {
    (global.fetch as any).mockResolvedValue({
      json: async () => [
        { lat: "12.9", lon: "77.5", display_name: "Bengaluru, Karnataka" },
      ],
    });
    const { onChange } = renderPicker();

    fireEvent.change(screen.getByPlaceholderText("Search for a location…"), {
      target: { value: "Bengaluru" },
    });
    fireEvent.click(screen.getByText("Search", { selector: "span" }));

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({
        lat: 12.9,
        lng: 77.5,
        name: "Bengaluru, Karnataka",
      }),
    );
    await waitFor(() =>
      expect(screen.getByPlaceholderText("Search for a location…")).toHaveValue(
        "",
      ),
    );
  });

  it("searches when Enter is pressed in the search field", async () => {
    (global.fetch as any).mockResolvedValue({
      json: async () => [
        { lat: "12.9", lon: "77.5", display_name: "Bengaluru" },
      ],
    });
    const { onChange } = renderPicker();

    const input = screen.getByPlaceholderText("Search for a location…");
    fireEvent.change(input, { target: { value: "Bengaluru" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(onChange).toHaveBeenCalled());
  });

  it("does not call onChange when the search finds no results", async () => {
    (global.fetch as any).mockResolvedValue({ json: async () => [] });
    const { onChange } = renderPicker();

    fireEvent.change(screen.getByPlaceholderText("Search for a location…"), {
      target: { value: "Nowhereville" },
    });
    fireEvent.click(screen.getByText("Search", { selector: "span" }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(onChange).not.toHaveBeenCalled();
  });

  it("uses the browser's current location and reverse-geocodes it", async () => {
    (global.fetch as any).mockResolvedValue({
      json: async () => ({ display_name: "Current Spot, City" }),
    });
    const getCurrentPosition = vi.fn((success) =>
      success({ coords: { latitude: 12.9, longitude: 77.5 } }),
    );
    vi.stubGlobal("navigator", {
      ...navigator,
      geolocation: { getCurrentPosition },
    });

    const { onChange } = renderPicker();
    fireEvent.click(screen.getByText("My location", { selector: "span" }));

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({
        lat: 12.9,
        lng: 77.5,
        name: "Current Spot, City",
      }),
    );
  });

  it("falls back to raw coordinates when reverse geocoding fails", async () => {
    (global.fetch as any).mockRejectedValue(new Error("network error"));
    const getCurrentPosition = vi.fn((success) =>
      success({ coords: { latitude: 12.9, longitude: 77.5 } }),
    );
    vi.stubGlobal("navigator", {
      ...navigator,
      geolocation: { getCurrentPosition },
    });

    const { onChange } = renderPicker();
    fireEvent.click(screen.getByText("My location", { selector: "span" }));

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          lat: 12.9,
          lng: 77.5,
          name: "12.90000, 77.50000",
        }),
      ),
    );
  });
});
