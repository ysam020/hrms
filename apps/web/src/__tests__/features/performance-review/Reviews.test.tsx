import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import Reviews from "@web/features/performance-review/Reviews";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import apiClient from "@web/core/http/axiosConfig";

const mocks = vi.hoisted(() => {
  const instance: any = vi.fn();
  instance.post = vi.fn();
  instance.put = vi.fn();
  return { instance };
});
vi.mock("@web/core/http/axiosConfig", () => ({ default: mocks.instance }));
const mockApiClient = apiClient as unknown as ReturnType<typeof vi.fn> & {
  post: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
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

vi.mock("primereact/calendar", () => ({
  Calendar: (props: any) => (
    <input
      id={props.inputId}
      aria-label={props.inputId}
      value={
        props.value ? new Date(props.value).toISOString().slice(0, 10) : ""
      }
      onChange={(e) =>
        props.onChange({
          value: e.target.value ? new Date(`${e.target.value}T00:00:00`) : null,
        })
      }
    />
  ),
}));

function review(overrides: Partial<any> = {}) {
  return {
    id: "r1",
    userId: "u1",
    reviewerId: "mgr1",
    cycleId: "c1",
    status: "draft",
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function setupApi({
  mine = [],
  reviewed = [],
  cycles = [{ id: "c1", name: "H1 2026 Review" }],
  users = [{ id: "u1", firstName: "Jane", lastName: "Doe" }],
  pending = [],
}: {
  mine?: any[];
  reviewed?: any[];
  cycles?: any[];
  users?: any[];
  pending?: any[];
} = {}) {
  mockApiClient.mockImplementation((url: string) => {
    if (url.startsWith("/performance-reviews?userId="))
      return Promise.resolve({ data: { data: mine } });
    if (url.startsWith("/performance-reviews?reviewerId="))
      return Promise.resolve({ data: { data: reviewed } });
    if (url.startsWith("/performance-reviews/cycles"))
      return Promise.resolve({ data: { data: cycles } });
    if (url.startsWith("/get-all-users"))
      return Promise.resolve({ data: { data: users } });
    if (url === "/approvals/pending")
      return Promise.resolve({ data: { data: pending } });
    return Promise.resolve({ data: { data: [] } });
  });
}

function renderReviews({ user = { id: "u1" }, setAlert = vi.fn() } = {}) {
  render(
    <UserContext.Provider value={{ user } as any}>
      <AlertContext.Provider value={{ setAlert } as any}>
        <Reviews />
      </AlertContext.Provider>
    </UserContext.Provider>,
  );
  return { setAlert };
}

describe("Reviews", () => {
  beforeEach(() => {
    mockApiClient.mockReset();
    mockApiClient.post.mockReset();
    mockApiClient.put.mockReset();
  });

  it("shows an empty state when there are no reviews", async () => {
    setupApi();
    renderReviews();
    expect(
      await screen.findByText(
        "No reviews yet — a review appears here once HR starts a review cycle that includes you",
      ),
    ).toBeInTheDocument();
  });

  it("merges own and team reviews, deduplicated by id, most recent first", async () => {
    setupApi({
      mine: [review({ id: "r1", createdAt: "2026-01-01T00:00:00Z" })],
      reviewed: [
        review({ id: "r1", createdAt: "2026-01-01T00:00:00Z" }),
        review({ id: "r2", userId: "u2", createdAt: "2026-03-01T00:00:00Z" }),
      ],
      users: [
        { id: "u1", firstName: "Jane", lastName: "Doe" },
        { id: "u2", firstName: "Alex", lastName: "Smith" },
      ],
    });
    renderReviews();

    const rows = await screen.findAllByText(/You|Alex Smith/);
    // r2 (Mar) sorts before r1 (Jan) — most-recent-first.
    expect(rows[0]).toHaveTextContent("Alex Smith");
    expect(rows[1]).toHaveTextContent("You");
  });

  it("shows the employee's name for someone else's review, and 'You' for the current user's own", async () => {
    setupApi({
      mine: [review({ id: "r1", userId: "u1" })],
      users: [{ id: "u1", firstName: "Jane", lastName: "Doe" }],
    });
    renderReviews();
    expect(await screen.findByText("You")).toBeInTheDocument();
  });

  it("opens the review detail dialog with the timeline and cycle/employee header on row click", async () => {
    setupApi({ mine: [review()] });
    renderReviews();
    fireEvent.click(await screen.findByText("You"));

    expect(screen.getByText("H1 2026 Review — You")).toBeInTheDocument();
    expect(screen.getByText("Cycle Started")).toBeInTheDocument();
    expect(
      screen.getByText("Self-Assessment Submitted", { selector: "p" }),
    ).toBeInTheDocument();
  });

  it("shows the self-assessment form only for the review's own owner while it's still a draft, and submits it", async () => {
    setupApi({ mine: [review({ userId: "u1", status: "draft" })] });
    mockApiClient.post.mockResolvedValue({});
    const { setAlert } = renderReviews({ user: { id: "u1" } });
    fireEvent.click(await screen.findByText("You"));

    const submitBtn = screen
      .getByText("Submit Self-Assessment", { selector: "span" })
      .closest("button")!;
    expect(submitBtn).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Self Rating"), {
      target: { value: "4" },
    });
    expect(submitBtn).not.toBeDisabled();

    fireEvent.change(screen.getByLabelText("Comments"), {
      target: { value: "Did well this cycle" },
    });
    fireEvent.click(submitBtn);

    await waitFor(() =>
      expect(mockApiClient.post).toHaveBeenCalledWith(
        "/performance-reviews/r1/self-assessment",
        { selfComments: "Did well this cycle", selfRating: 4 },
      ),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Self-assessment submitted",
      }),
    );
  });

  it("hides the self-assessment form for someone reviewing another person's draft review", async () => {
    setupApi({
      reviewed: [review({ userId: "u2", status: "draft" })],
      users: [{ id: "u2", firstName: "Alex", lastName: "Smith" }],
    });
    renderReviews({ user: { id: "mgr1" } });
    fireEvent.click(await screen.findByText("Alex Smith"));
    expect(
      screen.queryByText("Submit Self-Assessment"),
    ).not.toBeInTheDocument();
  });

  it("shows the manager review form only for the assigned reviewer once self-assessment is submitted, and submits it", async () => {
    setupApi({
      reviewed: [
        review({ status: "self_assessment_submitted", reviewerId: "mgr1" }),
      ],
    });
    mockApiClient.post.mockResolvedValue({});
    renderReviews({ user: { id: "mgr1" } });
    fireEvent.click(await screen.findByText("Jane Doe"));

    const submitBtn = screen
      .getByText("Submit Manager Review", { selector: "span" })
      .closest("button")!;
    expect(submitBtn).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Manager Rating"), {
      target: { value: "4" },
    });
    expect(submitBtn).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Overall Rating"), {
      target: { value: "4" },
    });
    expect(submitBtn).not.toBeDisabled();

    fireEvent.click(submitBtn);

    await waitFor(() =>
      expect(mockApiClient.post).toHaveBeenCalledWith(
        "/performance-reviews/r1/manager-review",
        expect.objectContaining({ managerRating: 4, overallRating: 4 }),
      ),
    );
    // Optional fields omitted entirely when left blank.
    const payload = mockApiClient.post.mock.calls[0][1];
    expect(payload).not.toHaveProperty("recommendedIncrementPct");
    expect(payload).not.toHaveProperty("effectiveFrom");
  });

  it("includes the optional increment and effective-from fields when provided", async () => {
    setupApi({
      reviewed: [
        review({ status: "self_assessment_submitted", reviewerId: "mgr1" }),
      ],
    });
    mockApiClient.post.mockResolvedValue({});
    renderReviews({ user: { id: "mgr1" } });
    fireEvent.click(await screen.findByText("Jane Doe"));

    fireEvent.change(screen.getByLabelText("Manager Rating"), {
      target: { value: "4" },
    });
    fireEvent.change(screen.getByLabelText("Overall Rating"), {
      target: { value: "4" },
    });
    fireEvent.change(screen.getByLabelText("Recommended Increment (%)"), {
      target: { value: "10" },
    });
    fireEvent.change(screen.getByLabelText("effectiveFrom"), {
      target: { value: "2026-04-01" },
    });
    fireEvent.click(
      screen.getByText("Submit Manager Review", { selector: "span" }),
    );

    await waitFor(() =>
      expect(mockApiClient.post).toHaveBeenCalledWith(
        "/performance-reviews/r1/manager-review",
        expect.objectContaining({
          recommendedIncrementPct: 10,
          effectiveFrom: "2026-04-01",
        }),
      ),
    );
  });

  it("shows approve/reject only when the review is pending this user's approval, and acts on it", async () => {
    setupApi({
      mine: [review({ status: "manager_review_submitted" })],
      pending: [
        { module: "performance_review", entityId: "r1", instanceId: "inst1" },
      ],
    });
    mockApiClient.put.mockResolvedValue({});
    const { setAlert } = renderReviews({ user: { id: "u1" } });
    fireEvent.click(await screen.findByText("You"));

    expect(
      screen.getByText("Your approval is needed for this review"),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Comment (optional)"), {
      target: { value: "Looks good" },
    });
    fireEvent.click(screen.getByText("Approve", { selector: "span" }));

    await waitFor(() =>
      expect(mockApiClient.put).toHaveBeenCalledWith("/approvals/inst1/act", {
        decision: "approved",
        comment: "Looks good",
      }),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Review approved",
      }),
    );
  });

  it("hides approve/reject when the review has no pending approval instance for this user", async () => {
    setupApi({
      mine: [review({ status: "manager_review_submitted" })],
      pending: [],
    });
    renderReviews({ user: { id: "u1" } });
    fireEvent.click(await screen.findByText("You"));
    expect(
      screen.queryByText("Your approval is needed for this review"),
    ).not.toBeInTheDocument();
  });

  it("refetches with the status filter applied when the status dropdown changes", async () => {
    setupApi({ mine: [review()] });
    renderReviews();
    await screen.findByText("You");
    mockApiClient.mockClear();

    fireEvent.change(screen.getByLabelText("Select Status"), {
      target: { value: "approved" },
    });

    await waitFor(() =>
      expect(mockApiClient).toHaveBeenCalledWith(
        expect.stringContaining("status=approved"),
      ),
    );
  });
});
