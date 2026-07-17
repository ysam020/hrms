import { render, screen } from "@testing-library/react";
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
});
