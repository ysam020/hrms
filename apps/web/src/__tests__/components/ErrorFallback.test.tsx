import { render, screen, fireEvent } from "@testing-library/react";
import ErrorFallback from "@web/shared/components/ErrorFallback";

describe("ErrorFallback", () => {
  it("renders 'Something went wrong' heading", () => {
    render(<ErrorFallback />);
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("renders error message when error.message is provided", () => {
    render(<ErrorFallback error={{ message: "Network timeout" }} />);
    expect(screen.getByText("Network timeout")).toBeInTheDocument();
  });

  it("does not render error message when error has no message", () => {
    render(<ErrorFallback error={{}} />);
    expect(screen.queryByText("Network timeout")).not.toBeInTheDocument();
  });

  it("renders 'Try again' button when resetErrorBoundary is provided", () => {
    const reset = vi.fn();
    render(<ErrorFallback resetErrorBoundary={reset} />);
    expect(screen.getByText("Try again")).toBeInTheDocument();
  });

  it("calls resetErrorBoundary when 'Try again' is clicked", () => {
    const reset = vi.fn();
    render(<ErrorFallback resetErrorBoundary={reset} />);
    fireEvent.click(screen.getByText("Try again"));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("renders 'Reload page' button when resetErrorBoundary is not provided", () => {
    render(<ErrorFallback />);
    expect(screen.getByText("Reload page")).toBeInTheDocument();
  });

  it("does not render 'Try again' when resetErrorBoundary is absent", () => {
    render(<ErrorFallback />);
    expect(screen.queryByText("Try again")).not.toBeInTheDocument();
  });

  it("renders with role=alert on the root box", () => {
    render(<ErrorFallback />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});
