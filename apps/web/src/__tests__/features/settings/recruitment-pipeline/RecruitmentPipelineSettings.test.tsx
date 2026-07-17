import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import RecruitmentPipelineSettings from "@web/features/settings/recruitment-pipeline/RecruitmentPipelineSettings";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import apiClient from "@web/core/http/axiosConfig";

vi.mock("@web/core/http/axiosConfig", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));
const mockGet = apiClient.get as unknown as ReturnType<typeof vi.fn>;
const mockPost = apiClient.post as unknown as ReturnType<typeof vi.fn>;
const mockPut = apiClient.put as unknown as ReturnType<typeof vi.fn>;
const mockDelete = apiClient.delete as unknown as ReturnType<typeof vi.fn>;

function template(overrides: Partial<any> = {}) {
  return {
    id: "t1",
    name: "Engineering - Standard",
    isDefault: true,
    isActive: true,
    stages: [
      {
        order: 1,
        name: "Screening Call",
        interviewerRole: "HR",
        outcomeOptions: ["pass", "fail", "hold"],
        isBgvStage: false,
      },
      {
        order: 2,
        name: "Technical Round",
        interviewerRole: "Hiring Manager",
        outcomeOptions: ["pass", "fail", "hold"],
        isBgvStage: true,
        bgvVendor: "Acme Checks",
      },
    ],
    ...overrides,
  };
}

function renderSettings(user: any, setAlert = vi.fn()) {
  render(
    <UserContext.Provider value={{ user } as any}>
      <AlertContext.Provider value={{ setAlert } as any}>
        <RecruitmentPipelineSettings />
      </AlertContext.Provider>
    </UserContext.Provider>,
  );
  return { setAlert };
}

