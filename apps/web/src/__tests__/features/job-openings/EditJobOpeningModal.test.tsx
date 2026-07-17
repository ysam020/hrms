import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import EditJobOpeningModal from "@web/features/job-openings/EditJobOpeningModal";
import { AlertContext } from "@web/app/providers/AlertContext";
import apiClient from "@web/core/http/axiosConfig";
import useFetchData from "@web/shared/hooks/useFetchData";

vi.mock("@web/core/http/axiosConfig", () => ({ default: { put: vi.fn() } }));
const mockPut = apiClient.put as unknown as ReturnType<typeof vi.fn>;

vi.mock("@web/shared/hooks/useFetchData");
const mockUseFetchData = useFetchData as unknown as ReturnType<typeof vi.fn>;

vi.mock("primereact/dropdown", () => ({
  Dropdown: (props: any) => (
    <select
      aria-label={props.placeholder}
      value={props.value ?? ""}
      onChange={(e) => props.onChange({ value: e.target.value })}
    >
      <option value="" />
      {(props.options || []).map((opt: any) =>
        typeof opt === "string" ? (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ) : (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ),
      )}
    </select>
  ),
}));
vi.mock("primereact/inputtext", () => ({
  InputText: (props: any) => (
    <input
      placeholder={props.placeholder}
      value={props.value ?? ""}
      onChange={props.onChange}
      onBlur={props.onBlur}
    />
  ),
}));
vi.mock("primereact/calendar", () => ({
  Calendar: (props: any) => (
    <input
      aria-label={props.placeholder}
      value={props.value ? props.value.toISOString().slice(0, 10) : ""}
      onChange={(e) =>
        props.onChange({
          value: e.target.value ? new Date(`${e.target.value}T00:00:00`) : null,
        })
      }
      onBlur={props.onBlur}
    />
  ),
}));

function makeJobData(overrides: Partial<any> = {}) {
  return {
    id: "job1",
    jobTitle: "Software Engineer",
    numberOfVacancies: 2,
    jobPostingDate: "2024-01-01T00:00:00Z",
    applicationDeadline: "2024-02-01T00:00:00Z",
    jobDescription: "Build great things",
    requiredSkills: "React",
    experience: 3,
    budget: [8, 12],
    hiringManager: "Jane Doe",
    status: "Open",
    createdBy: "hr1",
    createdOn: "2024-01-01T00:00:00Z",
    candidatesHired: 0,
    ...overrides,
  };
}

function renderModal(overrides: Partial<any> = {}, setAlert = vi.fn()) {
  const handleClose = vi.fn();
  const getData = vi.fn();
  const updateJobOptimistically = vi.fn();
  const revertOptimisticUpdate = vi.fn();
  render(
    <AlertContext.Provider value={{ setAlert } as any}>
      <EditJobOpeningModal
        open={true}
        handleClose={handleClose}
        getData={getData}
        updateJobOptimistically={updateJobOptimistically}
        revertOptimisticUpdate={revertOptimisticUpdate}
        jobData={makeJobData()}
        {...overrides}
      />
    </AlertContext.Provider>,
  );
  return {
    handleClose,
    getData,
    setAlert,
    updateJobOptimistically,
    revertOptimisticUpdate,
  };
}

describe("EditJobOpeningModal", () => {
  beforeEach(() => {
    mockPut.mockReset();
    mockUseFetchData.mockReturnValue({ data: [], refetch: vi.fn() });
  });

  it("prefills the form from jobData", () => {
    renderModal();
    expect(screen.getByPlaceholderText("Number of Vacancies")).toHaveValue("2");
    expect(screen.getByPlaceholderText("Job Description")).toHaveValue(
      "Build great things",
    );
    expect(screen.getByPlaceholderText("Hiring Manager")).toHaveValue(
      "Jane Doe",
    );
    expect(screen.getByLabelText("Min (LPA)")).toHaveValue(8);
    expect(screen.getByLabelText("Max (LPA)")).toHaveValue(12);
  });

  it("shows the job title in the header", () => {
    renderModal();
    expect(screen.getByText("Software Engineer")).toBeInTheDocument();
  });

  it("applies the optimistic update and closes immediately on submit, before the API call resolves", async () => {
    let resolvePut: (v: any) => void;
    mockPut.mockReturnValue(new Promise((resolve) => (resolvePut = resolve)));
    const { handleClose, updateJobOptimistically, setAlert, getData } =
      renderModal();

    fireEvent.change(screen.getByPlaceholderText("Number of Vacancies"), {
      target: { value: "5" },
    });
    fireEvent.click(screen.getByText("Update Job Opening"));

    await waitFor(() =>
      expect(updateJobOptimistically).toHaveBeenCalledWith(
        "job1",
        expect.objectContaining({ numberOfVacancies: "5", _id: "job1" }),
      ),
    );
    expect(handleClose).toHaveBeenCalled();
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Job opening updated successfully",
      }),
    );
    expect(getData).not.toHaveBeenCalled();

    resolvePut!({});
    await waitFor(() => expect(getData).toHaveBeenCalled());
  });

  it("reverts the optimistic update and shows an error if the background save fails", async () => {
    mockPut.mockRejectedValue({
      response: { data: { message: "Conflict: job was deleted" } },
    });
    const { revertOptimisticUpdate, setAlert } = renderModal();

    fireEvent.click(screen.getByText("Update Job Opening"));

    await waitFor(() => expect(revertOptimisticUpdate).toHaveBeenCalled());
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "error",
        message: "Conflict: job was deleted",
      }),
    );
  });

  it("sends the update payload keyed by the job's id", async () => {
    mockPut.mockResolvedValue({});
    renderModal();
    fireEvent.click(screen.getByText("Update Job Opening"));

    await waitFor(() =>
      expect(mockPut).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          jobTitle: "Software Engineer",
          hiringManager: "Jane Doe",
        }),
      ),
    );
  });
});
