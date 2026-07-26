import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import JoinRequests from "@web/features/settings/JoinRequests";
import { AlertContext } from "@web/app/providers/AlertContext";
import apiClient from "@web/core/http/axiosConfig";

vi.mock("@web/core/http/axiosConfig", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));
const mockGet = apiClient.get as unknown as ReturnType<typeof vi.fn>;
const mockPost = apiClient.post as unknown as ReturnType<typeof vi.fn>;

function request(overrides: Partial<any> = {}) {
  return {
    id: "r1",
    userId: "u1",
    name: "Jane Doe",
    email: "jane@example.com",
    status: "pending",
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function renderList(setAlert = vi.fn()) {
  render(
    <AlertContext.Provider value={{ setAlert } as any}>
      <JoinRequests />
    </AlertContext.Provider>,
  );
  return { setAlert };
}

describe("JoinRequests", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
  });

  it("shows an empty state when there are no pending requests", async () => {
    mockGet.mockResolvedValue({
      data: { success: true, data: { requests: [] } },
    });
    renderList();
    expect(await screen.findByText("No pending requests.")).toBeInTheDocument();
  });

  it("lists requests with name/email, falling back to email when no name is set", async () => {
    mockGet.mockResolvedValue({
      data: {
        success: true,
        data: { requests: [request(), request({ id: "r2", name: "" })] },
      },
    });
    renderList();
    expect(await screen.findByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getAllByText("jane@example.com").length).toBeGreaterThan(0);
  });

  it("approves a request through the confirmation dialog and removes it from the list", async () => {
    mockGet.mockResolvedValue({
      data: { success: true, data: { requests: [request()] } },
    });
    mockPost.mockResolvedValue({ data: { success: true } });
    const { setAlert } = renderList();
    await screen.findByText("Jane Doe");

    fireEvent.click(screen.getByText("Approve", { selector: "span" }));
    expect(screen.getByText("Approve join request")).toBeInTheDocument();

    fireEvent.click(
      screen.getAllByText("Approve", { selector: "span" }).pop()!,
    );

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(
        "/tenants/join-requests/r1/approve",
      ),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Request approved.",
      }),
    );
    await waitFor(() =>
      expect(screen.queryByText("Jane Doe")).not.toBeInTheDocument(),
    );
  });

  it("shows a warning instead of a plain success toast when linking succeeded but salary seeding failed", async () => {
    mockGet.mockResolvedValue({
      data: { success: true, data: { requests: [request()] } },
    });
    mockPost.mockResolvedValue({
      data: {
        success: true,
        data: {
          linkedJobApplicationId: "app-1",
          salarySeeded: false,
        },
      },
    });
    const { setAlert } = renderList();
    await screen.findByText("Jane Doe");

    fireEvent.click(screen.getByText("Approve", { selector: "span" }));
    fireEvent.click(
      screen.getAllByText("Approve", { selector: "span" }).pop()!,
    );

    await waitFor(() =>
      expect(setAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: "warning",
          message: expect.stringContaining("syncing their salary failed"),
        }),
      ),
    );
    // The request is still removed from the list — approval itself
    // genuinely succeeded, only the salary sync needs manual follow-up.
    await waitFor(() =>
      expect(screen.queryByText("Jane Doe")).not.toBeInTheDocument(),
    );
  });

  it("rejects a request through its own confirmation dialog", async () => {
    mockGet.mockResolvedValue({
      data: { success: true, data: { requests: [request()] } },
    });
    mockPost.mockResolvedValue({ data: { success: true } });
    const { setAlert } = renderList();
    await screen.findByText("Jane Doe");

    fireEvent.click(screen.getByText("Reject", { selector: "span" }));
    expect(screen.getByText("Reject join request")).toBeInTheDocument();

    fireEvent.click(screen.getAllByText("Reject", { selector: "span" }).pop()!);

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith("/tenants/join-requests/r1/reject"),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Request rejected.",
      }),
    );
  });

  it("shows a server-provided error message when the decision endpoint reports failure", async () => {
    mockGet.mockResolvedValue({
      data: { success: true, data: { requests: [request()] } },
    });
    mockPost.mockResolvedValue({
      data: { success: false, message: "Request already resolved" },
    });
    const { setAlert } = renderList();
    await screen.findByText("Jane Doe");

    fireEvent.click(screen.getByText("Approve", { selector: "span" }));
    fireEvent.click(
      screen.getAllByText("Approve", { selector: "span" }).pop()!,
    );

    await waitFor(() =>
      expect(setAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: "error",
          message: "Request already resolved",
        }),
      ),
    );
    // A failed decision leaves the request visible so the admin can retry.
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
  });

  it("closes the confirmation dialog on cancel without calling the API", async () => {
    mockGet.mockResolvedValue({
      data: { success: true, data: { requests: [request()] } },
    });
    renderList();
    await screen.findByText("Jane Doe");

    fireEvent.click(screen.getByText("Reject", { selector: "span" }));
    fireEvent.click(screen.getByText("Cancel", { selector: "span" }));

    await waitFor(() =>
      expect(
        screen.queryByText(/Reject.*Jane Doe.*request to join/),
      ).not.toBeInTheDocument(),
    );
    expect(mockPost).not.toHaveBeenCalled();
  });
});
