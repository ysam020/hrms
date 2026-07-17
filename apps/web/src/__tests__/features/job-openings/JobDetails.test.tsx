import { render, screen } from "@testing-library/react";
import JobDetails from "@web/features/job-openings/JobDetails";

describe("JobDetails", () => {
  it("shows 'N/A' for every missing field", () => {
    render(<JobDetails jobApplications={[]} />);
    expect(screen.getAllByText("N/A").length).toBeGreaterThan(0);
  });

  it("renders the job title, description, and dates", () => {
    render(
      <JobDetails
        jobTitle="Software Engineer"
        jobDescription="Build great things"
        jobPostingDate="2024-01-01"
        applicationDeadline="2024-02-01"
        jobApplications={[]}
      />,
    );
    expect(screen.getByText("Software Engineer")).toBeInTheDocument();
    expect(screen.getByText("Build great things")).toBeInTheDocument();
  });

  it("formats experience as 'N Years' and budget as a range in LPA", () => {
    render(<JobDetails experience={3} budget={[8, 12]} jobApplications={[]} />);
    expect(screen.getByText("3 Years")).toBeInTheDocument();
    expect(screen.getByText("8 - 12 LPA")).toBeInTheDocument();
  });

  it("shows the total application count from jobApplications", () => {
    render(<JobDetails jobApplications={[{}, {}, {}]} />);
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("shows vacancy and hired counts", () => {
    render(
      <JobDetails
        numberOfVacancies={5}
        candidatesHired={2}
        jobApplications={[]}
      />,
    );
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });
});
