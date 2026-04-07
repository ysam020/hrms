import { render, screen, fireEvent } from "@testing-library/react";
import Button from "@web/shared/components/Button";

describe("Button", () => {
  it("renders children", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText("Click me")).toBeInTheDocument();
  });

  it("calls onClick when clicked", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Submit</Button>);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not call onClick when disabled", () => {
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} disabled>
        Submit
      </Button>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("does not call onClick when loading", () => {
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} loading>
        Submit
      </Button>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("renders CircularProgress spinner when loading", () => {
    render(<Button loading>Submit</Button>);
    // MUI CircularProgress renders an svg role="progressbar"
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("shows loadingText instead of children when loading and loadingText provided", () => {
    render(
      <Button loading loadingText="Saving...">
        Submit
      </Button>,
    );
    expect(screen.getByText("Saving...")).toBeInTheDocument();
  });

  it("is disabled when disabled prop is true", () => {
    render(<Button disabled>Submit</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("is disabled when loading prop is true", () => {
    render(<Button loading>Submit</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("renders icon when provided", () => {
    const icon = <span data-testid="test-icon">★</span>;
    render(<Button icon={icon}>Submit</Button>);
    expect(screen.getByTestId("test-icon")).toBeInTheDocument();
  });

  it("renders as submit type when type='submit'", () => {
    render(<Button type="submit">Submit</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "submit");
  });

  it("applies btn className", () => {
    render(<Button>Click</Button>);
    expect(screen.getByRole("button")).toHaveClass("btn");
  });

  it("appends custom className", () => {
    render(<Button className="my-class">Click</Button>);
    expect(screen.getByRole("button")).toHaveClass("my-class");
  });

  it("renders fullWidth style when fullWidth=true", () => {
    render(<Button fullWidth>Click</Button>);
    expect(screen.getByRole("button")).toHaveStyle({ width: "100%" });
  });
});
