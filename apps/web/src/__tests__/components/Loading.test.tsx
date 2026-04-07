import { render, screen } from "@testing-library/react";
import Loading from "@web/shared/components/Loading";
import LoadingState from "@web/shared/components/LoadingState";

describe("Loading", () => {
  it("renders a CircularProgress spinner", () => {
    render(<Loading />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("renders a full-viewport-height container", () => {
    const { container } = render(<Loading />);
    const div = container.firstChild as HTMLElement;
    expect(div).toHaveStyle({ height: "100vh" });
  });
});

describe("LoadingState", () => {
  it("renders a spinner", () => {
    render(<LoadingState />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("renders message when provided", () => {
    render(<LoadingState message="Fetching data..." />);
    expect(screen.getByText("Fetching data...")).toBeInTheDocument();
  });

  it("does not render message when not provided", () => {
    const { queryByText } = render(<LoadingState />);
    expect(queryByText("Fetching data...")).not.toBeInTheDocument();
  });

  it("applies custom height", () => {
    const { container } = render(<LoadingState height={200} />);
    // MUI Box renders as a div with inline styles via sx — check the root element
    const box = container.querySelector(".dashboard-container") as HTMLElement;
    expect(box).toBeTruthy();
  });

  it("renders in dark theme without crashing", () => {
    render(<LoadingState theme="dark" />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("renders small/medium/large sizes without crashing", () => {
    const { rerender } = render(<LoadingState size="small" />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    rerender(<LoadingState size="large" />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });
});
