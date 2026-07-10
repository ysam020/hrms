import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AppsPopover from "@web/features/layout/AppsPopover";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({ pathname: "/attendance" }),
  };
});

const future = { v7_startTransition: true, v7_relativeSplatPath: true };
const renderApps = () =>
  render(
    <MemoryRouter future={future}>
      <AppsPopover theme="light" />
    </MemoryRouter>,
  );

describe("AppsPopover", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it("renders the Apps trigger button, closed by default", () => {
    renderApps();
    expect(screen.getByRole("button", { name: "Apps" })).toBeInTheDocument();
    expect(screen.queryByText("Employees")).not.toBeInTheDocument();
  });

  it("opens a popover listing every former dock module on click", async () => {
    renderApps();
    fireEvent.click(screen.getByRole("button", { name: "Apps" }));

    await waitFor(() => {
      expect(screen.getByText("Attendance")).toBeInTheDocument();
    });

    [
      "Attendance",
      "Employees",
      "Holidays",
      "HR Activities",
      "Job Openings",
      "KYC Details",
      "Resignation",
      "Payroll",
      "Assets",
      "WFH",
      "Helpdesk",
      "Reports",
    ].forEach((label) => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
  });

  it("navigates and closes the popover when a module tile is clicked", async () => {
    renderApps();
    fireEvent.click(screen.getByRole("button", { name: "Apps" }));
    await waitFor(() => screen.getByText("Employees"));

    fireEvent.click(screen.getByRole("button", { name: "Employees" }));

    expect(mockNavigate).toHaveBeenCalledWith("/employee-management");
    await waitFor(() => {
      expect(screen.queryByText("Employees")).not.toBeInTheDocument();
    });
  });

  it("marks the module matching the current route as active", async () => {
    renderApps();
    fireEvent.click(screen.getByRole("button", { name: "Apps" }));
    await waitFor(() => screen.getByText("Attendance"));

    expect(screen.getByRole("button", { name: "Attendance" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByRole("button", { name: "Employees" }),
    ).not.toHaveAttribute("aria-current");
  });
});
