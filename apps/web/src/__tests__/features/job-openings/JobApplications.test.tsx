import { render, screen, fireEvent } from "@testing-library/react";
import JobApplications from "@web/features/job-openings/JobApplications";
import { UserContext } from "@web/app/providers/UserContext";

vi.mock("primereact/dropdown", () => ({
  Dropdown: (props: any) => (
    <select
      aria-label={props.placeholder}
      value={props.value ?? ""}
      onChange={(e) => props.onChange({ value: e.target.value })}
    >
      {(props.options || []).map((opt: any) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  ),
}));

function makeApplicant(overrides: Partial<any> = {}) {
  return {
    name: "Jane Doe",
    status: "Applied",
    resume: null,
    interviews: [],
    ...overrides,
  };
}

function renderWith(
  jobApplications: any[],
  props: Partial<any> = {},
  user: any = { isSuperUser: true },
) {
  return render(
    <UserContext.Provider value={{ user } as any}>
      <JobApplications
        jobApplications={jobApplications}
        searchTerm=""
        setSearchTerm={vi.fn()}
        statusFilter="All"
        setStatusFilter={vi.fn()}
        handleOpenInterviewModal={vi.fn()}
        handleOpenHiringModal={vi.fn()}
        handleOpenRejectModal={vi.fn()}
        handleOpenInfoModal={vi.fn()}
        {...props}
      />
    </UserContext.Provider>,
  );
}

describe("JobApplications", () => {
  it("renders applicant rows with a status chip", () => {
    renderWith([makeApplicant({ status: "Hired" })]);
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("Hired", { selector: "span" })).toBeInTheDocument();
  });

  it("shows an empty message when there are no applications", () => {
    renderWith([]);
    expect(screen.getByText("No applications found")).toBeInTheDocument();
  });

  it("shows View Details for any candidate when permitted", () => {
    const handleOpenInfoModal = vi.fn();
    renderWith([makeApplicant()], { handleOpenInfoModal });
    fireEvent.click(screen.getByLabelText("View details for Jane Doe"));
    expect(handleOpenInfoModal).toHaveBeenCalled();
  });

  it("hides all actions for a user without any job-openings permissions", () => {
    renderWith(
      [makeApplicant({ resume: "https://x/resume.pdf" })],
      {},
      { isSuperUser: false, permissions: [] },
    );
    expect(screen.queryByLabelText(/Download resume/)).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(/Schedule interview/),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/View details/)).not.toBeInTheDocument();
  });

  it("shows the resume download action only when a resume is attached", () => {
    const { rerender } = renderWith([makeApplicant({ resume: null })]);
    expect(screen.queryByLabelText(/Download resume/)).not.toBeInTheDocument();

    rerender(
      <UserContext.Provider value={{ user: { isSuperUser: true } } as any}>
        <JobApplications
          jobApplications={[makeApplicant({ resume: "https://x/resume.pdf" })]}
          searchTerm=""
          setSearchTerm={vi.fn()}
          statusFilter="All"
          setStatusFilter={vi.fn()}
          handleOpenInterviewModal={vi.fn()}
          handleOpenHiringModal={vi.fn()}
          handleOpenRejectModal={vi.fn()}
          handleOpenInfoModal={vi.fn()}
        />
      </UserContext.Provider>,
    );
    expect(
      screen.getByLabelText("Download resume for Jane Doe"),
    ).toBeInTheDocument();
  });

  it("hides Schedule/Hire/Reject once the application is terminal (Hired/Rejected)", () => {
    renderWith([
      makeApplicant({
        status: "Hired",
        interviews: [{ interviewConducted: true, cleared: true }],
      }),
    ]);
    expect(
      screen.queryByLabelText(/Schedule interview/),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Hire /)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Reject /)).not.toBeInTheDocument();
  });

  it("shows Schedule interview for a non-terminal application when permitted", () => {
    const handleOpenInterviewModal = vi.fn();
    renderWith([makeApplicant()], { handleOpenInterviewModal });
    fireEvent.click(screen.getByLabelText("Schedule interview for Jane Doe"));
    expect(handleOpenInterviewModal).toHaveBeenCalled();
  });

  it("hides Hire until at least one round has been conducted and cleared", () => {
    renderWith([
      makeApplicant({
        interviews: [{ interviewConducted: true, cleared: false }],
      }),
    ]);
    expect(screen.queryByLabelText(/^Hire /)).not.toBeInTheDocument();
  });

  it("shows Hire once a round has been conducted and cleared", () => {
    const handleOpenHiringModal = vi.fn();
    renderWith(
      [
        makeApplicant({
          interviews: [{ interviewConducted: true, cleared: true }],
        }),
      ],
      { handleOpenHiringModal },
    );
    fireEvent.click(screen.getByLabelText("Hire Jane Doe"));
    expect(handleOpenHiringModal).toHaveBeenCalled();
  });

  it("shows Reject for a non-terminal application when permitted", () => {
    const handleOpenRejectModal = vi.fn();
    renderWith([makeApplicant()], { handleOpenRejectModal });
    fireEvent.click(screen.getByLabelText("Reject Jane Doe"));
    expect(handleOpenRejectModal).toHaveBeenCalled();
  });

  it("filters by status via the dropdown", () => {
    const setStatusFilter = vi.fn();
    renderWith([makeApplicant()], { setStatusFilter });
    fireEvent.change(screen.getByLabelText("Select Status"), {
      target: { value: "Hired" },
    });
    expect(setStatusFilter).toHaveBeenCalledWith("Hired");
  });
});
