import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import AIInsightsCard from "@web/shared/components/AIInsightsCard";
import { getAccessToken, fetchCsrfToken } from "@web/core/http/axiosConfig";

// The mocked stream reader resolves every chunk on the microtask queue with
// no real I/O in between, so RTL's findBy*/waitFor polling (interval-timer
// based) can race ahead of React's own scheduling of the resulting state
// updates. Fake timers + advanceTimersByTimeAsync (which flushes microtasks
// between each simulated tick) let everything settle deterministically
// instead of adding real wall-clock time to the suite via a plain
// setTimeout wait — a plausible source of flakiness under CI load.
async function flush(ms = 50) {
  vi.useFakeTimers();
  try {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  } finally {
    vi.useRealTimers();
  }
}

vi.mock("@web/core/http/axiosConfig", () => ({
  getAccessToken: vi.fn(),
  fetchCsrfToken: vi.fn(),
}));
const mockGetAccessToken = getAccessToken as unknown as ReturnType<
  typeof vi.fn
>;
const mockFetchCsrfToken = fetchCsrfToken as unknown as ReturnType<
  typeof vi.fn
>;

function sseChunk(payload: any) {
  return `data: ${JSON.stringify(payload)}\n`;
}

function mockStream(chunks: string[]) {
  let index = 0;
  const reader = {
    read: vi.fn(async () => {
      if (index >= chunks.length) return { done: true, value: undefined };
      const value = new TextEncoder().encode(chunks[index]);
      index++;
      return { done: false, value };
    }),
  };
  return { ok: true, body: { getReader: () => reader } };
}

describe("AIInsightsCard", () => {
  beforeEach(() => {
    mockGetAccessToken.mockReturnValue("access-token");
    mockFetchCsrfToken.mockResolvedValue("csrf-token");
    vi.stubGlobal("fetch", vi.fn());
    if (!crypto.randomUUID) {
      (crypto as any).randomUUID = () => "00000000-0000-0000-0000-000000000000";
    }
  });

  afterEach(() => vi.unstubAllGlobals());

  it("shows the default header and Generate Insights button", () => {
    render(<AIInsightsCard module="resignation" />);
    expect(screen.getByText("AI Insights")).toBeInTheDocument();
    expect(
      screen.getByText("Generate Insights", { selector: "span" }),
    ).toBeInTheDocument();
  });

  it("sends module and params in the request body along with auth/csrf headers", async () => {
    (global.fetch as any).mockResolvedValue(
      mockStream([sseChunk({ done: true })]),
    );
    render(<AIInsightsCard module="resignation" params={{ range: "30d" }} />);

    fireEvent.click(
      screen.getByText("Generate Insights", { selector: "span" }),
    );

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const [url, options] = (global.fetch as any).mock.calls[0];
    expect(url).toContain("/ai-insights");
    expect(options.method).toBe("POST");
    expect(options.headers.Authorization).toBe("Bearer access-token");
    expect(options.headers["x-csrf-token"]).toBe("csrf-token");
    expect(JSON.parse(options.body)).toEqual({
      module: "resignation",
      range: "30d",
    });
  });

  it("progressively reveals the streaming summary, then patterns/risks/recommendations as they arrive", async () => {
    (global.fetch as any).mockResolvedValue(
      mockStream([
        sseChunk({ token: '{"summary": "Attrition is trending up' }),
        sseChunk({ token: '", "patterns": ["Pattern A"]' }),
        sseChunk({
          token: ', "risks": ["Risk A"], "recommendations": ["Rec A"]}',
        }),
        sseChunk({ done: true }),
      ]),
    );
    render(<AIInsightsCard module="resignation" />);
    fireEvent.click(
      screen.getByText("Generate Insights", { selector: "span" }),
    );
    await flush();

    expect(screen.getByText(/Attrition is trending up/)).toBeInTheDocument();
    expect(screen.getByText("Pattern A")).toBeInTheDocument();
    expect(screen.getByText("Risk A")).toBeInTheDocument();
    expect(screen.getByText("Rec A")).toBeInTheDocument();
  });

  it("switches to the final structured layout once streaming completes, and relabels the button Regenerate", async () => {
    (global.fetch as any).mockResolvedValue(
      mockStream([
        sseChunk({
          token: JSON.stringify({
            summary: "All quiet this month.",
            patterns: ["Steady headcount"],
            risks: [],
            recommendations: ["No action needed"],
          }),
        }),
        sseChunk({ done: true }),
      ]),
    );
    render(<AIInsightsCard module="resignation" />);
    fireEvent.click(
      screen.getByText("Generate Insights", { selector: "span" }),
    );
    await flush();

    expect(screen.getByText("All quiet this month.")).toBeInTheDocument();
    expect(screen.getByText("Steady headcount")).toBeInTheDocument();
    expect(screen.getByText("No action needed")).toBeInTheDocument();
    // Empty "risks" section is omitted entirely.
    expect(screen.queryByText("Risks")).not.toBeInTheDocument();
    expect(
      screen.getByText("Regenerate", { selector: "span" }),
    ).toBeInTheDocument();
  });

  it("correctly unescapes quotes and newlines inside a streamed string", async () => {
    (global.fetch as any).mockResolvedValue(
      mockStream([
        sseChunk({
          token: JSON.stringify({
            summary: 'Quote: "nice" and a\nnewline.',
            patterns: [],
            risks: [],
            recommendations: [],
          }),
        }),
        sseChunk({ done: true }),
      ]),
    );
    render(<AIInsightsCard module="resignation" />);
    fireEvent.click(
      screen.getByText("Generate Insights", { selector: "span" }),
    );
    await flush();

    // RTL normalizes whitespace by default, collapsing the embedded newline
    // to a single space — this still proves the escaped \n and \" were
    // decoded correctly rather than leaking as literal backslash sequences.
    expect(
      screen.getByText('Quote: "nice" and a newline.'),
    ).toBeInTheDocument();
  });

  it("shows an error alert when the initial response is not ok", async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      body: null,
      json: async () => ({ message: "Rate limit exceeded" }),
    });
    render(<AIInsightsCard module="resignation" />);
    fireEvent.click(
      screen.getByText("Generate Insights", { selector: "span" }),
    );

    expect(await screen.findByText("Rate limit exceeded")).toBeInTheDocument();
  });

  it("shows an error alert when the stream itself reports an error payload", async () => {
    (global.fetch as any).mockResolvedValue(
      mockStream([sseChunk({ error: "Model unavailable" })]),
    );
    render(<AIInsightsCard module="resignation" />);
    fireEvent.click(
      screen.getByText("Generate Insights", { selector: "span" }),
    );

    expect(await screen.findByText("Model unavailable")).toBeInTheDocument();
  });
});
