import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import Chatbot from "@web/features/chatbot/Chatbot";
import { UserContext } from "@web/app/providers/UserContext";
import {
  getAccessToken,
  fetchCsrfToken,
  performRefresh,
  isExpiringSoon,
} from "@web/core/http/axiosConfig";

vi.mock("@web/core/http/axiosConfig", () => ({
  getAccessToken: vi.fn(() => "token123"),
  fetchCsrfToken: vi.fn(async () => "csrf123"),
  performRefresh: vi.fn(async () => "refreshed-token"),
  isExpiringSoon: vi.fn(() => false),
  registerPendingAbort: vi.fn(),
  unregisterPendingAbort: vi.fn(),
}));
const mockGetAccessToken = getAccessToken as unknown as ReturnType<
  typeof vi.fn
>;
const mockFetchCsrfToken = fetchCsrfToken as unknown as ReturnType<
  typeof vi.fn
>;
const mockPerformRefresh = performRefresh as unknown as ReturnType<
  typeof vi.fn
>;
const mockIsExpiringSoon = isExpiringSoon as unknown as ReturnType<
  typeof vi.fn
>;

function sseChunk(payload: object) {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function makeStreamResponse(
  chunks: string[],
  { ok = true, status = 200 } = {},
) {
  let i = 0;
  return {
    ok,
    status,
    body: {
      getReader: () => ({
        read: vi.fn(async () => {
          if (i < chunks.length) {
            const value = new TextEncoder().encode(chunks[i]);
            i += 1;
            return { done: false, value };
          }
          return { done: true, value: undefined };
        }),
      }),
    },
    json: vi.fn(async () => ({})),
  };
}

function renderChatbot(user: any = { id: "u1", first_name: "Jane" }) {
  return render(
    <UserContext.Provider value={{ user } as any}>
      <Chatbot />
    </UserContext.Provider>,
  );
}

describe("Chatbot", () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    vi.stubGlobal("fetch", vi.fn());
    mockGetAccessToken.mockReturnValue("token123");
    mockFetchCsrfToken.mockResolvedValue("csrf123");
    mockIsExpiringSoon.mockReturnValue(false);
    mockPerformRefresh.mockResolvedValue("refreshed-token");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts closed, showing only the launcher FAB", () => {
    renderChatbot();
    expect(screen.getByLabelText("Open HRMS AI Assistant")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens the panel from the FAB and greets the user by first name", () => {
    renderChatbot({ id: "u1", first_name: "Jane" });
    fireEvent.click(screen.getByLabelText("Open HRMS AI Assistant"));
    expect(
      screen.getByRole("dialog", { name: "HRMS AI Assistant" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Hi, Jane! How can I help?")).toBeInTheDocument();
  });

  it("greets generically when there is no first name", () => {
    renderChatbot({ id: "u1" });
    fireEvent.click(screen.getByLabelText("Open HRMS AI Assistant"));
    expect(screen.getByText("Hi! How can I help?")).toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    renderChatbot();
    fireEvent.click(screen.getByLabelText("Open HRMS AI Assistant"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("closes when clicking outside the panel", async () => {
    renderChatbot();
    fireEvent.click(screen.getByLabelText("Open HRMS AI Assistant"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.pointerDown(document.body);

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("stays open when clicking inside the panel", async () => {
    renderChatbot();
    fireEvent.click(screen.getByLabelText("Open HRMS AI Assistant"));
    const dialog = screen.getByRole("dialog");

    fireEvent.pointerDown(dialog);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("toggles open/closed on Cmd/Ctrl+Shift+A", async () => {
    renderChatbot();
    fireEvent.keyDown(window, { key: "a", ctrlKey: true, shiftKey: true });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "a", ctrlKey: true, shiftKey: true });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("disables Send until there is non-whitespace input", () => {
    renderChatbot();
    fireEvent.click(screen.getByLabelText("Open HRMS AI Assistant"));
    expect(screen.getByLabelText("Send message")).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText(/Ask about leaves/), {
      target: { value: "   " },
    });
    expect(screen.getByLabelText("Send message")).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText(/Ask about leaves/), {
      target: { value: "Hi" },
    });
    expect(screen.getByLabelText("Send message")).not.toBeDisabled();
  });

  it("streams tokens into the assistant bubble and clears the input", async () => {
    (fetch as any).mockResolvedValue(
      makeStreamResponse([
        sseChunk({ token: "Hello " }),
        sseChunk({ token: "there" }),
        sseChunk({ done: true }),
      ]),
    );
    renderChatbot();
    fireEvent.click(screen.getByLabelText("Open HRMS AI Assistant"));
    fireEvent.change(screen.getByPlaceholderText(/Ask about leaves/), {
      target: { value: "Hi bot" },
    });
    fireEvent.click(screen.getByLabelText("Send message"));

    expect(screen.getByPlaceholderText(/Ask about leaves/)).toHaveValue("");
    expect(screen.getByText("Hi bot")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("Hello there")).toBeInTheDocument(),
    );
  });

  it("sends a suggested question when its chip is clicked", async () => {
    (fetch as any).mockResolvedValue(
      makeStreamResponse([sseChunk({ token: "42" }), sseChunk({ done: true })]),
    );
    renderChatbot();
    fireEvent.click(screen.getByLabelText("Open HRMS AI Assistant"));

    fireEvent.click(screen.getByText("What is my current salary?"));

    expect(screen.getByText("What is my current salary?")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("42")).toBeInTheDocument());
  });

  it("sends on Enter but not on Shift+Enter", async () => {
    (fetch as any).mockResolvedValue(
      makeStreamResponse([sseChunk({ done: true })]),
    );
    renderChatbot();
    fireEvent.click(screen.getByLabelText("Open HRMS AI Assistant"));
    const input = screen.getByPlaceholderText(/Ask about leaves/);
    fireEvent.change(input, { target: { value: "Hi" } });

    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(fetch).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });
    await waitFor(() => expect(fetch).toHaveBeenCalled());
  });

  it("shows the server error message on a non-OK, non-401 response", async () => {
    (fetch as any).mockResolvedValue({
      ok: false,
      status: 500,
      json: vi.fn().mockResolvedValue({ message: "The model is unavailable." }),
    });
    renderChatbot();
    fireEvent.click(screen.getByLabelText("Open HRMS AI Assistant"));
    fireEvent.change(screen.getByPlaceholderText(/Ask about leaves/), {
      target: { value: "Hi" },
    });
    fireEvent.click(screen.getByLabelText("Send message"));

    expect(
      await screen.findByText("The model is unavailable."),
    ).toBeInTheDocument();
  });

  it("retries once with a refreshed token on a 401, then streams normally", async () => {
    (fetch as any)
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: vi.fn().mockResolvedValue({}),
      })
      .mockResolvedValueOnce(
        makeStreamResponse([
          sseChunk({ token: "OK" }),
          sseChunk({ done: true }),
        ]),
      );
    renderChatbot();
    fireEvent.click(screen.getByLabelText("Open HRMS AI Assistant"));
    fireEvent.change(screen.getByPlaceholderText(/Ask about leaves/), {
      target: { value: "Hi" },
    });
    fireEvent.click(screen.getByLabelText("Send message"));

    await waitFor(() => expect(mockPerformRefresh).toHaveBeenCalled());
    expect(await screen.findByText("OK")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("shows a session-expired message when the post-401 refresh itself fails", async () => {
    (fetch as any).mockResolvedValue({
      ok: false,
      status: 401,
      json: vi.fn().mockResolvedValue({}),
    });
    mockPerformRefresh.mockRejectedValue(new Error("refresh failed"));
    renderChatbot();
    fireEvent.click(screen.getByLabelText("Open HRMS AI Assistant"));
    fireEvent.change(screen.getByPlaceholderText(/Ask about leaves/), {
      target: { value: "Hi" },
    });
    fireEvent.click(screen.getByLabelText("Send message"));

    expect(
      await screen.findByText("Session expired. Please refresh the page."),
    ).toBeInTheDocument();
  });

  it("shows a connection-lost message when the fetch itself throws", async () => {
    (fetch as any).mockRejectedValue(new Error("network down"));
    renderChatbot();
    fireEvent.click(screen.getByLabelText("Open HRMS AI Assistant"));
    fireEvent.change(screen.getByPlaceholderText(/Ask about leaves/), {
      target: { value: "Hi" },
    });
    fireEvent.click(screen.getByLabelText("Send message"));

    expect(
      await screen.findByText("Connection lost. Please try again."),
    ).toBeInTheDocument();
  });

  it("proactively refreshes an expiring token before streaming", async () => {
    mockIsExpiringSoon.mockReturnValue(true);
    (fetch as any).mockResolvedValue(
      makeStreamResponse([sseChunk({ done: true })]),
    );
    renderChatbot();
    fireEvent.click(screen.getByLabelText("Open HRMS AI Assistant"));
    fireEvent.change(screen.getByPlaceholderText(/Ask about leaves/), {
      target: { value: "Hi" },
    });
    fireEvent.click(screen.getByLabelText("Send message"));

    await waitFor(() => expect(mockPerformRefresh).toHaveBeenCalled());
  });

  it("shows and uses the Clear conversation action once there are messages", async () => {
    (fetch as any).mockResolvedValue(
      makeStreamResponse([sseChunk({ token: "Hi" }), sseChunk({ done: true })]),
    );
    renderChatbot();
    fireEvent.click(screen.getByLabelText("Open HRMS AI Assistant"));
    expect(
      screen.queryByLabelText("Clear conversation"),
    ).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Ask about leaves/), {
      target: { value: "Hi" },
    });
    fireEvent.click(screen.getByLabelText("Send message"));
    await waitFor(() =>
      expect(screen.getByLabelText("Clear conversation")).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByLabelText("Clear conversation"));
    expect(screen.queryByText("Hi bot")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Clear conversation"),
    ).not.toBeInTheDocument();
  });
});
