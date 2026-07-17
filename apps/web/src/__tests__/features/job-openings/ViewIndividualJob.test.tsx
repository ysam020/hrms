import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import ViewIndividualJob from "@web/features/job-openings/ViewIndividualJob";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import useFetchData from "@web/shared/hooks/useFetchData";

vi.mock("@web/shared/hooks/useFetchData");
const mockUseFetchData = useFetchData as unknown as ReturnType<typeof vi.fn>;

vi.mock("@web/features/job-openings/JobDetails", () => ({
  default: (props: any) => <div>Stub JobDetails: {props.jobTitle}</div>,
}));
vi.mock("@web/features/job-openings/JobApplications", () => ({
  default: (props: any) => (
    <div>
      Stub JobApplications
      <button
        onClick={() =>
          props.handleOpenInfoModal({ id: "app1", name: "Jane Doe" })
        }
      >
        open-info
      </button>
    </div>
  ),
}));
vi.mock("@web/features/job-openings/ScheduleInterviewModal", () => ({
  default: (props: any) =>
    props.open ? <div>Stub ScheduleInterviewModal</div> : null,
}));
vi.mock("@web/features/job-openings/HiringModal", () => ({
  default: (props: any) => (props.open ? <div>Stub HiringModal</div> : null),
}));
vi.mock("@web/features/job-openings/RejectModal", () => ({
  default: (props: any) => (props.open ? <div>Stub RejectModal</div> : null),
}));
vi.mock("@web/features/job-openings/InfoModal", () => ({
  default: (props: any) =>
    props.open ? <div>Stub InfoModal: {props.applicantData?.name}</div> : null,
}));

Object.assign(navigator, { clipboard: { writeText: vi.fn() } });

function renderWith(
  { job, applications = [] }: { job: any; applications?: any[] },
  { setAlert = vi.fn(), user = { tenantSlug: "acme" } } = {},
) {
  mockUseFetchData.mockImplementation((url: string | null) => {
    if (url && url.includes("/view-applications")) {
      return { data: applications, refetch: vi.fn() };
    }
    return { data: job, loading: false, refetch: vi.fn() };
  });
  return render(
    <MemoryRouter initialEntries={["/job-openings/job1"]}>
      <Routes>
        <Route
          path="/job-openings/:_id"
          element={
            <AlertContext.Provider value={{ setAlert } as any}>
              <UserContext.Provider value={{ user } as any}>
                <ViewIndividualJob />
              </UserContext.Provider>
            </AlertContext.Provider>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ViewIndividualJob", () => {
  it("shows 'Job not found' when there is no job data", () => {
    renderWith({ job: null });
    expect(screen.getByText("Job not found")).toBeInTheDocument();
  });

  it("renders the job title and hired/applications chips", () => {
    renderWith({
      job: {
        jobTitle: "Software Engineer",
        candidatesHired: 1,
        numberOfVacancies: 3,
      },
      applications: [{ id: "a1" }, { id: "a2" }],
    });
    expect(screen.getByText("Software Engineer")).toBeInTheDocument();
    expect(screen.getByText("1/3 Hired")).toBeInTheDocument();
    expect(screen.getByText("2 Applications")).toBeInTheDocument();
  });

  it("hides the copy-apply-link button without a tenantSlug", () => {
    renderWith({ job: { jobTitle: "Engineer" } }, { user: {} });
    expect(
      screen.queryByLabelText("Copy public apply link"),
    ).not.toBeInTheDocument();
  });

  it("copies the public apply link to the clipboard", async () => {
    const setAlert = vi.fn();
    renderWith(
      { job: { jobTitle: "Engineer" } },
      { setAlert, user: { tenantSlug: "acme" } },
    );

    fireEvent.click(screen.getByLabelText("Copy public apply link"));

    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining("/careers/acme/apply/job1"),
      ),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Apply link copied",
      }),
    );
  });

  it("opens the info modal with the freshest data for that applicant", () => {
    renderWith({
      job: { jobTitle: "Engineer" },
      applications: [{ id: "app1", name: "Jane Doe", status: "Hired" }],
    });

    fireEvent.click(screen.getByRole("tab", { name: "Applications" }));
    fireEvent.click(screen.getByText("open-info"));

    expect(screen.getByText("Stub InfoModal: Jane Doe")).toBeInTheDocument();
  });

  it("renders both the Job Details and Applications tabs", () => {
    renderWith({ job: { jobTitle: "Engineer" } });
    expect(
      screen.getByRole("tab", { name: "Job Details" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Applications" }),
    ).toBeInTheDocument();
  });
});
