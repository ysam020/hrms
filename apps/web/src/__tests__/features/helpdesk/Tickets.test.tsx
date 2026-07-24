import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import dayjs from "dayjs";
import Tickets from "@web/features/helpdesk/Tickets";
import { AlertContext } from "@web/app/providers/AlertContext";
import apiClient from "@web/core/http/axiosConfig";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

const mocks = vi.hoisted(() => {
  const instance: any = vi.fn();
  instance.post = vi.fn();
  return { instance };
});
vi.mock("@web/core/http/axiosConfig", () => ({ default: mocks.instance }));
const mockApiClient = apiClient as unknown as ReturnType<typeof vi.fn> & {
  post: ReturnType<typeof vi.fn>;
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

function makeTicket(overrides: Partial<any> = {}) {
  return {
    id: "t1",
    ticketNo: "TCK-001",
    title: "Laptop broken",
    category: "IT",
    priority: "high",
    status: "open",
    raisedByUser: { first_name: "Jane", last_name: "Doe" },
    slaDeadline: null,
    slaBreached: false,
    ...overrides,
  };
}

function renderWith(
  tickets: any[],
  { setAlert = vi.fn(), totalCount = tickets.length } = {},
) {
  mockApiClient.mockResolvedValue({
    data: { data: { tickets }, total: totalCount },
  });
  return render(
    <AlertContext.Provider value={{ setAlert } as any}>
      <Tickets />
    </AlertContext.Provider>,
  );
}

describe("Tickets", () => {
  beforeEach(() => {
    mocks.instance.mockReset();
    mocks.instance.post.mockReset();
    mockNavigate.mockClear();
  });

  it("renders ticket rows with formatted priority/status chips", async () => {
    renderWith([makeTicket()]);
    expect(await screen.findByText("TCK-001")).toBeInTheDocument();
    expect(screen.getByText("High")).toBeInTheDocument();
    expect(screen.getByText("Open", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
  });

  it("formats multi-word statuses with spaces and capitalization", async () => {
    renderWith([makeTicket({ status: "in_progress" })]);
    expect(await screen.findByText("In Progress")).toBeInTheDocument();
  });

  it("shows an em dash for a ticket with no raisedByUser", async () => {
    renderWith([
      makeTicket({
        raisedByUser: null,
        slaDeadline: dayjs().add(1, "day").toISOString(),
      }),
    ]);
    await screen.findByText("TCK-001");
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows a warning icon for an SLA-breached ticket", async () => {
    const { container } = renderWith([makeTicket({ slaBreached: true })]);
    await screen.findByText("TCK-001");
    expect(
      container.querySelector('[data-testid="WarningAmberIcon"]'),
    ).toBeInTheDocument();
  });

  it("colors a past SLA deadline differently from a future one", async () => {
    const { unmount } = renderWith([
      makeTicket({ slaDeadline: dayjs().subtract(1, "day").toISOString() }),
    ]);
    const pastEl = await screen.findByText(/,\s\d{2}:\d{2}/);
    const pastColor = getComputedStyle(pastEl).color;
    unmount();

    renderWith([
      makeTicket({ slaDeadline: dayjs().add(1, "day").toISOString() }),
    ]);
    const futureEl = await screen.findByText(/,\s\d{2}:\d{2}/);
    const futureColor = getComputedStyle(futureEl).color;

    expect(pastColor).not.toBe(futureColor);
  });

  it("shows an empty message when there are no tickets", async () => {
    renderWith([]);
    expect(await screen.findByText("No tickets found")).toBeInTheDocument();
  });

  it("navigates to the ticket detail page when a row is clicked", async () => {
    renderWith([makeTicket()]);
    await screen.findByText("TCK-001");
    fireEvent.click(screen.getByText("Laptop broken"));
    expect(mockNavigate).toHaveBeenCalledWith("/helpdesk/t1");
  });

  it("refetches when the status filter changes", async () => {
    renderWith([makeTicket()]);
    await screen.findByText("TCK-001");
    mocks.instance.mockClear();

    fireEvent.change(screen.getByLabelText("Select Status"), {
      target: { value: "resolved" },
    });

    await waitFor(() =>
      expect(mocks.instance).toHaveBeenCalledWith(
        expect.stringContaining("status=resolved"),
      ),
    );
  });

  it("disables Submit until title and description are filled in", async () => {
    renderWith([]);
    await screen.findByText("No tickets found");
    fireEvent.click(screen.getByLabelText("Raise support ticket"));
    expect(screen.getByRole("button", { name: "Submit" })).toBeDisabled();
  });

  it("creates a ticket with the default category/priority and refreshes the list", async () => {
    mocks.instance.post.mockResolvedValue({});
    const setAlert = vi.fn();
    renderWith([], { setAlert });
    await screen.findByText("No tickets found");
    fireEvent.click(screen.getByLabelText("Raise support ticket"));

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Laptop broken" },
    });
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Screen is cracked" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() =>
      expect(mocks.instance.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          title: "Laptop broken",
          description: "Screen is cracked",
          category: "IT",
          priority: "medium",
        }),
      ),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Ticket created",
      }),
    );
  });

  it("shows the server error message when ticket creation fails", async () => {
    mocks.instance.post.mockRejectedValue({
      response: { data: { message: "Category invalid" } },
    });
    const setAlert = vi.fn();
    renderWith([], { setAlert });
    await screen.findByText("No tickets found");
    fireEvent.click(screen.getByLabelText("Raise support ticket"));
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "X" },
    });
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Y" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() =>
      expect(setAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: "error",
          message: "Category invalid",
        }),
      ),
    );
  });

  it("cancels the create dialog without submitting", async () => {
    renderWith([]);
    await screen.findByText("No tickets found");
    fireEvent.click(screen.getByLabelText("Raise support ticket"));
    fireEvent.click(screen.getByText("Cancel"));
    await waitFor(() =>
      expect(
        screen.queryByText("Raise Support Ticket"),
      ).not.toBeInTheDocument(),
    );
  });
});
