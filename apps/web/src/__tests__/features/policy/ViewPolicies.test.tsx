import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ViewPolicies from "@web/features/policy/ViewPolicies";
import { AlertContext } from "@web/app/providers/AlertContext";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import { UserContext } from "@web/app/providers/UserContext";
import apiClient from "@web/core/http/axiosConfig";

vi.mock("@web/core/http/axiosConfig", () => ({
  default: { get: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));
const mockGet = apiClient.get as unknown as ReturnType<typeof vi.fn>;
const mockPut = apiClient.put as unknown as ReturnType<typeof vi.fn>;
const mockDelete = apiClient.delete as unknown as ReturnType<typeof vi.fn>;

vi.mock("primereact/editor", () => ({
  Editor: (props: any) => (
    <textarea
      aria-label="Policy Content"
      value={props.value ?? ""}
      onChange={(e) => props.onTextChange({ htmlValue: e.target.value })}
    />
  ),
}));

function policy(overrides: Partial<any> = {}) {
  return {
    id: "p1",
    category: "Leave Policy",
    title: "",
    content: "<p>Existing policy content</p>",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-02-01T00:00:00Z",
    ...overrides,
  };
}

function renderView(user: any, setAlert = vi.fn()) {
  render(
    <ThemeContext.Provider
      value={{ theme: "light", toggleTheme: vi.fn() } as any}
    >
      <UserContext.Provider value={{ user } as any}>
        <AlertContext.Provider value={{ setAlert } as any}>
          <ViewPolicies />
        </AlertContext.Provider>
      </UserContext.Provider>
    </ThemeContext.Provider>,
  );
  return { setAlert };
}

describe("ViewPolicies", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPut.mockReset();
    mockDelete.mockReset();
  });

  it("shows an empty state when there are no policies", async () => {
    mockGet.mockResolvedValue({ data: { data: [], total: 0 } });
    renderView({ isSuperUser: true });
    expect(await screen.findByText("No policies found")).toBeInTheDocument();
  });

  it("lists policies with their type chip and dates", async () => {
    mockGet.mockResolvedValue({ data: { data: [policy()], total: 1 } });
    renderView({ isSuperUser: true });
    expect(await screen.findByText("Leave Policy")).toBeInTheDocument();
    expect(screen.getByText("01 Jan 2024")).toBeInTheDocument();
    expect(screen.getByText("01 Feb 2024")).toBeInTheDocument();
  });

  it("hides Edit/Delete actions and the create button for a user without those permissions", async () => {
    mockGet.mockResolvedValue({ data: { data: [policy()], total: 1 } });
    renderView({ isSuperUser: false, tenantRole: "employee", permissions: [] });
    await screen.findByText("Leave Policy");
    expect(screen.queryByLabelText(/^Edit policy:/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Delete policy:/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Create policy")).not.toBeInTheDocument();
    // View/download stay available regardless of permissions.
    expect(screen.getByLabelText(/^View policy:/)).toBeInTheDocument();
  });

  it("shows Edit/Delete/Create actions for a superuser", async () => {
    mockGet.mockResolvedValue({ data: { data: [policy()], total: 1 } });
    renderView({ isSuperUser: true });
    await screen.findByText("Leave Policy");
    expect(screen.getByLabelText(/^Edit policy:/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Delete policy:/)).toBeInTheDocument();
    expect(screen.getByLabelText("Create policy")).toBeInTheDocument();
  });

  it("opens the policy viewer with sanitized content on 'View'", async () => {
    mockGet.mockResolvedValue({ data: { data: [policy()], total: 1 } });
    renderView({ isSuperUser: true });
    await screen.findByText("Leave Policy");

    fireEvent.click(screen.getByLabelText(/^View policy:/));
    expect(screen.getByText("Existing policy content")).toBeInTheDocument();
    expect(screen.getByText("Confidential")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Close policy viewer"));
    expect(
      screen.queryByText("Existing policy content"),
    ).not.toBeInTheDocument();
  });

  it("downloads a policy as a PDF", async () => {
    mockGet.mockResolvedValueOnce({ data: { data: [policy()], total: 1 } });
    mockGet.mockResolvedValueOnce({ data: new Blob(["pdf"]) });
    const createObjectURL = vi.fn().mockReturnValue("blob:mock");
    const revokeObjectURL = vi.fn();
    (window.URL as any).createObjectURL = createObjectURL;
    (window.URL as any).revokeObjectURL = revokeObjectURL;

    renderView({ isSuperUser: true });
    await screen.findByText("Leave Policy");
    fireEvent.click(screen.getByLabelText(/^Download policy:/));

    await waitFor(() =>
      expect(mockGet).toHaveBeenCalledWith("/policies/p1/pdf", {
        responseType: "blob",
      }),
    );
    await waitFor(() => expect(createObjectURL).toHaveBeenCalled());
  });

  it("edits a policy: prefills the type/content and PUTs the update on save", async () => {
    mockGet.mockResolvedValue({ data: { data: [policy()], total: 1 } });
    mockPut.mockResolvedValue({ data: { message: "Policy updated" } });
    const { setAlert } = renderView({ isSuperUser: true });
    await screen.findByText("Leave Policy");

    fireEvent.click(screen.getByLabelText(/^Edit policy:/));
    expect(screen.getByLabelText("Policy Content")).toHaveValue(
      "<p>Existing policy content</p>",
    );

    fireEvent.change(screen.getByLabelText("Policy Content"), {
      target: { value: "<p>Updated content that is long enough</p>" },
    });
    fireEvent.click(screen.getByText("Save Changes"));

    await waitFor(() =>
      expect(mockPut).toHaveBeenCalledWith(
        "/policies/p1",
        expect.objectContaining({
          policyType: "Leave Policy",
          content: "<p>Updated content that is long enough</p>",
        }),
      ),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Policy updated",
      }),
    );
  });

  it("requires a policy name when switching the edit type to 'Other'", async () => {
    mockGet.mockResolvedValue({ data: { data: [policy()], total: 1 } });
    renderView({ isSuperUser: true });
    await screen.findByText("Leave Policy");

    fireEvent.click(screen.getByLabelText(/^Edit policy:/));
    const typeSelect = screen.getByRole("combobox", {
      name: "Policy Type",
      hidden: true,
    });
    fireEvent.mouseDown(typeSelect);
    fireEvent.click(
      await screen.findByRole("option", { name: "Other", hidden: true }),
    );
    fireEvent.click(screen.getByText("Save Changes"));

    expect(
      await screen.findByText("Required", { selector: "p" }),
    ).toBeInTheDocument();
    expect(mockPut).not.toHaveBeenCalled();
  });

  it("deletes a policy through the confirmation dialog", async () => {
    mockGet.mockResolvedValue({
      data: { data: [policy({ title: "PIP Policy" })], total: 1 },
    });
    mockDelete.mockResolvedValue({ data: { message: "Policy deleted" } });
    const { setAlert } = renderView({ isSuperUser: true });
    await screen.findByText("Leave Policy");

    fireEvent.click(screen.getByLabelText(/^Delete policy:/));
    expect(
      screen.getByText(/Are you sure you want to delete "PIP Policy"\?/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText("Delete", { selector: "span" }));

    await waitFor(() =>
      expect(mockDelete).toHaveBeenCalledWith("/policies/p1"),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Policy deleted",
      }),
    );
  });

  it("opens the Create Policy dialog from the toolbar", async () => {
    mockGet.mockResolvedValue({ data: { data: [], total: 0 } });
    renderView({ isSuperUser: true });
    await screen.findByText("No policies found");

    fireEvent.click(screen.getByLabelText("Create policy"));
    expect(screen.getByText("Create Policy")).toBeInTheDocument();
    expect(screen.getByLabelText("Policy Type")).toBeInTheDocument();
  });
});
