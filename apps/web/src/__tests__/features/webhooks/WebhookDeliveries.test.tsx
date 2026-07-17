import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import dayjs from "dayjs";
import WebhookDeliveries from "@web/features/webhooks/WebhookDeliveries";
import { AlertContext } from "@web/app/providers/AlertContext";
import apiClient from "@web/core/http/axiosConfig";

const mocks = vi.hoisted(() => {
  const instance: any = vi.fn();
  instance.post = vi.fn();
  return { instance };
});
vi.mock("@web/core/http/axiosConfig", () => ({ default: mocks.instance }));
const mockApiClient = apiClient as unknown as ReturnType<typeof vi.fn> & {
  post: ReturnType<typeof vi.fn>;
};

function delivery(overrides: Partial<any> = {}) {
  return {
    id: "d1",
    eventType: "employee.created",
    status: "success",
    httpStatus: 200,
    attempts: 1,
    error: null,
    createdAt: "2026-01-01T10:00:00Z",
    ...overrides,
  };
}

function setupApi({
  endpoints = [{ id: "e1", url: "https://example.com/hooks" }],
  deliveries = [],
  total = 0,
}: { endpoints?: any[]; deliveries?: any[]; total?: number } = {}) {
  mockApiClient.mockImplementation((url: string) => {
    if (url === "/webhooks/endpoints")
      return Promise.resolve({ data: { data: endpoints } });
    if (url.startsWith("/webhooks/endpoints/")) {
      return Promise.resolve({ data: { data: deliveries, total } });
    }
    return Promise.resolve({ data: { data: [] } });
  });
}

function renderDeliveries(setAlert = vi.fn()) {
  render(
    <AlertContext.Provider value={{ setAlert } as any}>
      <WebhookDeliveries />
    </AlertContext.Provider>,
  );
  return { setAlert };
}

describe("WebhookDeliveries", () => {
  beforeEach(() => {
    mockApiClient.mockReset();
    mockApiClient.post.mockReset();
  });

  it("auto-selects the first endpoint and shows an empty state with no deliveries", async () => {
    setupApi();
    renderDeliveries();
    expect(await screen.findByText("No deliveries found")).toBeInTheDocument();
  });

  it("shows 'No endpoints' when there are none registered", async () => {
    setupApi({ endpoints: [] });
    renderDeliveries();
    await screen.findByText("No deliveries found");
    fireEvent.mouseDown(screen.getByLabelText("Endpoint"));
    expect(
      await screen.findByRole("option", { name: "No endpoints" }),
    ).toBeInTheDocument();
  });

  it("lists a delivery's event, status chip, HTTP code, attempts, and formatted time", async () => {
    setupApi({ deliveries: [delivery()], total: 1 });
    renderDeliveries();
    expect(await screen.findByText("employee.created")).toBeInTheDocument();
    expect(screen.getByText("success")).toBeInTheDocument();
    expect(screen.getByText("200")).toBeInTheDocument();
    expect(
      screen.getByText(
        dayjs("2026-01-01T10:00:00Z").format("DD MMM, HH:mm:ss"),
      ),
    ).toBeInTheDocument();
  });

  it("shows an em dash for a missing HTTP status and the error text when present", async () => {
    setupApi({
      deliveries: [
        delivery({
          httpStatus: null,
          error: "Connection refused",
          status: "failed",
        }),
      ],
      total: 1,
    });
    renderDeliveries();
    await screen.findByText("employee.created");
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("Connection refused")).toBeInTheDocument();
  });

  it("shows a Retry action for a failed delivery but not a successful one", async () => {
    setupApi({
      deliveries: [
        delivery({ id: "d1", eventType: "employee.created", status: "failed" }),
        delivery({ id: "d2", eventType: "leave.approved", status: "success" }),
      ],
      total: 2,
    });
    renderDeliveries();
    await screen.findByText("leave.approved");
    expect(screen.getAllByLabelText("Retry delivery").length).toBe(1);
  });

  it("retries a delivery and refreshes the list", async () => {
    setupApi({ deliveries: [delivery({ status: "failed" })], total: 1 });
    mockApiClient.post.mockResolvedValue({});
    const { setAlert } = renderDeliveries();
    await screen.findByText("employee.created");

    fireEvent.click(screen.getByLabelText("Retry delivery"));

    await waitFor(() =>
      expect(mockApiClient.post).toHaveBeenCalledWith(
        "/webhooks/deliveries/d1/retry",
      ),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Delivery queued for retry",
      }),
    );
  });

  it("refetches deliveries when a different endpoint is selected", async () => {
    setupApi({
      endpoints: [
        { id: "e1", url: "https://example.com/hooks-1" },
        { id: "e2", url: "https://example.com/hooks-2" },
      ],
      deliveries: [],
    });
    renderDeliveries();
    await screen.findByText("No deliveries found");
    mockApiClient.mockClear();

    fireEvent.mouseDown(screen.getByLabelText("Endpoint"));
    fireEvent.click(
      await screen.findByRole("option", {
        name: "https://example.com/hooks-2",
      }),
    );

    await waitFor(() =>
      expect(mockApiClient).toHaveBeenCalledWith(
        expect.stringContaining("/webhooks/endpoints/e2/deliveries"),
      ),
    );
  });
});
