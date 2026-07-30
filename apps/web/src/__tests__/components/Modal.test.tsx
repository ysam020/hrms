import { render, screen, fireEvent } from "@testing-library/react";
import CustomModal from "@web/shared/components/Modal";

describe("CustomModal", () => {
  it("renders children when open=true", () => {
    render(
      <CustomModal open={true} handleClose={vi.fn()}>
        <div>Modal Content</div>
      </CustomModal>,
    );
    expect(screen.getByText("Modal Content")).toBeInTheDocument();
  });

  it("does not render children when open=false", () => {
    render(
      <CustomModal open={false} handleClose={vi.fn()}>
        <div>Hidden Content</div>
      </CustomModal>,
    );
    expect(screen.queryByText("Hidden Content")).not.toBeInTheDocument();
  });

  it("renders multiple children", () => {
    render(
      <CustomModal open={true} handleClose={vi.fn()}>
        <p>Line 1</p>
        <p>Line 2</p>
      </CustomModal>,
    );
    expect(screen.getByText("Line 1")).toBeInTheDocument();
    expect(screen.getByText("Line 2")).toBeInTheDocument();
  });

  it("renders in dark theme without crashing", () => {
    render(
      <CustomModal open={true} handleClose={vi.fn()} theme="dark">
        <span>Dark modal</span>
      </CustomModal>,
    );
    expect(screen.getByText("Dark modal")).toBeInTheDocument();
  });

  it("renders a close icon by default and closes on click", () => {
    const handleClose = vi.fn();
    render(
      <CustomModal open={true} handleClose={handleClose}>
        <div>Modal Content</div>
      </CustomModal>,
    );
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("hides the close icon when hideCloseButton is set", () => {
    render(
      <CustomModal open={true} handleClose={vi.fn()} hideCloseButton>
        <div>Modal Content</div>
      </CustomModal>,
    );
    expect(
      screen.queryByRole("button", { name: /close/i }),
    ).not.toBeInTheDocument();
  });

  it("does not close when the backdrop is clicked", () => {
    const handleClose = vi.fn();
    const { baseElement } = render(
      <CustomModal open={true} handleClose={handleClose}>
        <div>Modal Content</div>
      </CustomModal>,
    );
    const backdrop = baseElement.querySelector(".MuiBackdrop-root");
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop as Element);
    expect(handleClose).not.toHaveBeenCalled();
  });

  it("closes when the Escape key is pressed", () => {
    const handleClose = vi.fn();
    render(
      <CustomModal open={true} handleClose={handleClose}>
        <div>Modal Content</div>
      </CustomModal>,
    );
    fireEvent.keyDown(screen.getByText("Modal Content"), {
      key: "Escape",
      code: "Escape",
    });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
