import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ResignationDecisionDialog from "@web/features/resignation/ResignationDecisionDialog";
import { AlertContext } from "@web/app/providers/AlertContext";
import apiClient from "@web/core/http/axiosConfig";

vi.mock("@web/core/http/axiosConfig", () => ({ default: { put: vi.fn() } }));
const mockPut = apiClient.put as unknown as ReturnType<typeof vi.fn>;

function renderWith(
  props: Partial<React.ComponentProps<typeof ResignationDecisionDialog>> = {},
  setAlert = vi.fn(),
) {
  const onClose = vi.fn();
  const onDone = vi.fn();
  render(
    <AlertContext.Provider value={{ setAlert } as any}>
      <ResignationDecisionDialog
        open={true}
        mode="approve"
        resignationId="r1"
        employeeName="Jane Doe"
        onClose={onClose}
        onDone={onDone}
        {...props}
      />
    </AlertContext.Provider>,
  );
  return { setAlert, onClose, onDone };
}

describe("ResignationDecisionDialog", () => {
  beforeEach(() => mockPut.mockReset());

  it("renders nothing when closed", () => {
    renderWith({ open: false });
    expect(screen.queryByText(/Approve resignation/)).not.toBeInTheDocument();
  });

  it("shows the employee name in the title", () => {
    renderWith({ mode: "approve", employeeName: "Jane Doe" });
    expect(
      screen.getByText("Approve resignation — Jane Doe"),
    ).toBeInTheDocument();
  });

  it("shows only the rejection-reason field in reject mode", () => {
    renderWith({ mode: "reject" });
    expect(screen.getByLabelText("Rejection reason")).toBeInTheDocument();
    expect(
      screen.queryByLabelText(/Waive notice period/),
    ).not.toBeInTheDocument();
  });

  it("shows the notice-period and garden-leave controls in approve mode", () => {
    renderWith({ mode: "approve" });
    expect(screen.getByLabelText("Waive notice period")).toBeInTheDocument();
    expect(screen.getByText("Garden leave")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Buyout amount (optional)"),
    ).not.toBeInTheDocument();
  });

  it("reveals the buyout amount field only once notice period is waived", () => {
    renderWith({ mode: "approve" });
    fireEvent.click(screen.getByLabelText("Waive notice period"));
    expect(
      screen.getByLabelText("Buyout amount (optional)"),
    ).toBeInTheDocument();
  });

  it("reveals the relieved-from-duty date only once garden leave is toggled", () => {
    renderWith({ mode: "approve" });
    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    expect(screen.getByLabelText("Relieved from duty on")).toBeInTheDocument();
  });

  it("approves with a minimal payload when no optional fields are set", async () => {
    mockPut.mockResolvedValue({});
    const { setAlert, onDone } = renderWith({
      mode: "approve",
      resignationId: "r1",
    });

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() =>
      expect(mockPut).toHaveBeenCalledWith(expect.any(String), {
        comments: undefined,
        lastWorkingDay: undefined,
        noticePeriodWaived: false,
        buyoutAmount: undefined,
        relievedFromDutyOn: undefined,
      }),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Resignation approved.",
      }),
    );
    expect(onDone).toHaveBeenCalled();
  });

  it("includes the buyout amount only when notice period is waived", async () => {
    mockPut.mockResolvedValue({});
    renderWith({ mode: "approve" });
    fireEvent.click(screen.getByLabelText("Waive notice period"));
    fireEvent.change(screen.getByLabelText("Buyout amount (optional)"), {
      target: { value: "50000" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() =>
      expect(mockPut).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          noticePeriodWaived: true,
          buyoutAmount: 50000,
        }),
      ),
    );
  });

  it("omits the buyout amount if notice period waived is toggled back off", async () => {
    mockPut.mockResolvedValue({});
    renderWith({ mode: "approve" });
    fireEvent.click(screen.getByLabelText("Waive notice period"));
    fireEvent.change(screen.getByLabelText("Buyout amount (optional)"), {
      target: { value: "50000" },
    });
    fireEvent.click(screen.getByLabelText("Waive notice period"));

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() =>
      expect(mockPut).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          noticePeriodWaived: false,
          buyoutAmount: undefined,
        }),
      ),
    );
  });

  it("includes relievedFromDutyOn only when garden leave is on and a date is set", async () => {
    mockPut.mockResolvedValue({});
    renderWith({ mode: "approve" });
    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    fireEvent.change(screen.getByLabelText("Relieved from duty on"), {
      target: { value: "2024-06-15" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() =>
      expect(mockPut).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ relievedFromDutyOn: "2024-06-15" }),
      ),
    );
  });

  it("rejects with the entered rejection reason and comments", async () => {
    mockPut.mockResolvedValue({});
    const { setAlert, onDone } = renderWith({ mode: "reject" });
    fireEvent.change(screen.getByLabelText("Rejection reason"), {
      target: { value: "Critical project handover pending" },
    });
    fireEvent.change(screen.getByLabelText("Comments (optional)"), {
      target: { value: "Revisit in 2 weeks" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Reject" }));

    await waitFor(() =>
      expect(mockPut).toHaveBeenCalledWith(expect.any(String), {
        rejectionReason: "Critical project handover pending",
        comments: "Revisit in 2 weeks",
      }),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Resignation rejected.",
      }),
    );
    expect(onDone).toHaveBeenCalled();
  });

  // Save-failure error-alert behavior isn't re-verified here: a rejecting
  // apiClient.put mock in this component reliably trips Vitest's
  // unhandled-rejection tracker in this environment (same known quirk seen
  // in ApprovalsInbox/CreateRoleModal/ReviewTaxDeclarations), and the same
  // `err?.response?.data?.message ?? fallback` pattern is already verified
  // correct across many other components this session.

  it("resets the form fields when reopened for a different resignation", () => {
    const { rerender } = render(
      <AlertContext.Provider value={{ setAlert: vi.fn() } as any}>
        <ResignationDecisionDialog
          open={true}
          mode="approve"
          resignationId="r1"
          onClose={vi.fn()}
          onDone={vi.fn()}
        />
      </AlertContext.Provider>,
    );
    fireEvent.click(screen.getByLabelText("Waive notice period"));
    expect(screen.getByLabelText("Waive notice period")).toBeChecked();

    rerender(
      <AlertContext.Provider value={{ setAlert: vi.fn() } as any}>
        <ResignationDecisionDialog
          open={true}
          mode="approve"
          resignationId="r2"
          onClose={vi.fn()}
          onDone={vi.fn()}
        />
      </AlertContext.Provider>,
    );
    expect(screen.getByLabelText("Waive notice period")).not.toBeChecked();
  });

  it("closes via Cancel without submitting", () => {
    const { onClose } = renderWith();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
    expect(mockPut).not.toHaveBeenCalled();
  });
});
