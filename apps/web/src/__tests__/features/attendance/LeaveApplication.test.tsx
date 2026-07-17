import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import LeaveApplication from "@web/features/attendance/LeaveApplication";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import useFetchData from "@web/shared/hooks/useFetchData";
import apiClient from "@web/core/http/axiosConfig";

vi.mock("@web/shared/hooks/useFetchData");
const mockUseFetchData = useFetchData as unknown as ReturnType<typeof vi.fn>;

vi.mock("@web/core/http/axiosConfig", () => ({ default: { post: vi.fn() } }));
const mockPost = apiClient.post as unknown as ReturnType<typeof vi.fn>;

vi.mock("primereact/dropdown", () => ({
  Dropdown: (props: any) => (
    <select
      aria-label={props.placeholder}
      value={props.value ?? ""}
      onChange={(e) => props.onChange({ target: { value: e.target.value } })}
    >
      <option value="">-- select --</option>
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
      type="text"
      aria-label={props.placeholder}
      value={props.value ? props.value.toISOString().slice(0, 10) : ""}
      onChange={(e) =>
        props.onChange({
          value: e.target.value ? new Date(`${e.target.value}T00:00:00`) : null,
        })
      }
    />
  ),
}));

vi.mock("@web/shared/components/FileUploadWrapper", () => ({
  default: (props: any) => <div>FileUploadWrapper for {props.name}</div>,
}));

function mockFetch({
  balances,
  orgSettings,
}: { balances?: any; orgSettings?: any } = {}) {
  mockUseFetchData.mockImplementation((uri: string | null) => {
    if (uri === "/get-available-paid-leaves") {
      return {
        data: balances ?? {},
        loading: false,
        error: null,
        refetch: vi.fn(),
      };
    }
    return {
      data: orgSettings ?? {},
      loading: false,
      error: null,
      refetch: vi.fn(),
    };
  });
}

function renderWith({
  onSuccess = vi.fn(),
  setAlert = vi.fn(),
  user = { username: "jdoe" },
} = {}) {
  return render(
    <AlertContext.Provider value={{ setAlert } as any}>
      <UserContext.Provider value={{ user } as any}>
        <LeaveApplication onSuccess={onSuccess} />
      </UserContext.Provider>
    </AlertContext.Provider>,
  );
}

function fillReason(text: string) {
  fireEvent.change(
    screen.getByPlaceholderText("Reason for leave (min 5 characters)"),
    {
      target: { value: text },
    },
  );
}

function fillFromDate(dateStr: string) {
  fireEvent.change(screen.getByLabelText("Start Date"), {
    target: { value: dateStr },
  });
}

describe("LeaveApplication", () => {
  beforeEach(() => mockPost.mockReset());

  it("shows a placeholder chip when there are no leave balances", () => {
    mockFetch({ balances: {} });
    renderWith();
    expect(screen.getByText("0 leave(s) available")).toBeInTheDocument();
  });

  it("renders a chip per leave-type balance parsed from the balances JSON string", () => {
    mockFetch({
      balances: {
        balances: JSON.stringify({ PL: { name: "Paid Leave", remaining: 5 } }),
      },
    });
    renderWith();
    expect(screen.getByText("Paid Leave: 5")).toBeInTheDocument();
  });

  it("falls back to the empty state when the balances JSON is malformed", () => {
    mockFetch({ balances: { balances: "{not json" } });
    renderWith();
    expect(screen.getByText("0 leave(s) available")).toBeInTheDocument();
  });

  it("includes statutory and custom leave types, deduped, in the leave-type dropdown", () => {
    mockFetch({
      orgSettings: {
        active: {
          customLeaveTypes: [
            { key: "PL", name: "Should Not Duplicate" },
            { key: "COMP", name: "Comp Time" },
          ],
          leavePolicies: [
            { key: "BEREAVEMENT", name: "Bereavement", isCompOff: false },
          ],
        },
      },
    });
    renderWith();
    const leaveTypeSelect = screen.getByLabelText(
      "Leave Type",
    ) as HTMLSelectElement;
    const labels = Array.from(leaveTypeSelect.options).map(
      (o) => o.textContent,
    );
    expect(labels).toContain("Paid Leave");
    expect(labels).toContain("Sick Leave");
    expect(labels).toContain("Maternity Leave");
    expect(labels).toContain("Comp Time");
    expect(labels).toContain("Bereavement");
    expect(labels).toContain("Leave Without Pay");
    expect(labels.filter((l) => l === "Paid Leave")).toHaveLength(1);
  });

  it("shows an End Date field for a full-day request by default", () => {
    mockFetch();
    renderWith();
    expect(screen.getByLabelText("End Date")).toBeInTheDocument();
  });

  it("replaces End Date with a 'first/second half' picker for a half-day request", () => {
    mockFetch();
    renderWith();
    fireEvent.change(screen.getByLabelText("Unit"), {
      target: { value: "half_day" },
    });

    expect(screen.queryByLabelText("End Date")).not.toBeInTheDocument();
    expect(screen.getByText("Same day as Start Date")).toBeInTheDocument();
    expect(screen.getByLabelText("Which half?")).toBeInTheDocument();
  });

  it("shows an Hours field for a short-leave request", () => {
    mockFetch();
    renderWith();
    fireEvent.change(screen.getByLabelText("Unit"), {
      target: { value: "short_leave" },
    });
    expect(screen.getByLabelText("Hours")).toBeInTheDocument();
  });

  it("shows a live character counter for the reason field", () => {
    mockFetch();
    renderWith();
    fillReason("Family");
    expect(screen.getByText("6 characters")).toBeInTheDocument();
  });

  it("reveals the medical-certificate upload only once 'sick leave' is checked", () => {
    mockFetch();
    renderWith();
    expect(screen.queryByText(/FileUploadWrapper/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("This is a sick leave"));
    expect(
      screen.getByText("FileUploadWrapper for medicalCertificate"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("This is a sick leave"));
    expect(screen.queryByText(/FileUploadWrapper/)).not.toBeInTheDocument();
  });

  it("submits a valid full-day leave request and shows a success alert", async () => {
    mockPost.mockResolvedValue({ data: { message: "Leave applied" } });
    mockFetch();
    const setAlert = vi.fn();
    const onSuccess = vi.fn();
    renderWith({ setAlert, onSuccess });

    fillFromDate("2099-06-10");
    fireEvent.change(screen.getByLabelText("End Date"), {
      target: { value: "2099-06-12" },
    });
    fillReason("Family trip");
    fireEvent.change(screen.getByLabelText("Leave Type"), {
      target: { value: "PL" },
    });

    fireEvent.click(screen.getByText("Submit Application"));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          from: "2099-06-10",
          to: "2099-06-12",
          reason: "Family trip",
          leaveType: "PL",
        }),
      ),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Leave applied",
      }),
    );
    expect(onSuccess).toHaveBeenCalled();
  });
});
