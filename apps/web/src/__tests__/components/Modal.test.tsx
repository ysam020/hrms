import { render, screen } from "@testing-library/react";
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
});
