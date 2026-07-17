import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import WFHRequests from "@web/features/wfh/WFHRequests";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import apiClient from "@web/core/http/axiosConfig";

const mocks = vi.hoisted(() => {
  const instance: any = vi.fn();
  instance.post = vi.fn();
  instance.patch = vi.fn();
  return { instance };
});
vi.mock("@web/core/http/axiosConfig", () => ({ default: mocks.instance }));
const mockApiClient = apiClient as unknown as ReturnType<typeof vi.fn> & {
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

vi.mock("primereact/calendar", () => ({
  Calendar: (props: any) => {
    const [start, end] = props.value ?? [null, null];
    return (
      <div>
        <input
          aria-label="Range start"
          value={start ? start.toISOString().slice(0, 10) : ""}
          onChange={(e) =>
            props.onChange({
              value: [
                e.target.value ? new Date(`${e.target.value}T00:00:00`) : null,
                end,
              ],
            })
          }
        />
        <input
          aria-label="Range end"
          value={end ? end.toISOString().slice(0, 10) : ""}
          onChange={(e) =>
            props.onChange({
              value: [
                start,
                e.target.value ? new Date(`${e.target.value}T00:00:00`) : null,
              ],
            })
          }
        />
      </div>
    );
  },
}));

function wfhRequest(overrides: Partial<any> = {}) {
  return {
    id: "w1",
    userId: "u2",
    employee: { first_name: "Jane", last_name: "Doe", username: "jdoe" },
    date: "2026-02-10",
    toDate: "2026-02-10",
    status: "Pending",
    reason: "Home repairs",
    ...overrides,
  };
}

function renderWith(
  records: any[],
  { user = { id: "u1", tenantRole: "employee" }, setAlert = vi.fn() } = {},
) {
  mockApiClient.mockResolvedValue({
    data: { data: { requests: records, total: records.length } },
  });
  return render(
    <UserContext.Provider value={{ user } as any}>
      <AlertContext.Provider value={{ setAlert } as any}>
        <WFHRequests />
      </AlertContext.Provider>
    </UserContext.Provider>,
  );
}

describe("WFHRequests", () => {
  beforeEach(() => {
    mockApiClient.mockReset();
    mockApiClient.post.mockReset();
    mockApiClient.patch.mockReset();
  });

  it("shows an empty state with no requests", async () => {
    renderWith([]);
    expect(
      await screen.findByText("No WFH requests found"),
    ).toBeInTheDocument();
  });

  it("shows the employee label, date range, status chip, and reason", async () => {
    renderWith([wfhRequest()]);
    expect(await screen.findByText("Jane Doe (jdoe)")).toBeInTheDocument();
    expect(screen.getAllByText("10 Feb 2026").length).toBe(2);
    expect(
      screen.getByText("Pending", { selector: "span.MuiChip-label" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Home repairs")).toBeInTheDocument();
  });

  it("hides Approve/Reject for a non-approver, but shows Cancel for their own request", async () => {
    renderWith([wfhRequest({ userId: "u1", status: "Pending" })], {
      user: { id: "u1", tenantRole: "employee", permissions: [] },
    });
    await screen.findByText("Jane Doe (jdoe)");
    expect(screen.queryByLabelText("Approve")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Cancel")).toBeInTheDocument();
  });

  it("shows Approve/Reject for an HR approver reviewing someone else's request", async () => {
    renderWith([wfhRequest({ userId: "u2", status: "Pending" })], {
      user: { id: "u1", tenantRole: "hr" },
    });
    await screen.findByText("Jane Doe (jdoe)");
    expect(screen.getByLabelText("Approve")).toBeInTheDocument();
    expect(screen.getByLabelText("Reject")).toBeInTheDocument();
  });

  it("hides Approve/Reject for a non-superuser approver reviewing their own request", async () => {
    renderWith([wfhRequest({ userId: "u1", status: "Pending" })], {
      user: { id: "u1", tenantRole: "hr", isSuperUser: false },
    });
    await screen.findByText("Jane Doe (jdoe)");
    expect(screen.queryByLabelText("Approve")).not.toBeInTheDocument();
  });

  it("allows a superuser to approve/reject even their own request", async () => {
    renderWith([wfhRequest({ userId: "u1", status: "Pending" })], {
      user: { id: "u1", tenantRole: "employee", isSuperUser: true },
    });
    await screen.findByText("Jane Doe (jdoe)");
    expect(screen.getByLabelText("Approve")).toBeInTheDocument();
  });

  it("hides all row actions once a request is no longer Pending", async () => {
    renderWith([wfhRequest({ userId: "u1", status: "Approved" })], {
      user: { id: "u1", tenantRole: "hr", isSuperUser: true },
    });
    await screen.findByText("Jane Doe (jdoe)");
    expect(screen.queryByLabelText("Approve")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Cancel")).not.toBeInTheDocument();
  });

  it("approves a request through the confirmation dialog", async () => {
    mockApiClient.patch.mockResolvedValue({});
    const { setAlert } = renderWith(
      [wfhRequest({ userId: "u2" })] as any,
      {
        user: { id: "u1", tenantRole: "hr" },
        setAlert: vi.fn(),
      } as any,
    );
    await screen.findByText("Jane Doe (jdoe)");

    fireEvent.click(screen.getByLabelText("Approve"));
    expect(
      screen.getByText(
        /Are you sure you want to approve the WFH request for Jane Doe\?/,
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText("Approve", { selector: "span" }));

    await waitFor(() =>
      expect(mockApiClient.patch).toHaveBeenCalledWith("/wfh/requests/status", {
        requestId: "w1",
        action: "approve",
      }),
    );
  });

  it("submits a single-day WFH request when only a start date is picked", async () => {
    mockApiClient.post.mockResolvedValue({});
    renderWith([]);
    await screen.findByText("No WFH requests found");

    fireEvent.click(screen.getByRole("button", { name: "Request WFH" }));
    fireEvent.change(screen.getByLabelText("Reason (optional)"), {
      target: { value: "Plumber visit" },
    });
    fireEvent.click(screen.getByText("Submit", { selector: "span" }));

    await waitFor(() =>
      expect(mockApiClient.post).toHaveBeenCalledWith(
        "/wfh/requests",
        expect.objectContaining({ reason: "Plumber visit" }),
      ),
    );
    const payload = mockApiClient.post.mock.calls[0][1];
    expect(payload.date).toBe(payload.toDate);
  });

  it("submits a multi-day WFH request with a distinct end date", async () => {
    mockApiClient.post.mockResolvedValue({});
    renderWith([]);
    await screen.findByText("No WFH requests found");

    fireEvent.click(screen.getByRole("button", { name: "Request WFH" }));
    fireEvent.change(screen.getByLabelText("Range end"), {
      target: { value: "2026-03-05" },
    });
    fireEvent.click(screen.getByText("Submit", { selector: "span" }));

    await waitFor(() =>
      expect(mockApiClient.post).toHaveBeenCalledWith(
        "/wfh/requests",
        expect.objectContaining({ toDate: "2026-03-05" }),
      ),
    );
  });

  it("refetches with the status filter applied when the status dropdown changes", async () => {
    renderWith([wfhRequest()], { user: { id: "u1", tenantRole: "hr" } });
    await screen.findByText("Jane Doe (jdoe)");
    mockApiClient.mockClear();

    fireEvent.change(screen.getByLabelText("Select Status"), {
      target: { value: "Approved" },
    });

    await waitFor(() =>
      expect(mockApiClient).toHaveBeenCalledWith(
        expect.stringContaining("status=Approved"),
      ),
    );
  });
});
