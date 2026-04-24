import { render, screen } from "@testing-library/react";
import LoadingState from "@web/shared/components/LoadingState";

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
    render(<LoadingState />);
    expect(screen.queryByText(/./)).toBeNull();
  });

  it("renders in dark theme without crashing", () => {
    render(<LoadingState theme="dark" message="Loading..." />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("renders in light theme without crashing", () => {
    render(<LoadingState theme="light" />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("renders small spinner for size='small'", () => {
    render(<LoadingState size="small" />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("renders large spinner for size='large'", () => {
    render(<LoadingState size="large" />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("renders medium spinner by default", () => {
    render(<LoadingState />);
    const spinner = screen.getByRole("progressbar");
    expect(spinner).toBeInTheDocument();
  });

  it("accepts custom height without crashing", () => {
    const { container } = render(<LoadingState height={200} />);
    expect(container.firstChild).toBeInTheDocument();
  });
});
