import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ExitManagementDialog from "@web/features/resignation/ExitManagementDialog";
import { AlertContext } from "@web/app/providers/AlertContext";
import apiClient from "@web/core/http/axiosConfig";

vi.mock("@web/core/http/axiosConfig", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
}));
const mockGet = apiClient.get as unknown as ReturnType<typeof vi.fn>;
const mockPost = apiClient.post as unknown as ReturnType<typeof vi.fn>;
const mockPut = apiClient.put as unknown as ReturnType<typeof vi.fn>;

const CHECKLIST = [
  {
    itemDefId: "c1",
    label: "Return laptop",
    owningRole: "IT",
    isRequired: true,
    isComplete: false,
    notes: null,
  },
];
const NOTICE_EVENTS = [
  {
    id: "n1",
    previousLastWorkingDay: "2024-06-01",
    newLastWorkingDay: "2024-06-15",
    reason: "Extended for handover",
    createdAt: "2024-05-20T10:00:00Z",
  },
];
const SETTLEMENT = {
  id: "s1",
  lineItems: [
    { label: "Unpaid salary", type: "earning", amount: 50000 },
    { label: "Notice period recovery", type: "deduction", amount: 10000 },
  ],
  netPayable: 40000,
  status: "draft",
};

function renderDialog(
  props: Partial<React.ComponentProps<typeof ExitManagementDialog>> = {},
  setAlert = vi.fn(),
) {
  const onClose = vi.fn();
  render(
    <AlertContext.Provider value={{ setAlert } as any}>
      <ExitManagementDialog
        open={true}
        resignationId="r1"
        employeeName="Jane Doe"
        canManage={true}
        onClose={onClose}
        {...props}
      />
    </AlertContext.Provider>,
  );
  return { onClose, setAlert };
}

