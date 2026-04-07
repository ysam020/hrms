import { render, screen, fireEvent } from "@testing-library/react";
import DeviceListItem from "@web/shared/components/DeviceListItem";

const desktopDevice = {
  deviceInfo: { deviceType: "desktop", browser: "Chrome", os: "Windows" },
  lastUsed: new Date("2024-03-01T10:00:00Z").getTime(),
  location: "Mumbai, India",
};

const mobileDevice = {
  deviceInfo: { deviceType: "mobile", browser: "Safari", os: "iOS" },
  lastUsed: new Date("2024-03-02T08:00:00Z").getTime(),
};

const tabletDevice = {
  deviceInfo: { deviceType: "tablet", browser: "Chrome", os: "Android" },
  createdAt: new Date("2024-03-03T12:00:00Z").getTime(),
};

describe("DeviceListItem", () => {
  it("renders device type and browser", () => {
    render(<DeviceListItem device={desktopDevice} />);
    expect(screen.getByText(/desktop/i)).toBeInTheDocument();
    expect(screen.getByText(/Chrome/)).toBeInTheDocument();
  });

  it("renders 'Current' chip when isCurrentDevice=true", () => {
    render(<DeviceListItem device={desktopDevice} isCurrentDevice />);
    expect(screen.getByText("Current")).toBeInTheDocument();
  });

  it("does not render 'Current' chip when isCurrentDevice=false", () => {
    render(<DeviceListItem device={desktopDevice} isCurrentDevice={false} />);
    expect(screen.queryByText("Current")).not.toBeInTheDocument();
  });

  it("renders location when provided", () => {
    render(<DeviceListItem device={desktopDevice} />);
    expect(screen.getByText(/Mumbai, India/)).toBeInTheDocument();
  });

  it("does not render location when not provided", () => {
    render(<DeviceListItem device={mobileDevice} />);
    expect(screen.queryByText(/Location:/)).not.toBeInTheDocument();
  });

  it("renders lastUsed timestamp", () => {
    render(<DeviceListItem device={desktopDevice} />);
    expect(screen.getByText(/Last used:/)).toBeInTheDocument();
  });

  it("falls back to createdAt when lastUsed is absent", () => {
    render(<DeviceListItem device={tabletDevice} />);
    expect(screen.getByText(/Last used:/)).toBeInTheDocument();
  });

  it("renders 'Unknown' when both lastUsed and createdAt absent", () => {
    render(
      <DeviceListItem device={{ deviceInfo: desktopDevice.deviceInfo }} />,
    );
    expect(screen.getByText(/Last used: Unknown/)).toBeInTheDocument();
  });

  it("calls onClick when the box is clicked", () => {
    const onClick = vi.fn();
    render(<DeviceListItem device={desktopDevice} onClick={onClick} />);
    fireEvent.click(
      screen.getByText(/desktop/i).closest("div")!.parentElement!
        .parentElement!,
    );
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders actions slot when provided", () => {
    render(
      <DeviceListItem
        device={desktopDevice}
        actions={<button>Remove</button>}
      />,
    );
    expect(screen.getByText("Remove")).toBeInTheDocument();
  });

  it("renders 'Unknown Device' when device has no deviceInfo", () => {
    render(<DeviceListItem device={{}} />);
    expect(screen.getByText("Unknown Device")).toBeInTheDocument();
  });

  it("renders mobile device without crashing", () => {
    render(<DeviceListItem device={mobileDevice} />);
    expect(screen.getByText(/mobile/i)).toBeInTheDocument();
  });

  it("renders in dark theme without crashing", () => {
    render(<DeviceListItem device={desktopDevice} theme="dark" />);
    expect(screen.getByText(/desktop/i)).toBeInTheDocument();
  });
});
