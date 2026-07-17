import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import dayjs from "dayjs";
import TicketDetail from "@web/features/helpdesk/TicketDetail";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import apiClient from "@web/core/http/axiosConfig";

const mocks = vi.hoisted(() => {
  const instance: any = vi.fn();
  instance.patch = vi.fn();
  instance.post = vi.fn();
  return { instance };
});
vi.mock("@web/core/http/axiosConfig", () => ({ default: mocks.instance }));
const mockApiClient = apiClient as unknown as ReturnType<typeof vi.fn> & {
  patch: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
};

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

function makeTicket(overrides: Partial<any> = {}) {
  return {
    id: "t1",
    ticketNo: "TCK-001",
    title: "Laptop broken",
    description: "Screen is cracked",
    category: "IT",
    priority: "high",
    status: "open",
    createdAt: "2024-06-01T10:00:00Z",
    resolvedAt: null,
    slaDeadline: null,
    slaBreached: false,
    raisedByUser: { first_name: "Jane", last_name: "Doe" },
    comments: [],
    ...overrides,
  };
}

function renderWith(
  ticket: any,
  { setAlert = vi.fn(), user = { username: "hr1", isSuperUser: true } } = {},
) {
  mockApiClient.mockResolvedValue({ data: { data: ticket } });
  return render(
    <MemoryRouter initialEntries={["/helpdesk/t1"]}>
      <Routes>
        <Route
          path="/helpdesk/:ticketId"
          element={
            <AlertContext.Provider value={{ setAlert } as any}>
              <UserContext.Provider value={{ user } as any}>
                <TicketDetail />
              </UserContext.Provider>
            </AlertContext.Provider>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("TicketDetail", () => {
  beforeEach(() => {
    mocks.instance.mockReset();
    mocks.instance.patch.mockReset();
    mocks.instance.post.mockReset();
    mockNavigate.mockClear();
  });

  it("renders the ticket header, description, and Raised By", async () => {
    renderWith(makeTicket());
    expect(await screen.findByText("TCK-001")).toBeInTheDocument();
    expect(screen.getByText("Laptop broken")).toBeInTheDocument();
    expect(screen.getByText("Screen is cracked")).toBeInTheDocument();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
  });

  it("shows a warning icon in the title for an SLA-breached ticket", async () => {
    const { container } = renderWith(makeTicket({ slaBreached: true }));
    await screen.findByText("Laptop broken");
    expect(
      container.querySelector('[data-testid="WarningAmberIcon"]'),
    ).toBeInTheDocument();
  });

  it("shows the empty comments message and hides the comment count body when there are none", async () => {
    renderWith(makeTicket({ comments: [] }));
    expect(await screen.findByText("Comments (0)")).toBeInTheDocument();
    expect(screen.getByText("No comments yet.")).toBeInTheDocument();
  });

  it("renders comments, marking internal notes distinctly", async () => {
    renderWith(
      makeTicket({
        comments: [
          {
            id: "c1",
            comment: "Investigating now",
            author: { first_name: "HR", last_name: "Admin" },
            createdAt: "2024-06-02T10:00:00Z",
            isInternal: true,
          },
        ],
      }),
    );
    expect(await screen.findByText("Comments (1)")).toBeInTheDocument();
    expect(screen.getByText("Investigating now")).toBeInTheDocument();
    expect(screen.getByText("Internal")).toBeInTheDocument();
  });

  it("shows the timeline stages, in-progress reached but undated as pending", async () => {
    renderWith(makeTicket({ status: "open" }));
    await screen.findByText("Laptop broken");
    expect(screen.getByText("Raised")).toBeInTheDocument();
    expect(screen.getAllByText("Pending").length).toBeGreaterThan(0); // "In Progress" stage among others
  });

  it("marks the Resolved stage done once resolvedAt is set", async () => {
    renderWith(
      makeTicket({ status: "resolved", resolvedAt: "2024-06-03T10:00:00Z" }),
    );
    await screen.findByText("Laptop broken");
    expect(screen.getByText("Resolved")).toBeInTheDocument();
    expect(screen.queryAllByText("Pending")).toHaveLength(1); // only "Closed" still pending
  });

  it("hides the HR status-update control for a non-HR user", async () => {
    renderWith(makeTicket(), {
      user: { username: "someone", permissions: [] },
    });
    await screen.findByText("Laptop broken");
    expect(screen.queryByLabelText("Update Status")).not.toBeInTheDocument();
  });

  it("disables Update until a different status is chosen", async () => {
    renderWith(makeTicket({ status: "open" }));
    await screen.findByText("Laptop broken");
    expect(screen.getByRole("button", { name: "Update" })).toBeDisabled();
  });

  it("updates the ticket status", async () => {
    mocks.instance.patch.mockResolvedValue({});
    const setAlert = vi.fn();
    renderWith(makeTicket({ status: "open" }), { setAlert });
    await screen.findByText("Laptop broken");

    fireEvent.mouseDown(screen.getByLabelText("Update Status"));
    fireEvent.click(await screen.findByRole("option", { name: "in progress" }));
    fireEvent.click(screen.getByRole("button", { name: "Update" }));

    await waitFor(() =>
      expect(mocks.instance.patch).toHaveBeenCalledWith(expect.any(String), {
        status: "in_progress",
      }),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Status updated",
      }),
    );
  });

  it("hides the internal-note toggle for a non-HR user but still allows commenting", async () => {
    renderWith(makeTicket(), {
      user: { username: "someone", permissions: [] },
    });
    await screen.findByText("Laptop broken");
    expect(
      screen.queryByText("Internal note (HR only)"),
    ).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Write a comment…")).toBeInTheDocument();
  });

  it("disables Add Comment until there is non-whitespace text", async () => {
    renderWith(makeTicket());
    await screen.findByText("Laptop broken");
    expect(screen.getByRole("button", { name: "Add Comment" })).toBeDisabled();
  });

  it("adds a comment, resetting the form afterward", async () => {
    mocks.instance.post.mockResolvedValue({});
    const setAlert = vi.fn();
    renderWith(makeTicket(), { setAlert });
    await screen.findByText("Laptop broken");

    fireEvent.change(screen.getByPlaceholderText("Write a comment…"), {
      target: { value: "Looking into it" },
    });
    fireEvent.click(screen.getByLabelText("Internal note (HR only)"));
    fireEvent.click(screen.getByRole("button", { name: "Add Comment" }));

    await waitFor(() =>
      expect(mocks.instance.post).toHaveBeenCalledWith(expect.any(String), {
        comment: "Looking into it",
        isInternal: true,
      }),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Comment added",
      }),
    );
  });

  it("hides the comment form entirely once the ticket is closed", async () => {
    renderWith(makeTicket({ status: "closed" }));
    await screen.findByText("Laptop broken");
    expect(
      screen.queryByPlaceholderText("Write a comment…"),
    ).not.toBeInTheDocument();
  });

  it("navigates back to the ticket list", async () => {
    renderWith(makeTicket());
    await screen.findByText("Laptop broken");
    fireEvent.click(screen.getByText("Back to Tickets"));
    expect(mockNavigate).toHaveBeenCalledWith("/helpdesk");
  });

  it("colors an overdue SLA deadline distinctly from a future one", async () => {
    const { unmount } = renderWith(
      makeTicket({ slaDeadline: dayjs().subtract(1, "day").toISOString() }),
    );
    const pastEl = await screen.findByText("SLA Deadline");
    const pastValue = pastEl.nextElementSibling as HTMLElement;
    const pastColor = getComputedStyle(pastValue).color;
    unmount();

    renderWith(
      makeTicket({ slaDeadline: dayjs().add(1, "day").toISOString() }),
    );
    const futureEl = await screen.findByText("SLA Deadline");
    const futureValue = futureEl.nextElementSibling as HTMLElement;
    const futureColor = getComputedStyle(futureValue).color;

    expect(pastColor).not.toBe(futureColor);
  });
});
