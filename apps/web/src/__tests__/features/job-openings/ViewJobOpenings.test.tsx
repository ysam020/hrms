import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ViewJobOpenings from "@web/features/job-openings/ViewJobOpenings";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import apiClient from "@web/core/http/axiosConfig";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

const mocks = vi.hoisted(() => {
  const instance: any = vi.fn();
  instance.delete = vi.fn();
  return { instance };
});
vi.mock("@web/core/http/axiosConfig", () => ({ default: mocks.instance }));
const mockApiClient = apiClient as unknown as ReturnType<typeof vi.fn> & {
  delete: ReturnType<typeof vi.fn>;
};

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

vi.mock("@web/features/job-openings/EditJobOpeningModal", () => ({
  default: (props: any) =>
    props.open ? (
      <div>Stub EditJobOpeningModal: {props.jobData?.jobTitle}</div>
    ) : null,
}));
vi.mock("@web/features/job-openings/NewJobOpening", () => ({
  default: () => <div>Stub NewJobOpening</div>,
}));

Object.assign(navigator, { clipboard: { writeText: vi.fn() } });

function makeJob(overrides: Partial<any> = {}) {
  return {
    id: "job1",
    jobTitle: "Software Engineer",
    applicationDeadline: "2024-06-01T00:00:00Z",
    numberOfVacancies: 3,
    candidatesHired: 1,
    budget: [8, 12],
    status: "Active",
    createdBy: "hr1",
    createdOn: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

function renderWith(
  jobs: any[],
  {
    setAlert = vi.fn(),
    user = { isSuperUser: true, tenantSlug: "acme" },
    totalCount = jobs.length,
  } = {},
) {
  mockApiClient.mockResolvedValue({ data: { data: jobs, total: totalCount } });
  return render(
    <AlertContext.Provider value={{ setAlert } as any}>
      <UserContext.Provider value={{ user } as any}>
        <ViewJobOpenings />
      </UserContext.Provider>
    </AlertContext.Provider>,
  );
}

describe("ViewJobOpenings", () => {
  beforeEach(() => {
    mocks.instance.mockReset();
    mocks.instance.delete.mockReset();
    mockNavigate.mockClear();
  });

  it("renders job rows with formatted budget and status chip", async () => {
    renderWith([makeJob()]);
    expect(await screen.findByText("Software Engineer")).toBeInTheDocument();
    expect(screen.getByText("8 LPA - 12 LPA")).toBeInTheDocument();
    expect(
      screen.getByText("Active", { selector: "span" }),
    ).toBeInTheDocument();
  });

  it("shows an em dash for missing budget bounds", async () => {
    renderWith([makeJob({ budget: [0, 12] })]);
    await screen.findByText("Software Engineer");
    expect(screen.getByText("— - 12 LPA")).toBeInTheDocument();
  });

  it("shows an empty message when there are no job openings", async () => {
    renderWith([]);
    expect(
      await screen.findByText("No job openings found"),
    ).toBeInTheDocument();
  });

  it("shows the public careers link banner and copies it", async () => {
    const setAlert = vi.fn();
    renderWith([], {
      setAlert,
      user: { isSuperUser: true, tenantSlug: "acme" },
    });
    await screen.findByText("No job openings found");
    expect(screen.getByText(/\/careers\/acme$/)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Copy link"));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining("/careers/acme"),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Careers link copied",
      }),
    );
  });

  it("hides the careers banner without a tenantSlug", async () => {
    renderWith([], { user: { isSuperUser: true } });
    await screen.findByText("No job openings found");
    expect(screen.queryByText("Public careers page:")).not.toBeInTheDocument();
  });

  it("hides every row action for a deleted job, including View Details", async () => {
    // NOTE: rowActions() returns [] outright for a deleted row, before the
    // "View job opening details" action is ever pushed. That leaves the
    // popover's "Deletion Information" block (rendered when
    // selectedJob.status === "Deleted") unreachable through the real UI —
    // flagged as a possible bug rather than worked around silently.
    renderWith([makeJob({ status: "Deleted" })]);
    await screen.findByText("Software Engineer");
    expect(screen.queryByLabelText(/Edit job opening/)).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(/Delete job opening/),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Copy apply link/)).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("View job opening details"),
    ).not.toBeInTheDocument();
  });

  it("hides Edit/Delete for a user without those permissions", async () => {
    renderWith([makeJob()], {
      user: { tenantRole: "employee", permissions: [] },
    });
    await screen.findByText("Software Engineer");
    expect(screen.queryByLabelText(/Edit job opening/)).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(/Delete job opening/),
    ).not.toBeInTheDocument();
  });

  it("copies a per-row apply link without navigating to the row", async () => {
    const setAlert = vi.fn();
    renderWith([makeJob()], { setAlert });
    await screen.findByText("Software Engineer");

    fireEvent.click(
      screen.getByLabelText("Copy apply link: Software Engineer"),
    );

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining("/careers/acme/apply/job1"),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: 'Apply link for "Software Engineer" copied',
      }),
    );
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("navigates to the job detail page when a row is clicked", async () => {
    renderWith([makeJob()]);
    await screen.findByText("Software Engineer");
    fireEvent.click(screen.getByText("Software Engineer"));
    expect(mockNavigate).toHaveBeenCalledWith("/view-job-opening/job1");
  });

  it("opens the edit modal without triggering row navigation", async () => {
    renderWith([makeJob()]);
    await screen.findByText("Software Engineer");

    fireEvent.click(
      screen.getByLabelText("Edit job opening: Software Engineer"),
    );

    expect(
      await screen.findByText("Stub EditJobOpeningModal: Software Engineer"),
    ).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("deletes a job opening after confirmation", async () => {
    mocks.instance.delete.mockResolvedValue({});
    const setAlert = vi.fn();
    renderWith([makeJob()], { setAlert });
    await screen.findByText("Software Engineer");

    fireEvent.click(
      screen.getByLabelText("Delete job opening: Software Engineer"),
    );
    expect(
      screen.getByText(
        "Are you sure you want to delete this job opening? This action cannot be undone.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText("Delete", { selector: "span" }));

    await waitFor(() => expect(mocks.instance.delete).toHaveBeenCalled());
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Job opening deleted successfully",
      }),
    );
  });

  it("hides deletion info in the details popover for an active job", async () => {
    renderWith([makeJob({ status: "Active" })]);
    await screen.findByText("Software Engineer");
    fireEvent.click(screen.getByLabelText("View job opening details"));
    expect(await screen.findByText("Created By")).toBeInTheDocument();
    expect(screen.queryByText("Deletion Information")).not.toBeInTheDocument();
  });

  it("refetches when the status filter changes", async () => {
    renderWith([makeJob()]);
    await screen.findByText("Software Engineer");
    mocks.instance.mockClear();

    fireEvent.change(screen.getByLabelText("Select Status"), {
      target: { value: "Expired" },
    });

    await waitFor(() =>
      expect(mocks.instance).toHaveBeenCalledWith(
        expect.stringContaining("status=Expired"),
      ),
    );
  });

  it("hides New Job Opening for a user without create permission", async () => {
    renderWith([], { user: { tenantRole: "employee", permissions: [] } });
    await screen.findByText("No job openings found");
    expect(screen.queryByLabelText("New job opening")).not.toBeInTheDocument();
  });

  it("opens the New Job Opening dialog", async () => {
    renderWith([], { user: { isSuperUser: true, tenantSlug: "acme" } });
    await screen.findByText("No job openings found");

    fireEvent.click(screen.getByLabelText("New job opening"));

    expect(screen.getByText("Stub NewJobOpening")).toBeInTheDocument();
  });
});