describe("ExitManagementDialog", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
    mockPut.mockReset();
    // Real settlement GET returns null (no settlement computed yet), not [] —
    // SettlementTab treats a truthy-but-shapeless value as a real settlement
    // and crashes on `.lineItems`, so this must not default to [].
    mockGet.mockImplementation((url: string) =>
      url.includes("fnf-settlement") || url.includes("settlement")
        ? Promise.resolve({ data: { data: null } })
        : Promise.resolve({ data: { data: [] } }),
    );
  });

  it("renders nothing when closed", () => {
    renderDialog({ open: false });
    expect(screen.queryByText(/Manage exit/)).not.toBeInTheDocument();
  });

  it("shows the employee name in the title and fetches checklist/events/settlement in parallel", async () => {
    mockGet.mockResolvedValueOnce({ data: { data: CHECKLIST } });
    renderDialog();
    expect(screen.getByText("Manage exit — Jane Doe")).toBeInTheDocument();
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(3));
  });

  it("only shows the Feedback tab for a viewer without manage access, and skips fetching", () => {
    renderDialog({ canManage: false });
    expect(screen.getByText("Feedback")).toBeInTheDocument();
    expect(screen.queryByText("Checklist")).not.toBeInTheDocument();
    expect(screen.queryByText("Final Settlement")).not.toBeInTheDocument();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("renders feedback details on the default tab", async () => {
    renderDialog({
      overallJobSatisfaction: 4,
      reason: "Better opportunity",
      suggestions: "More WFH flexibility",
    });
    expect(await screen.findByText("4/5")).toBeInTheDocument();
    expect(screen.getByText("Better opportunity")).toBeInTheDocument();
    expect(screen.getByText("More WFH flexibility")).toBeInTheDocument();
  });

  it("shows 'Not provided' placeholders for missing feedback fields", async () => {
    renderDialog({});
    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(screen.getAllByText("Not provided").length).toBeGreaterThan(0);
  });

  it("toggles a checklist item and calls the update endpoint", async () => {
    mockGet.mockImplementation((url: string) =>
      url.includes("checklist")
        ? Promise.resolve({ data: { data: CHECKLIST } })
        : Promise.resolve({ data: { data: [] } }),
    );
    mockPut.mockResolvedValue({});
    renderDialog();
    fireEvent.click(await screen.findByText("Checklist"));
    const checkbox = await screen.findByRole("checkbox");

    fireEvent.click(checkbox);

    await waitFor(() =>
      expect(mockPut).toHaveBeenCalledWith(expect.any(String), {
        isComplete: true,
      }),
    );
    expect(checkbox).toBeChecked();
  });

  it("shows the empty-checklist guidance message when nothing is configured", async () => {
    renderDialog();
    fireEvent.click(await screen.findByText("Checklist"));
    expect(
      await screen.findByText(/No exit checklist configured yet/),
    ).toBeInTheDocument();
  });

  it("computes a settlement and renders the line items and net payable", async () => {
    mockPost.mockResolvedValue({ data: { data: SETTLEMENT } });
    renderDialog();
    fireEvent.click(await screen.findByText("Final Settlement"));
    fireEvent.click(screen.getByText("Compute settlement"));

    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(screen.getByText("Unpaid salary")).toBeInTheDocument();
    expect(screen.getByText("-₹10000.00")).toBeInTheDocument();
    expect(screen.getByText("₹40000.00")).toBeInTheDocument();
    expect(screen.getByText("Approve settlement")).toBeInTheDocument();
  });

  it("approves a draft settlement after confirmation", async () => {
    mockPost.mockResolvedValue({ data: { data: SETTLEMENT } });
    mockPut.mockResolvedValue({
      data: { data: { ...SETTLEMENT, status: "approved" } },
    });
    renderDialog();
    fireEvent.click(await screen.findByText("Final Settlement"));
    fireEvent.click(screen.getByText("Compute settlement"));
    await screen.findByText("Approve settlement");

    fireEvent.click(screen.getByText("Approve settlement"));
    expect(
      screen.getByText(
        "Are you sure you want to approve this full and final settlement?",
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText("Approve", { selector: "span" }));

    await waitFor(() => expect(mockPut).toHaveBeenCalled());
  });

  it("does not offer Approve once the settlement is already approved", async () => {
    mockPost.mockResolvedValue({
      data: { data: { ...SETTLEMENT, status: "approved" } },
    });
    renderDialog();
    fireEvent.click(await screen.findByText("Final Settlement"));
    fireEvent.click(screen.getByText("Compute settlement"));

    await screen.findByText("Unpaid salary");
    expect(screen.queryByText("Approve settlement")).not.toBeInTheDocument();
  });

  it("renders notice-renegotiation history and submits a new last working day", async () => {
    mockGet.mockImplementation((url: string) =>
      url.includes("notice-events") || url.includes("notice")
        ? Promise.resolve({ data: { data: NOTICE_EVENTS } })
        : Promise.resolve({ data: { data: [] } }),
    );
    mockPut.mockResolvedValue({});
    renderDialog();
    fireEvent.click(await screen.findByText("Notice History"));
    expect(
      await screen.findByText(/Extended for handover/),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("New last working day"), {
      target: { value: "2024-07-01" },
    });
    fireEvent.click(screen.getByText("Update"));

    await waitFor(() =>
      expect(mockPut).toHaveBeenCalledWith(expect.any(String), {
        newLastWorkingDay: "2024-07-01",
        reason: undefined,
      }),
    );
  });

  it("keeps the renegotiate Update button disabled until a date is chosen", async () => {
    renderDialog();
    fireEvent.click(await screen.findByText("Notice History"));
    expect(screen.getByRole("button", { name: "Update" })).toBeDisabled();
  });

  it("toggles rehire eligibility", async () => {
    mockPut.mockResolvedValue({});
    renderDialog({ rehireEligible: false });
    fireEvent.click(await screen.findByText("Rehire"));
    const toggle = screen.getByRole("checkbox");
    expect(toggle).not.toBeChecked();

    fireEvent.click(toggle);

    await waitFor(() =>
      expect(mockPut).toHaveBeenCalledWith(expect.any(String), {
        rehireEligible: true,
      }),
    );
    expect(toggle).toBeChecked();
  });

  it("closes via the Close button", async () => {
    const { onClose } = renderDialog();
    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    fireEvent.click(screen.getByText("Close", { selector: "span" }));
    expect(onClose).toHaveBeenCalled();
  });
});
