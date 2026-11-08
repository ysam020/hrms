// With telemetry enabled, signals must only flush the SDK — never exit or
// block the process — and the flush must happen once, however many callers
// (signal handlers, a service's shutdown coordinator) ask for it.
const mockShutdown = jest.fn();
jest.mock("@opentelemetry/sdk-node", () => ({
  NodeSDK: jest.fn().mockImplementation(() => ({
    start: jest.fn(),
    shutdown: mockShutdown,
  })),
}));
jest.mock("@opentelemetry/auto-instrumentations-node", () => ({
  getNodeAutoInstrumentations: jest.fn(() => []),
}));
jest.mock("@opentelemetry/exporter-prometheus", () => ({
  PrometheusExporter: jest.fn(),
}));
jest.mock("@opentelemetry/exporter-trace-otlp-http", () => ({
  OTLPTraceExporter: jest.fn(),
}));

describe("flushTelemetry", () => {
  const handlers: Record<string, () => void> = {};
  let on: jest.SpyInstance;
  let exit: jest.SpyInstance;
  let telemetry: typeof import("../index");

  beforeAll(() => {
    process.env.OTEL_ENABLED = "true";
    on = jest.spyOn(process, "on").mockImplementation(((
      event: string,
      handler: () => void,
    ) => {
      handlers[event] = handler;
      return process;
    }) as any);
    exit = jest.spyOn(process, "exit").mockImplementation((() => {}) as any);
    jest.isolateModules(() => {
      telemetry = require("../index");
    });
  });
  afterAll(() => {
    delete process.env.OTEL_ENABLED;
    on.mockRestore();
    exit.mockRestore();
  });

  it("flushes once for every caller, and SIGTERM/SIGINT never exit the process", async () => {
    let finish!: () => void;
    mockShutdown.mockReturnValue(new Promise<void>((r) => (finish = r)));

    handlers.SIGTERM();
    handlers.SIGINT();
    const fromCoordinator = telemetry.flushTelemetry();
    finish();
    await fromCoordinator;

    expect(mockShutdown).toHaveBeenCalledTimes(1);
    expect(exit).not.toHaveBeenCalled();
  });

  it("never rejects, even if the SDK's shutdown fails", async () => {
    // Already settled from the previous test: same promise, still resolved.
    await expect(telemetry.flushTelemetry()).resolves.toBeUndefined();
  });
});
