import { trace, SpanStatusCode } from "@opentelemetry/api";
import { withSpan } from "../index";

const mockSpan = {
  setAttribute: jest.fn(),
  setStatus: jest.fn(),
  recordException: jest.fn(),
  end: jest.fn(),
};

const mockStartActiveSpan = jest.fn((_name: string, fn: any) => fn(mockSpan));

describe("withSpan", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .spyOn(trace, "getTracer")
      .mockReturnValue({ startActiveSpan: mockStartActiveSpan } as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns the wrapped function's result", async () => {
    const result = await withSpan("job.doThing", async () => "done");
    expect(result).toBe("done");
  });

  it("sets each provided attribute on the span", async () => {
    await withSpan("job.doThing", async () => undefined, {
      "job.count": 5,
      "job.name": "payroll",
    });
    expect(mockSpan.setAttribute).toHaveBeenCalledWith("job.count", 5);
    expect(mockSpan.setAttribute).toHaveBeenCalledWith("job.name", "payroll");
  });

  it("skips setAttribute entirely when no attributes are given", async () => {
    await withSpan("job.doThing", async () => undefined);
    expect(mockSpan.setAttribute).not.toHaveBeenCalled();
  });

  it("marks the span OK and ends it on success", async () => {
    await withSpan("job.doThing", async () => "ok");
    expect(mockSpan.setStatus).toHaveBeenCalledWith({
      code: SpanStatusCode.OK,
    });
    expect(mockSpan.end).toHaveBeenCalled();
  });

  it("marks the span ERROR, records the exception, and rethrows on failure", async () => {
    const error = new Error("job failed");
    await expect(
      withSpan("job.doThing", async () => {
        throw error;
      }),
    ).rejects.toThrow("job failed");

    expect(mockSpan.setStatus).toHaveBeenCalledWith({
      code: SpanStatusCode.ERROR,
      message: "job failed",
    });
    expect(mockSpan.recordException).toHaveBeenCalledWith(error);
  });

  it("still ends the span even when the wrapped function throws", async () => {
    await expect(
      withSpan("job.doThing", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow();
    expect(mockSpan.end).toHaveBeenCalled();
  });

  it("falls back to String(err) when a non-Error is thrown without a message", async () => {
    await expect(
      withSpan("job.doThing", async () => {
        throw "plain string error";
      }),
    ).rejects.toBe("plain string error");

    expect(mockSpan.setStatus).toHaveBeenCalledWith({
      code: SpanStatusCode.ERROR,
      message: "plain string error",
    });
  });

  it("passes the span through to the wrapped function", async () => {
    let receivedSpan: any;
    await withSpan("job.doThing", async (span) => {
      receivedSpan = span;
    });
    expect(receivedSpan).toBe(mockSpan);
  });
});
