import { render, screen, fireEvent } from "@testing-library/react";
import { CandidateHeader } from "@web/features/job-openings/info-modal/CandidateHeader";

describe("CandidateHeader", () => {
  it("renders the job title, name, email, and status", () => {
    render(
      <CandidateHeader
        jobTitle="Software Engineer"
        name="Jane Doe"
        email="jane@example.com"
        status="Hired"
      />,
    );
    expect(screen.getByText("Software Engineer")).toBeInTheDocument();
    expect(screen.getByText("Name: Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("Email: jane@example.com")).toBeInTheDocument();
    expect(screen.getByText("Hired")).toBeInTheDocument();
  });

  it("falls back to 'N/A' for missing name/email and 'No Status' for a blank status", () => {
    render(
      <CandidateHeader
        jobTitle="Engineer"
        name={undefined}
        email={undefined}
        status=""
      />,
    );
    expect(screen.getByText("Name: N/A")).toBeInTheDocument();
    expect(screen.getByText("Email: N/A")).toBeInTheDocument();
    expect(screen.getByText("No Status")).toBeInTheDocument();
  });

  it("does not show the assigned-official-email section for a non-Hired candidate", () => {
    render(
      <CandidateHeader
        jobTitle="Engineer"
        name="Jane Doe"
        email="jane@example.com"
        status="Round 1 Scheduled"
      />,
    );
    expect(
      screen.queryByText("Assigned Official Email"),
    ).not.toBeInTheDocument();
  });

  it("shows the assigned official email read-only when the caller can't edit it", () => {
    render(
      <CandidateHeader
        jobTitle="Engineer"
        name="Jane Doe"
        email="jane@example.com"
        status="Hired"
        assignedOfficialEmail="jane@acme.example"
        canEditOfficialEmail={false}
      />,
    );
    expect(screen.getByText("Assigned Official Email")).toBeInTheDocument();
    expect(screen.getByText("jane@acme.example")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("lets a privileged caller edit and save the assigned official email", () => {
    const onSaveOfficialEmail = vi.fn();
    render(
      <CandidateHeader
        jobTitle="Engineer"
        name="Jane Doe"
        email="jane@example.com"
        status="Hired"
        assignedOfficialEmail="jane@acme.example"
        canEditOfficialEmail
        onSaveOfficialEmail={onSaveOfficialEmail}
      />,
    );
    const input = screen.getByPlaceholderText("e.g. jane@yourcompany.com");
    fireEvent.change(input, { target: { value: "jane.doe@acme.example" } });
    fireEvent.click(screen.getByLabelText("Save assigned official email"));
    expect(onSaveOfficialEmail).toHaveBeenCalledWith("jane.doe@acme.example");
  });

  it("disables the save button while savingOfficialEmail is true", () => {
    render(
      <CandidateHeader
        jobTitle="Engineer"
        name="Jane Doe"
        email="jane@example.com"
        status="Hired"
        assignedOfficialEmail="jane@acme.example"
        canEditOfficialEmail
        savingOfficialEmail
      />,
    );
    expect(
      screen.getByLabelText("Save assigned official email"),
    ).toBeDisabled();
  });
});
