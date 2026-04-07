import { render, screen } from "@testing-library/react";
import EmptyState from "@web/shared/components/EmptyState";

describe("EmptyState", () => {
  it("renders default message when none provided", () => {
    render(<EmptyState />);
    expect(screen.getByText("No data available")).toBeInTheDocument();
  });

  it("renders custom message", () => {
    render(<EmptyState message="Nothing to show here" />);
    expect(screen.getByText("Nothing to show here")).toBeInTheDocument();
  });

  it("renders icon when provided", () => {
    const icon = <span data-testid="empty-icon">📭</span>;
    render(<EmptyState icon={icon} />);
    expect(screen.getByTestId("empty-icon")).toBeInTheDocument();
  });

  it("does not render icon wrapper when no icon provided", () => {
    const { container } = render(<EmptyState />);
    // Only the Typography for message — no icon box
    expect(container.querySelectorAll("p")).toHaveLength(1);
  });

  it("renders without crashing in dark theme", () => {
    render(<EmptyState theme="dark" message="Dark mode empty" />);
    expect(screen.getByText("Dark mode empty")).toBeInTheDocument();
  });

  it("renders with dashed border prop", () => {
    render(<EmptyState dashed />);
    expect(screen.getByText("No data available")).toBeInTheDocument();
  });
});
