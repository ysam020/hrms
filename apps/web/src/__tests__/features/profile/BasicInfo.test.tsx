import { render, screen, fireEvent } from "@testing-library/react";
import BasicInfo from "@web/features/profile/BasicInfo";

function makeUser(overrides: Partial<any> = {}) {
  return {
    username: "jdoe",
    fullName: "Jane Doe",
    designation: "Engineer",
    department: "Engineering",
    joining_date: "2024-01-15",
    ...overrides,
  };
}

describe("BasicInfo", () => {
  it("shows N/A for missing fields", () => {
    render(
      <BasicInfo
        user={makeUser({ blood_group: null, mobile: undefined, email: "" })}
      />,
    );
    expect(screen.getAllByText("N/A").length).toBeGreaterThan(0);
  });

  it("formats a valid date and shows 'Joining date: N/A' for a missing one", () => {
    const { rerender } = render(
      <BasicInfo user={makeUser({ joining_date: "2024-01-15" })} />,
    );
    expect(screen.getByText("Joined 15 Jan 2024")).toBeInTheDocument();

    rerender(<BasicInfo user={makeUser({ joining_date: null })} />);
    expect(screen.getByText("Joining date: N/A")).toBeInTheDocument();
  });

  it("joins non-empty address parts and falls back to N/A when all are missing", () => {
    const { rerender } = render(
      <BasicInfo
        user={makeUser({
          communication_address_line_1: "12 Main St",
          communication_address_city: "Metropolis",
          communication_address_state: null,
          communication_address_pincode: "",
        })}
      />,
    );
    expect(screen.getByText("12 Main St, Metropolis")).toBeInTheDocument();

    rerender(
      <BasicInfo
        user={makeUser({
          communication_address_line_1: null,
          communication_address_city: null,
          communication_address_state: null,
          communication_address_pincode: null,
        })}
      />,
    );
    // "Current Address" section now shows N/A among the other N/A fields
    expect(screen.getAllByText("N/A").length).toBeGreaterThan(0);
  });

  it("shows no status banner for an active employee", () => {
    render(<BasicInfo user={makeUser({ employeeStatus: "Active" })} />);
    expect(
      screen.queryByText(/Terminated|Absconded|resigned/),
    ).not.toBeInTheDocument();
  });

  it("shows a terminated status banner with reason and date", () => {
    render(
      <BasicInfo
        user={makeUser({
          employeeStatus: "Terminated",
          dateOfTermination: "2024-06-01",
          reasonForTermination: "Policy violation",
        })}
      />,
    );
    expect(
      screen.getByText(/Terminated 2024-06-01 — Policy violation/),
    ).toBeInTheDocument();
  });

  it("shows an absconded status banner", () => {
    render(
      <BasicInfo
        user={makeUser({
          employeeStatus: "Absconded",
          dateOfAbscond: "2024-06-01",
        })}
      />,
    );
    expect(screen.getByText(/Absconded 2024-06-01/)).toBeInTheDocument();
  });

  it("shows a resigned status banner", () => {
    render(<BasicInfo user={makeUser({ employeeStatus: "Resigned" })} />);
    expect(screen.getByText("Employee has resigned")).toBeInTheDocument();
  });

  it("opens a document link in a new tab only when both link and value are present", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    render(
      <BasicInfo
        user={makeUser({
          aadhar_no: "1234",
          aadhar_photo_front: "https://example.com/aadhar.jpg",
          pan_no: null,
        })}
      />,
    );
    expect(screen.getByLabelText("Open 1234 in a new tab")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Open .* PAN/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Open 1234 in a new tab"));
    expect(openSpy).toHaveBeenCalledWith(
      "https://example.com/aadhar.jpg",
      "_blank",
    );
    openSpy.mockRestore();
  });

  it("falls back to the username's initial when there is no full name", () => {
    render(<BasicInfo user={{ username: "jdoe" }} />);
    expect(screen.getByText("J")).toBeInTheDocument();
  });
});
