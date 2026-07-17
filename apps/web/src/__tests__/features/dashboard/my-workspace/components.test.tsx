import { render, screen, fireEvent } from "@testing-library/react";
import {
  ActionBtn,
  StatPill,
  SectionLabel,
} from "@web/features/dashboard/my-workspace/components";

describe("SectionLabel", () => {
  it("renders its children", () => {
    render(<SectionLabel>Quick Actions</SectionLabel>);
    expect(screen.getByText("Quick Actions")).toBeInTheDocument();
  });
});

describe("ActionBtn", () => {
  it("calls onClick on click and on Enter/Space", () => {
    const onClick = vi.fn();
    render(
      <ActionBtn
        icon={<span />}
        label="Apply Leave"
        onClick={onClick}
        isDark={false}
      />,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(screen.getByRole("button"), { key: "Enter" });
    expect(onClick).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(screen.getByRole("button"), { key: " " });
    expect(onClick).toHaveBeenCalledTimes(3);
  });

  it("has an accessible label matching the visible label", () => {
    render(
      <ActionBtn
        icon={<span />}
        label="My Profile"
        onClick={vi.fn()}
        isDark={false}
      />,
    );
    expect(screen.getByLabelText("My Profile")).toBeInTheDocument();
  });
});

describe("StatPill", () => {
  it("shows a skeleton instead of the value while loading", () => {
    const { container } = render(
      <StatPill label="PL Used" value={5} color="#3b82f6" isLoading={true} />,
    );
    expect(container.querySelector(".MuiSkeleton-root")).toBeInTheDocument();
    expect(screen.queryByText("5")).not.toBeInTheDocument();
  });

  it("shows the value once loaded", () => {
    render(
      <StatPill label="PL Used" value={5} color="#3b82f6" isLoading={false} />,
    );
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("PL Used")).toBeInTheDocument();
  });

  it("defaults a missing value to 0", () => {
    render(
      <StatPill
        label="LWP"
        value={undefined}
        color="#ef4444"
        isLoading={false}
      />,
    );
    expect(screen.getByText("0")).toBeInTheDocument();
  });
});
