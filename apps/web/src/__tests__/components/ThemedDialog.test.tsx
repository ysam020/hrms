import { render, screen, fireEvent } from "@testing-library/react";
import ThemedDialog from "@web/shared/components/ThemedDialog";

describe("ThemedDialog", () => {
  it("renders title and children when open=true", () => {
    render(
      <ThemedDialog open={true} onClose={vi.fn()} title="Test Dialog">
        <p>Dialog content</p>
      </ThemedDialog>,
    );
    expect(screen.getByText("Test Dialog")).toBeInTheDocument();
    expect(screen.getByText("Dialog content")).toBeInTheDocument();
  });

  it("does not render when open=false", () => {
    render(
      <ThemedDialog open={false} onClose={vi.fn()} title="Hidden Dialog">
        <p>Hidden content</p>
      </ThemedDialog>,
    );
    expect(screen.queryByText("Hidden Dialog")).not.toBeInTheDocument();
    expect(screen.queryByText("Hidden content")).not.toBeInTheDocument();
  });

  it("renders actions when provided", () => {
    render(
      <ThemedDialog
        open={true}
        onClose={vi.fn()}
        title="Dialog"
        actions={<button>Save</button>}
      >
        <p>Content</p>
      </ThemedDialog>,
    );
    expect(screen.getByText("Save")).toBeInTheDocument();
  });

  it("does not render actions section when actions is undefined", () => {
    render(
      <ThemedDialog open={true} onClose={vi.fn()} title="Dialog">
        <p>Content</p>
      </ThemedDialog>,
    );
    // Actions section absent — only one role=button if any exists
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows close icon button when showCloseButton=true", () => {
    render(
      <ThemedDialog
        open={true}
        onClose={vi.fn()}
        title="Dialog"
        showCloseButton
      >
        <p>Content</p>
      </ThemedDialog>,
    );
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("calls onClose when close icon button is clicked", () => {
    const onClose = vi.fn();
    render(
      <ThemedDialog
        open={true}
        onClose={onClose}
        title="Dialog"
        showCloseButton
      >
        <p>Content</p>
      </ThemedDialog>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not crash when title is null", () => {
    render(
      <ThemedDialog open={true} onClose={vi.fn()} title={null}>
        <p>No title dialog</p>
      </ThemedDialog>,
    );
    expect(screen.getByText("No title dialog")).toBeInTheDocument();
  });

  it("renders in dark theme", () => {
    render(
      <ThemedDialog
        open={true}
        onClose={vi.fn()}
        title="Dark Dialog"
        theme="dark"
      >
        <p>Dark content</p>
      </ThemedDialog>,
    );
    expect(screen.getByText("Dark Dialog")).toBeInTheDocument();
    expect(screen.getByText("Dark content")).toBeInTheDocument();
  });

  it("renders in light theme (default)", () => {
    render(
      <ThemedDialog open={true} onClose={vi.fn()} title="Light Dialog">
        <p>Light content</p>
      </ThemedDialog>,
    );
    expect(screen.getByText("Light Dialog")).toBeInTheDocument();
  });

  it("renders multiple children", () => {
    render(
      <ThemedDialog open={true} onClose={vi.fn()} title="Multi">
        <p>First</p>
        <p>Second</p>
      </ThemedDialog>,
    );
    expect(screen.getByText("First")).toBeInTheDocument();
    expect(screen.getByText("Second")).toBeInTheDocument();
  });
});
