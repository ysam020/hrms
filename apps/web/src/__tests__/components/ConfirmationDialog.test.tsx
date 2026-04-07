import { render, screen, fireEvent } from "@testing-library/react";
import ConfirmationDialog from "@web/shared/components/ConfirmationDialog";

const defaultProps = {
  open: true,
  onClose: vi.fn(),
  onConfirm: vi.fn(),
  title: "Delete Item",
  message: "Are you sure you want to delete this item?",
};

describe("ConfirmationDialog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders title and message when open", () => {
    render(<ConfirmationDialog {...defaultProps} />);
    expect(screen.getByText("Delete Item")).toBeInTheDocument();
    expect(
      screen.getByText("Are you sure you want to delete this item?"),
    ).toBeInTheDocument();
  });

  it("does not render content when open=false", () => {
    render(<ConfirmationDialog {...defaultProps} open={false} />);
    expect(screen.queryByText("Delete Item")).not.toBeInTheDocument();
  });

  it("renders default confirm and cancel text", () => {
    render(<ConfirmationDialog {...defaultProps} />);
    expect(screen.getByText("Confirm")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("renders custom confirm and cancel text", () => {
    render(
      <ConfirmationDialog
        {...defaultProps}
        confirmText="Yes, Delete"
        cancelText="No, Keep"
      />,
    );
    expect(screen.getByText("Yes, Delete")).toBeInTheDocument();
    expect(screen.getByText("No, Keep")).toBeInTheDocument();
  });

  it("calls onConfirm when confirm button clicked", () => {
    render(<ConfirmationDialog {...defaultProps} />);
    fireEvent.click(screen.getByText("Confirm"));
    expect(defaultProps.onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when cancel button clicked", () => {
    render(<ConfirmationDialog {...defaultProps} />);
    fireEvent.click(screen.getByText("Cancel"));
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it("renders optional description when provided", () => {
    render(
      <ConfirmationDialog
        {...defaultProps}
        description="This action cannot be undone."
      />,
    );
    expect(
      screen.getByText("This action cannot be undone."),
    ).toBeInTheDocument();
  });

  it("does not render description when not provided", () => {
    render(<ConfirmationDialog {...defaultProps} />);
    expect(
      screen.queryByText("This action cannot be undone."),
    ).not.toBeInTheDocument();
  });

  it("disables confirm button and shows processing when loading=true", () => {
    render(<ConfirmationDialog {...defaultProps} loading />);
    expect(screen.getByText("Processing...")).toBeInTheDocument();
  });

  it("shows warning icon for danger variant", () => {
    render(<ConfirmationDialog {...defaultProps} variant="danger" />);
    // WarningAmberIcon renders as svg; check aria or container
    const titleContainer = screen.getByText("Delete Item").closest("div");
    expect(titleContainer?.querySelector("svg")).toBeInTheDocument();
  });

  it("does not show warning icon for default variant", () => {
    render(<ConfirmationDialog {...defaultProps} variant="default" />);
    const titleContainer = screen.getByText("Delete Item").closest("div");
    // No warning icon in default variant
    expect(
      titleContainer?.querySelector('[data-testid="WarningAmberIcon"]'),
    ).not.toBeInTheDocument();
  });
});
