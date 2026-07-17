import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import WebhookEndpoints from "@web/features/webhooks/WebhookEndpoints";
import { AlertContext } from "@web/app/providers/AlertContext";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import apiClient from "@web/core/http/axiosConfig";

const mocks = vi.hoisted(() => {
  const instance: any = vi.fn();
  instance.post = vi.fn();
  instance.patch = vi.fn();
  instance.delete = vi.fn();
  return { instance };
});
vi.mock("@web/core/http/axiosConfig", () => ({ default: mocks.instance }));
const mockApiClient = apiClient as unknown as ReturnType<typeof vi.fn> & {
  post: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

function endpoint(overrides: Partial<any> = {}) {
  return {
    id: "e1",
    url: "https://example.com/hooks/hrms",
    events: ["employee.created", "leave.approved"],
    isActive: true,
    ...overrides,
  };
}

function renderEndpoints(setAlert = vi.fn()) {
  render(
    <ThemeContext.Provider
      value={{ theme: "light", toggleTheme: vi.fn() } as any}
    >
      <AlertContext.Provider value={{ setAlert } as any}>
        <WebhookEndpoints />
      </AlertContext.Provider>
    </ThemeContext.Provider>,
  );
  return { setAlert };
}

describe("WebhookEndpoints", () => {
  beforeEach(() => {
    mockApiClient.mockReset();
    mockApiClient.post.mockReset();
    mockApiClient.patch.mockReset();
    mockApiClient.delete.mockReset();
    Object.assign(navigator, { clipboard: { writeText: vi.fn() } });
  });

  it("shows an empty state when there are no endpoints", async () => {
    mockApiClient.mockResolvedValue({ data: { data: [] } });
    renderEndpoints();
    expect(
      await screen.findByText("No webhook endpoints registered yet."),
    ).toBeInTheDocument();
  });

  it("lists an endpoint's URL and subscribed event chips", async () => {
    mockApiClient.mockResolvedValue({ data: { data: [endpoint()] } });
    renderEndpoints();
    expect(
      await screen.findByText("https://example.com/hooks/hrms"),
    ).toBeInTheDocument();
    expect(screen.getByText("employee.created")).toBeInTheDocument();
    expect(screen.getByText("leave.approved")).toBeInTheDocument();
  });

  it("disables Create until both a URL and at least one event are chosen", async () => {
    mockApiClient.mockResolvedValue({ data: { data: [] } });
    renderEndpoints();
    await screen.findByText("No webhook endpoints registered yet.");

    fireEvent.click(screen.getByText("Add Endpoint", { selector: "span" }));
    const createBtn = screen
      .getByText("Create Endpoint", { selector: "span" })
      .closest("button")!;
    expect(createBtn).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Endpoint URL"), {
      target: { value: "https://example.com/hooks" },
    });
    expect(createBtn).toBeDisabled();

    fireEvent.click(screen.getByLabelText("employee.created"));
    expect(createBtn).not.toBeDisabled();
  });

  it("creates an endpoint and reveals the one-time secret, resetting the form on Done", async () => {
    mockApiClient.mockResolvedValue({ data: { data: [] } });
    mockApiClient.post.mockResolvedValue({
      data: { data: { secret: "whsec_abc123" } },
    });
    renderEndpoints();
    await screen.findByText("No webhook endpoints registered yet.");

    fireEvent.click(screen.getByText("Add Endpoint", { selector: "span" }));
    fireEvent.change(screen.getByLabelText("Endpoint URL"), {
      target: { value: "https://example.com/hooks" },
    });
    fireEvent.click(screen.getByLabelText("employee.created"));
    fireEvent.click(screen.getByText("Create Endpoint", { selector: "span" }));

    await waitFor(() =>
      expect(mockApiClient.post).toHaveBeenCalledWith("/webhooks/endpoints", {
        url: "https://example.com/hooks",
        events: ["employee.created"],
      }),
    );
    expect(await screen.findByText("whsec_abc123")).toBeInTheDocument();
    expect(screen.getByText(/Store this secret securely/)).toBeInTheDocument();

    fireEvent.click(
      screen.getByText("Done — I've saved the secret", { selector: "span" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByText("Register Webhook Endpoint"),
      ).not.toBeInTheDocument(),
    );
  });

  it("copies the secret to the clipboard", async () => {
    mockApiClient.mockResolvedValue({ data: { data: [] } });
    mockApiClient.post.mockResolvedValue({
      data: { data: { secret: "whsec_abc123" } },
    });
    const { setAlert } = renderEndpoints();
    await screen.findByText("No webhook endpoints registered yet.");

    fireEvent.click(screen.getByText("Add Endpoint", { selector: "span" }));
    fireEvent.change(screen.getByLabelText("Endpoint URL"), {
      target: { value: "https://x.com" },
    });
    fireEvent.click(screen.getByLabelText("employee.created"));
    fireEvent.click(screen.getByText("Create Endpoint", { selector: "span" }));
    await screen.findByText("whsec_abc123");

    fireEvent.click(screen.getByLabelText("Copy"));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("whsec_abc123");
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Secret copied",
      }),
    );
  });

  it("toggles an endpoint's active state", async () => {
    mockApiClient.mockResolvedValue({
      data: { data: [endpoint({ isActive: true })] },
    });
    mockApiClient.patch.mockResolvedValue({ data: {} });
    renderEndpoints();
    await screen.findByText("https://example.com/hooks/hrms");

    fireEvent.click(screen.getByRole("checkbox"));

    await waitFor(() =>
      expect(mockApiClient.patch).toHaveBeenCalledWith(
        "/webhooks/endpoints/e1",
        { isActive: false },
      ),
    );
  });

  it("sends a test ping and shows a success result", async () => {
    mockApiClient.mockResolvedValue({ data: { data: [endpoint()] } });
    mockApiClient.post.mockResolvedValue({
      data: { data: { httpStatus: 200, success: true } },
    });
    renderEndpoints();
    await screen.findByText("https://example.com/hooks/hrms");

    fireEvent.click(screen.getByLabelText("Send test ping"));

    await waitFor(() =>
      expect(mockApiClient.post).toHaveBeenCalledWith("/webhooks/test", {
        endpointId: "e1",
      }),
    );
    expect(await screen.findByText("✓ HTTP 200")).toBeInTheDocument();
  });

  it("shows a failed test ping result with the error message", async () => {
    mockApiClient.mockResolvedValue({ data: { data: [endpoint()] } });
    mockApiClient.post.mockResolvedValue({
      data: {
        data: {
          httpStatus: 500,
          success: false,
          error: "Connection timed out",
        },
      },
    });
    renderEndpoints();
    await screen.findByText("https://example.com/hooks/hrms");

    fireEvent.click(screen.getByLabelText("Send test ping"));
    expect(
      await screen.findByText("✗ Connection timed out"),
    ).toBeInTheDocument();
  });

  it("rotates a secret through its confirmation dialog", async () => {
    // Possible bug in WebhookEndpoints.tsx: handleRotate() calls
    // setNewSecret(...) but never setOpenCreate(true), and the "here's your
    // new secret" block only renders inside the Register dialog (gated on
    // openCreate). So the freshly rotated secret is stored in state but
    // never actually surfaced to the user through the UI — confirmed here:
    // the PATCH fires correctly, but the secret never becomes visible.
    // Not fixed here per this suite's "flag, don't silently fix" policy —
    // flagged to the user instead.
    mockApiClient.mockResolvedValue({ data: { data: [endpoint()] } });
    mockApiClient.patch.mockResolvedValue({
      data: { data: { secret: "whsec_new" } },
    });
    renderEndpoints();
    await screen.findByText("https://example.com/hooks/hrms");

    fireEvent.click(screen.getByLabelText("Rotate secret"));
    expect(
      screen.getByText("Rotate this endpoint's secret?"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText("Rotate", { selector: "span" }));

    await waitFor(() =>
      expect(mockApiClient.patch).toHaveBeenCalledWith(
        "/webhooks/endpoints/e1",
        { rotate: true },
      ),
    );
    // The confirmation dialog closes and the new secret is never shown.
    await waitFor(() =>
      expect(
        screen.queryByText("Rotate this endpoint's secret?"),
      ).not.toBeInTheDocument(),
    );
    expect(screen.queryByText("whsec_new")).not.toBeInTheDocument();
  });

  it("deletes an endpoint through its confirmation dialog", async () => {
    mockApiClient.mockResolvedValue({ data: { data: [endpoint()] } });
    mockApiClient.delete.mockResolvedValue({});
    const { setAlert } = renderEndpoints();
    await screen.findByText("https://example.com/hooks/hrms");

    fireEvent.click(screen.getByLabelText("Delete endpoint"));
    expect(
      screen.getByText(
        "Delete this webhook endpoint and all delivery history?",
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText("Delete", { selector: "span" }));

    await waitFor(() =>
      expect(mockApiClient.delete).toHaveBeenCalledWith(
        "/webhooks/endpoints/e1",
      ),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Endpoint deleted",
      }),
    );
  });
});
