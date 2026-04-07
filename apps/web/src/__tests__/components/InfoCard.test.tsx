import { render, screen, fireEvent } from "@testing-library/react";
import InfoCard from "@web/shared/components/InfoCard";
import EmailIcon from "@mui/icons-material/Email";

const defaultProps = {
  label: "Email",
  value: "john@example.com",
  icon: <EmailIcon />,
};

describe("InfoCard", () => {
  it("renders label and value", () => {
    render(<InfoCard {...defaultProps} />);
    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByText("john@example.com")).toBeInTheDocument();
  });

  it("renders icon", () => {
    render(<InfoCard {...defaultProps} />);
    expect(document.querySelector("svg")).toBeInTheDocument();
  });

  it("calls onClick when clicked", () => {
    const onClick = vi.fn();
    render(<InfoCard {...defaultProps} onClick={onClick} />);
    fireEvent.click(screen.getByText("Email").closest("div")!);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders link button when link is provided", () => {
    render(<InfoCard {...defaultProps} link="https://example.com" />);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("does not render link button when link is not provided", () => {
    render(<InfoCard {...defaultProps} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("opens link in new tab when link button clicked", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<InfoCard {...defaultProps} link="https://example.com" />);
    fireEvent.click(screen.getByRole("button"));
    expect(openSpy).toHaveBeenCalledWith("https://example.com", "_blank");
    openSpy.mockRestore();
  });

  it("renders in dark theme without crashing", () => {
    render(<InfoCard {...defaultProps} theme="dark" />);
    expect(screen.getByText("Email")).toBeInTheDocument();
  });
});
