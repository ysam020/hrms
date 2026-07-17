import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import NewJobOpening from "@web/features/job-openings/NewJobOpening";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import apiClient from "@web/core/http/axiosConfig";
import useFetchData from "@web/shared/hooks/useFetchData";

vi.mock("@web/core/http/axiosConfig", () => ({ default: { post: vi.fn() } }));
const mockPost = apiClient.post as unknown as ReturnType<typeof vi.fn>;

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

Object.assign(navigator, { clipboard: { writeText: vi.fn() } });

function setupFetch({ users = [], pipelines = [], designations = [] } = {}) {
  mockUseFetchData.mockImplementation((url: string | null) => {
    if (url && url.includes("get-all-users"))
      return { data: users, refetch: vi.fn() };
    if (url && url.includes("pipeline"))
      return { data: pipelines, refetch: vi.fn() };
    if (url && url.includes("designation"))
      return { data: designations, refetch: vi.fn() };
    return { data: [], refetch: vi.fn() };
  });
}

function renderForm(
  setAlert = vi.fn(),
  onSaved = vi.fn(),
  user: any = { tenantSlug: "acme" },
) {
  const view = render(
    <AlertContext.Provider value={{ setAlert } as any}>
      <UserContext.Provider value={{ user } as any}>
        <NewJobOpening onSaved={onSaved} />
      </UserContext.Provider>
    </AlertContext.Provider>,
  );
  return { setAlert, onSaved, container: view.container };
}

function yesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}
function futureDate(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function fillValidForm() {
  // Must match one of the default job title options exactly — the mocked
  // native <select> silently ignores a value with no matching <option>.
  fireEvent.change(screen.getByLabelText("Job Title"), {
    target: { value: "SOFTWARE ENGINEER" },
  });
  fireEvent.change(screen.getByPlaceholderText("Number of Vacancies"), {
    target: { value: "2" },
  });
  fireEvent.change(screen.getByPlaceholderText("Job Description"), {
    target: { value: "Build great software products" },
  });
  fireEvent.change(screen.getByLabelText("Job Posting Date"), {
    target: { value: yesterday() },
  });
  fireEvent.change(screen.getByLabelText("Application Deadline"), {
    target: { value: futureDate(14) },
  });
  fireEvent.change(screen.getByPlaceholderText("Required Skills"), {
    target: { value: "React, Node" },
  });
  fireEvent.change(screen.getByPlaceholderText("Experience (in years)"), {
    target: { value: "3" },
  });
  fireEvent.change(screen.getByLabelText("Select Hiring Manager"), {
    target: { value: "JANE DOE" },
  });
  fireEvent.change(screen.getByLabelText("Min (LPA)"), {
    target: { value: "8" },
  });
  fireEvent.change(screen.getByLabelText("Max (LPA)"), {
    target: { value: "12" },
  });
}

describe("NewJobOpening", () => {
  beforeEach(() => {
    mockPost.mockReset();
    setupFetch({
      users: [{ firstName: "Jane", lastName: "Doe", username: "jdoe" }],
    });
  });

  it("transforms user data into uppercase display names for the hiring-manager dropdown", () => {
    renderForm();
    expect(screen.getByText("JANE DOE")).toBeInTheDocument();
  });

  it("falls back to the uppercased username when a user has no first/last name", () => {
    setupFetch({ users: [{ username: "jdoe" }] });
    renderForm();
    expect(screen.getByText("JDOE")).toBeInTheDocument();
  });

  it("shows only active pipeline templates, marking the default", () => {
    setupFetch({
      pipelines: [
        { id: "p1", name: "Standard", isActive: true, isDefault: true },
        { id: "p2", name: "Executive", isActive: true, isDefault: false },
        { id: "p3", name: "Old", isActive: false, isDefault: false },
      ],
    });
    renderForm();
    expect(screen.getByText("Standard (Default)")).toBeInTheDocument();
    expect(screen.getByText("Executive")).toBeInTheDocument();
    expect(screen.queryByText("Old")).not.toBeInTheDocument();
  });

  it("shows a validation error for an invalid budget range (min >= max)", async () => {
    renderForm();
    await fillValidForm();
    fireEvent.change(screen.getByLabelText("Min (LPA)"), {
      target: { value: "15" },
    });
    await waitFor(() =>
      expect(screen.getByLabelText("Min (LPA)")).toHaveValue(15),
    );
    fireEvent.click(screen.getByText("Create Job Opening"));

    expect(await screen.findByText("Invalid budget range")).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("submits a valid job opening and shows the copyable apply link", async () => {
    mockPost.mockResolvedValue({
      data: { message: "Job opening created", data: { id: "job1" } },
    });
    const { setAlert, onSaved } = renderForm();
    await fillValidForm();

    fireEvent.click(screen.getByText("Create Job Opening"));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          jobTitle: "SOFTWARE ENGINEER",
          numberOfVacancies: "2",
          budget: [8, 12],
        }),
      ),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Job opening created",
      }),
    );
    expect(onSaved).toHaveBeenCalled();
    expect(
      await screen.findByDisplayValue(/\/careers\/acme\/apply\/job1/),
    ).toBeInTheDocument();
  });

  it("copies the apply link when clicked", async () => {
    mockPost.mockResolvedValue({
      data: { message: "Created", data: { id: "job1" } },
    });
    const setAlert = vi.fn();
    const { container } = renderForm(setAlert);
    await fillValidForm();
    fireEvent.click(screen.getByText("Create Job Opening"));
    await screen.findByDisplayValue(/\/careers\/acme\/apply\/job1/);

    const copyButton = container
      .querySelector('[data-testid="ContentCopyIcon"]')!
      .closest("button")!;
    fireEvent.click(copyButton);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining("/careers/acme/apply/job1"),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Apply link copied",
      }),
    );
  });
});
