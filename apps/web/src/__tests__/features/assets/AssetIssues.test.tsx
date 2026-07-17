import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AssetIssues from "@web/features/assets/AssetIssues";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import apiClient from "@web/core/http/axiosConfig";

const mocks = vi.hoisted(() => {
  const instance: any = vi.fn();
  instance.get = vi.fn();
  instance.post = vi.fn();
  instance.patch = vi.fn();
  return { instance };
});
vi.mock("@web/core/http/axiosConfig", () => ({ default: mocks.instance }));
const mockApiClient = apiClient as unknown as ReturnType<typeof vi.fn> & {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
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

function makeIssue(overrides: Partial<any> = {}) {
  return {
    id: "i1",
    asset: { assetCode: "LPT-001", name: "MacBook Pro" },
    type: "malfunction",
    priority: "high",
    title: "Screen flickering",
    description: "Screen flickers on startup",
    status: "open",
    reporter: { username: "jdoe" },
    createdAt: "2024-06-01T00:00:00Z",
    ...overrides,
  };
}

function renderWith(
  issues: any[],
  { user = { tenantRole: "employee" }, setAlert = vi.fn() } = {},
) {
  mockApiClient.mockResolvedValue({
    data: { data: issues, total: issues.length },
  });
  return render(
    <AlertContext.Provider value={{ setAlert } as any}>
      <UserContext.Provider value={{ user } as any}>
        <AssetIssues />
      </UserContext.Provider>
    </AlertContext.Provider>,
  );
}

const HR_USER = { tenantRole: "hr" };

describe("AssetIssues", () => {
  beforeEach(() => {
    mocks.instance.mockReset();
    mocks.instance.get.mockReset();
    mocks.instance.post.mockReset();
    mocks.instance.patch.mockReset();
    mocks.instance.get.mockResolvedValue({ data: { data: [] } });
  });

  it("shows an empty state when there are no issues", async () => {
    renderWith([]);
    expect(
      await screen.findByText("No asset issues found"),
    ).toBeInTheDocument();
  });

  it("renders the issue row with asset, type, priority, title, and status", async () => {
    renderWith([makeIssue()]);
    expect(await screen.findByText("LPT-001")).toBeInTheDocument();
    expect(screen.getByText("Malfunction")).toBeInTheDocument();
    expect(screen.getByText("Screen flickering")).toBeInTheDocument();
    expect(screen.getByText("Open", { selector: "span" })).toBeInTheDocument();
  });

  it("shows the reporter column only for HR", async () => {
    renderWith([makeIssue()], { user: HR_USER });
    await screen.findByText("LPT-001");
    expect(screen.getByText("jdoe")).toBeInTheDocument();
  });

  it("hides the reporter column for a regular employee", async () => {
    renderWith([makeIssue()], { user: { tenantRole: "employee" } });
    await screen.findByText("LPT-001");
    expect(screen.queryByText("jdoe")).not.toBeInTheDocument();
  });

  it("hides row actions for a non-HR user", async () => {
    renderWith([makeIssue({ status: "open" })], {
      user: { tenantRole: "employee" },
    });
    await screen.findByText("LPT-001");
    expect(screen.queryByLabelText("Start Review")).not.toBeInTheDocument();
  });

  it("shows 'Start Review' for an open issue (HR)", async () => {
    renderWith([makeIssue({ status: "open" })], { user: HR_USER });
    await screen.findByText("LPT-001");
    expect(screen.getByLabelText("Start Review")).toBeInTheDocument();
  });

  it("shows Approve/Reject for an in-review issue", async () => {
    renderWith([makeIssue({ status: "in_review" })], { user: HR_USER });
    await screen.findByText("LPT-001");
    expect(screen.getByLabelText("Approve")).toBeInTheDocument();
    expect(screen.getByLabelText("Reject")).toBeInTheDocument();
  });

  it("shows Resolve for an approved issue, and no actions for a resolved one", async () => {
    renderWith([makeIssue({ status: "approved" })], { user: HR_USER });
    await screen.findByText("LPT-001");
    expect(screen.getByLabelText("Resolve")).toBeInTheDocument();
  });

  it("opens the read-only details dialog on row click", async () => {
    renderWith([makeIssue({ description: "Full details here" })]);
    await screen.findByText("LPT-001");

    fireEvent.click(screen.getByText("Screen flickering"));

    expect(screen.getByText("Issue Details")).toBeInTheDocument();
    expect(screen.getByText("Full details here")).toBeInTheDocument();
  });

  it("loads only the reporter's assigned assets in the report dialog for a regular employee", async () => {
    mocks.instance.get.mockResolvedValue({
      data: { data: [{ id: "a1", assetCode: "LPT-001", name: "MacBook Pro" }] },
    });
    renderWith([], { user: { tenantRole: "employee" } });
    await screen.findByText("No asset issues found");

    fireEvent.click(screen.getByLabelText("Report asset issue"));

    await waitFor(() =>
      expect(mocks.instance.get).toHaveBeenCalledWith("/assets?limit=100"),
    );
    fireEvent.mouseDown(screen.getByLabelText("Asset"));
    expect(
      await screen.findByText("LPT-001 — MacBook Pro"),
    ).toBeInTheDocument();
  });

  it("loads all assigned assets tenant-wide in the report dialog for HR", async () => {
    renderWith([], { user: HR_USER });
    await screen.findByText("No asset issues found");

    fireEvent.click(screen.getByLabelText("Report asset issue"));

    await waitFor(() =>
      expect(mocks.instance.get).toHaveBeenCalledWith(
        "/assets?status=assigned&limit=200",
      ),
    );
  });

  it("submits a new issue report", async () => {
    mocks.instance.get.mockResolvedValue({
      data: { data: [{ id: "a1", assetCode: "LPT-001", name: "MacBook Pro" }] },
    });
    mocks.instance.post.mockResolvedValue({});
    const setAlert = vi.fn();
    renderWith([], { user: { tenantRole: "employee" }, setAlert });
    await screen.findByText("No asset issues found");

    fireEvent.click(screen.getByLabelText("Report asset issue"));
    fireEvent.mouseDown(await screen.findByLabelText("Asset"));
    fireEvent.click(await screen.findByText("LPT-001 — MacBook Pro"));

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Won't boot" },
    });
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Black screen on power-on" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() =>
      expect(mocks.instance.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          assetId: "a1",
          title: "Won't boot",
          description: "Black screen on power-on",
        }),
      ),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Issue reported",
      }),
    );
  });

  it("disables Submit until asset, title, and description are all filled in", async () => {
    renderWith([], { user: { tenantRole: "employee" } });
    await screen.findByText("No asset issues found");
    fireEvent.click(screen.getByLabelText("Report asset issue"));
    expect(screen.getByRole("button", { name: "Submit" })).toBeDisabled();
  });

  it("performs an HR action, updating the issue status and showing a targeted success message", async () => {
    mocks.instance.patch.mockResolvedValue({});
    const setAlert = vi.fn();
    renderWith([makeIssue({ status: "open" })], { user: HR_USER, setAlert });
    await screen.findByText("LPT-001");

    fireEvent.click(screen.getByLabelText("Start Review"));
    expect(screen.getByText("Start Review Issue")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Notes (optional)"), {
      target: { value: "Looking into it" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Start Review" }));

    await waitFor(() =>
      expect(mocks.instance.patch).toHaveBeenCalledWith(expect.any(String), {
        status: "in_review",
        notes: "Looking into it",
      }),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Issue marked as 'in_review'",
      }),
    );
  });

  it("warns that resolving a 'lost' issue will retire the asset", async () => {
    renderWith([makeIssue({ status: "approved", type: "lost" })], {
      user: HR_USER,
    });
    await screen.findByText("LPT-001");

    fireEvent.click(screen.getByLabelText("Resolve"));

    expect(
      screen.getByText("⚠️ This will retire the asset."),
    ).toBeInTheDocument();
  });

  it("shows the server error message when an HR action fails", async () => {
    mocks.instance.patch.mockRejectedValue({
      response: { data: { message: "Already resolved" } },
    });
    const setAlert = vi.fn();
    renderWith([makeIssue({ status: "open" })], { user: HR_USER, setAlert });
    await screen.findByText("LPT-001");

    fireEvent.click(screen.getByLabelText("Start Review"));
    fireEvent.click(screen.getByRole("button", { name: "Start Review" }));

    await waitFor(() =>
      expect(setAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: "error",
          message: "Already resolved",
        }),
      ),
    );
  });
});
