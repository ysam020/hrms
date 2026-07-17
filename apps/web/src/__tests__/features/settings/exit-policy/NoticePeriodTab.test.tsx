import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NoticePeriodTab } from "@web/features/settings/exit-policy/NoticePeriodTab";
import apiClient from "@web/core/http/axiosConfig";

vi.mock("@web/core/http/axiosConfig", () => ({
  default: { post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));
const mockPost = apiClient.post as unknown as ReturnType<typeof vi.fn>;
const mockPut = apiClient.put as unknown as ReturnType<typeof vi.fn>;
const mockDelete = apiClient.delete as unknown as ReturnType<typeof vi.fn>;

function policy(overrides: Partial<any> = {}) {
  return {
    id: "p1",
    minTenureMonths: 0,
    maxTenureMonths: 12,
    designation: null,
    department: null,
    noticePeriodDays: 15,
    isProbationPolicy: true,
    priority: 0,
    ...overrides,
  };
}

function renderTab(
  policies: any[],
  canEdit = true,
  onRefetch = vi.fn(),
  setAlert = vi.fn(),
) {
  render(
    <NoticePeriodTab
      policies={policies}
      canEdit={canEdit}
      onRefetch={onRefetch}
      setAlert={setAlert}
    />,
  );
  return { onRefetch, setAlert };
}

describe("NoticePeriodTab", () => {
  beforeEach(() => {
    mockPost.mockReset();
    mockPut.mockReset();
    mockDelete.mockReset();
  });

  it("shows an info message about the 30-day default when there are no bands", () => {
    renderTab([]);
    expect(
      screen.getByText(/every resignation defaults to 30 days' notice/),
    ).toBeInTheDocument();
  });

  it("formats 'Applies to' as 'Everyone' when unscoped, and shows designation/department otherwise", () => {
    renderTab([
      policy({ id: "p1", designation: null, department: null }),
      policy({ id: "p2", designation: "Engineer", department: "Engineering" }),
    ]);
    expect(screen.getByText("Everyone")).toBeInTheDocument();
    expect(screen.getByText("Engineer · Engineering")).toBeInTheDocument();
  });

  it("formats the tenure range with a '+' for an open-ended upper bound", () => {
    renderTab([
      policy({ id: "p1", minTenureMonths: 12, maxTenureMonths: null }),
      policy({ id: "p2", minTenureMonths: 0, maxTenureMonths: 12 }),
    ]);
    expect(screen.getByText("12+ months")).toBeInTheDocument();
    expect(screen.getByText("0–12 months")).toBeInTheDocument();
  });

  it("shows a Probation chip only for probation policies", () => {
    renderTab([
      policy({ id: "p1", isProbationPolicy: true }),
      policy({ id: "p2", isProbationPolicy: false }),
    ]);
    expect(screen.getAllByText("Probation")).toHaveLength(1);
  });

  it("hides Add/Edit/Delete for a read-only user", () => {
    renderTab([policy()], false);
    expect(
      screen.queryByText("Add band", { selector: "span" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Edit")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Delete")).not.toBeInTheDocument();
  });

  it("creates a new band with the entered values", async () => {
    mockPost.mockResolvedValue({});
    const { onRefetch, setAlert } = renderTab([]);

    fireEvent.click(screen.getByText("Add band", { selector: "span" }));
    fireEvent.change(screen.getByLabelText("Min tenure"), {
      target: { value: "6" },
    });
    fireEvent.change(screen.getByLabelText("Notice period"), {
      target: { value: "45" },
    });
    fireEvent.change(screen.getByLabelText("Department (optional)"), {
      target: { value: "Sales" },
    });
    fireEvent.click(screen.getByText("Save", { selector: "span" }));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(
        "/notice-period-policies",
        expect.objectContaining({
          minTenureMonths: 6,
          noticePeriodDays: 45,
          department: "Sales",
        }),
      ),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Policy added.",
      }),
    );
    expect(onRefetch).toHaveBeenCalled();
  });

  it("edits an existing band, prefilling its values, and PUTs the update", async () => {
    mockPut.mockResolvedValue({});
    renderTab([policy({ id: "p1", noticePeriodDays: 15 })]);

    fireEvent.click(screen.getByLabelText("Edit"));
    expect(screen.getByLabelText("Notice period")).toHaveValue(15);

    fireEvent.change(screen.getByLabelText("Notice period"), {
      target: { value: "20" },
    });
    fireEvent.click(screen.getByText("Save", { selector: "span" }));

    await waitFor(() =>
      expect(mockPut).toHaveBeenCalledWith(
        "/notice-period-policies/p1",
        expect.objectContaining({ noticePeriodDays: 20 }),
      ),
    );
  });

  it("deletes a band through the confirmation dialog", async () => {
    mockDelete.mockResolvedValue({});
    const { setAlert } = renderTab([policy({ id: "p1" })]);

    fireEvent.click(screen.getByLabelText("Delete"));
    expect(screen.getByText("Delete notice period band?")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Confirm", { selector: "span" }));

    await waitFor(() =>
      expect(mockDelete).toHaveBeenCalledWith("/notice-period-policies/p1"),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({ severity: "info", message: "Policy deleted." }),
    );
  });
});