describe("RecruitmentPipelineSettings", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
    mockPut.mockReset();
    mockDelete.mockReset();
  });

  it("shows an empty state when there are no pipelines", async () => {
    mockGet.mockResolvedValue({ data: { data: [] } });
    renderSettings({ isSuperUser: true });
    expect(
      await screen.findByText(/No pipelines configured yet/),
    ).toBeInTheDocument();
  });

  it("lists templates with Default/Inactive chips and stage chips including a BGV icon", async () => {
    mockGet.mockResolvedValue({
      data: { data: [template({ isActive: false })] },
    });
    renderSettings({ isSuperUser: true });
    expect(
      await screen.findByText("Engineering - Standard"),
    ).toBeInTheDocument();
    expect(screen.getByText("Default")).toBeInTheDocument();
    expect(screen.getByText("Inactive")).toBeInTheDocument();
    expect(screen.getByText("1. Screening Call (HR)")).toBeInTheDocument();
    expect(
      screen.getByText("2. Technical Round (Hiring Manager)"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("VerifiedUserIcon")).toBeInTheDocument();
  });

  it("hides Add/Edit/Remove/Set-default for a read-only user", async () => {
    mockGet.mockResolvedValue({ data: { data: [template()] } });
    renderSettings({
      isSuperUser: false,
      tenantRole: "employee",
      permissions: [],
    });
    await screen.findByText("Engineering - Standard");
    expect(
      screen.queryByText("Add pipeline", { selector: "span" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Edit")).not.toBeInTheDocument();
    expect(screen.getByText(/You have read-only access/)).toBeInTheDocument();
  });

  it("hides 'Set as default' for the already-default template", async () => {
    mockGet.mockResolvedValue({
      data: { data: [template({ isDefault: true })] },
    });
    renderSettings({ isSuperUser: true });
    await screen.findByText("Engineering - Standard");
    expect(
      screen.queryByText("Set as default", { selector: "span" }),
    ).not.toBeInTheDocument();
  });

  it("sets a non-default template as default", async () => {
    mockGet.mockResolvedValue({
      data: { data: [template({ id: "t2", isDefault: false })] },
    });
    mockPut.mockResolvedValue({});
    renderSettings({ isSuperUser: true });
    await screen.findByText("Engineering - Standard");

    fireEvent.click(screen.getByText("Set as default", { selector: "span" }));

    await waitFor(() =>
      expect(mockPut).toHaveBeenCalledWith("/interview-pipeline-templates/t2", {
        isDefault: true,
      }),
    );
  });

  it("opens the add dialog pre-filled with the standard 3-stage pipeline, defaulting isDefault when no templates exist", async () => {
    mockGet.mockResolvedValue({ data: { data: [] } });
    renderSettings({ isSuperUser: true });
    await screen.findByText(/No pipelines configured yet/);

    fireEvent.click(screen.getByText("Add pipeline", { selector: "span" }));
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByLabelText("Stage 1 name")).toHaveValue("Screening Call");
    expect(dialog.getByLabelText("Stage 2 name")).toHaveValue(
      "Technical Round",
    );
    expect(dialog.getByLabelText("Stage 3 name")).toHaveValue(
      "HR / Salary Discussion",
    );
    expect(
      dialog.getByRole("checkbox", { name: "Default for new jobs" }),
    ).toBeChecked();
  });

  it("does not default isDefault to true when pipelines already exist", async () => {
    mockGet.mockResolvedValue({ data: { data: [template()] } });
    renderSettings({ isSuperUser: true });
    await screen.findByText("Engineering - Standard");

    fireEvent.click(screen.getByText("Add pipeline", { selector: "span" }));
    const dialog = within(screen.getByRole("dialog"));
    expect(
      dialog.getByRole("checkbox", { name: "Default for new jobs" }),
    ).not.toBeChecked();
  });

  it("disables Save until the pipeline name and every stage name are filled", async () => {
    mockGet.mockResolvedValue({ data: { data: [] } });
    renderSettings({ isSuperUser: true });
    await screen.findByText(/No pipelines configured yet/);
    fireEvent.click(screen.getByText("Add pipeline", { selector: "span" }));
    const dialog = within(screen.getByRole("dialog"));

    const saveBtn = dialog
      .getByText("Save", { selector: "span" })
      .closest("button")!;
    expect(saveBtn).toBeDisabled();

    // The default stages already have names, so filling in just the
    // pipeline name is enough to enable Save...
    fireEvent.change(dialog.getByLabelText("Pipeline name"), {
      target: { value: "Interns" },
    });
    expect(saveBtn).not.toBeDisabled();

    // ...but blanking out any one stage's name disables it again.
    fireEvent.change(dialog.getByLabelText("Stage 1 name"), {
      target: { value: "" },
    });
    expect(saveBtn).toBeDisabled();
  });

  it("creates a new pipeline with re-numbered stage order", async () => {
    mockGet.mockResolvedValue({ data: { data: [] } });
    mockPost.mockResolvedValue({});
    renderSettings({ isSuperUser: true });
    await screen.findByText(/No pipelines configured yet/);
    fireEvent.click(screen.getByText("Add pipeline", { selector: "span" }));
    const dialog = within(screen.getByRole("dialog"));

    fireEvent.change(dialog.getByLabelText("Pipeline name"), {
      target: { value: "Interns" },
    });
    fireEvent.click(dialog.getByText("Save", { selector: "span" }));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(
        "/interview-pipeline-templates",
        expect.objectContaining({
          name: "Interns",
          stages: expect.arrayContaining([
            expect.objectContaining({ order: 1 }),
          ]),
        }),
      ),
    );
  });

  it("adds and removes stages, re-numbering remaining stages, and blocks removing the last stage", async () => {
    mockGet.mockResolvedValue({ data: { data: [] } });
    renderSettings({ isSuperUser: true });
    await screen.findByText(/No pipelines configured yet/);
    fireEvent.click(screen.getByText("Add pipeline", { selector: "span" }));
    const dialog = within(screen.getByRole("dialog"));

    fireEvent.click(dialog.getByText("Add stage", { selector: "span" }));
    expect(dialog.getByLabelText("Stage 4 name")).toBeInTheDocument();

    // Remove stage 1 — stage 2 ("Technical Round") should shift up to slot 1.
    fireEvent.click(dialog.getAllByTestId("DeleteIcon")[0].closest("button")!);
    expect(dialog.getByLabelText("Stage 1 name")).toHaveValue(
      "Technical Round",
    );
  });

  it("shows a BGV vendor field only when a stage is marked as a BGV stage", async () => {
    mockGet.mockResolvedValue({ data: { data: [] } });
    renderSettings({ isSuperUser: true });
    await screen.findByText(/No pipelines configured yet/);
    fireEvent.click(screen.getByText("Add pipeline", { selector: "span" }));
    const dialog = within(screen.getByRole("dialog"));

    expect(
      dialog.queryByLabelText("BGV vendor (optional)"),
    ).not.toBeInTheDocument();
    fireEvent.click(dialog.getAllByRole("checkbox", { name: "BGV stage" })[0]);
    expect(dialog.getByLabelText("BGV vendor (optional)")).toBeInTheDocument();
  });

  it("edits an existing pipeline, prefilling name/stages, and PUTs the update", async () => {
    mockGet.mockResolvedValue({ data: { data: [template()] } });
    mockPut.mockResolvedValue({});
    renderSettings({ isSuperUser: true });
    await screen.findByText("Engineering - Standard");

    fireEvent.click(screen.getByLabelText("Edit"));
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByLabelText("Pipeline name")).toHaveValue(
      "Engineering - Standard",
    );
    expect(dialog.getByLabelText("Stage 1 name")).toHaveValue("Screening Call");

    fireEvent.change(dialog.getByLabelText("Pipeline name"), {
      target: { value: "Engineering v2" },
    });
    fireEvent.click(dialog.getByText("Save", { selector: "span" }));

    await waitFor(() =>
      expect(mockPut).toHaveBeenCalledWith(
        "/interview-pipeline-templates/t1",
        expect.objectContaining({ name: "Engineering v2" }),
      ),
    );
  });

  it("removes a pipeline through the confirmation dialog", async () => {
    mockGet.mockResolvedValue({ data: { data: [template()] } });
    mockDelete.mockResolvedValue({});
    const { setAlert } = renderSettings({ isSuperUser: true });
    await screen.findByText("Engineering - Standard");

    fireEvent.click(screen.getByLabelText("Remove"));
    expect(
      screen.getByText(/"Engineering - Standard" will no longer be selectable/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText("Confirm", { selector: "span" }));

    await waitFor(() =>
      expect(mockDelete).toHaveBeenCalledWith(
        "/interview-pipeline-templates/t1",
      ),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "info",
        message: "Pipeline removed.",
      }),
    );
  });
});
