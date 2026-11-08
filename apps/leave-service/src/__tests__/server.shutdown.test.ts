/**
 * A gRPC service registers its server to drain on SIGTERM (stop taking
 * calls, let in-flight ones finish), then its queues and database clients.
 * The same wiring is in each gRPC service's server.ts.
 */
const mockSteps: Array<{ name: string; step: any; phase: string }> = [];
jest.mock("@hrms/common", () => ({
  processShutdown: jest.fn(() => ({
    onShutdown: (name: string, step: any, phase = "drain") =>
      mockSteps.push({ name, step, phase }),
  })),
}));
const mockStop = jest.fn().mockResolvedValue(undefined);
jest.mock("../index", () => ({
  LeaveServer: jest.fn().mockImplementation(() => ({
    start: jest.fn(),
    stop: mockStop,
  })),
}));
jest.mock("@hrms/queue", () => ({ closeQueues: jest.fn() }));
jest.mock("@hrms/db", () => ({ disconnectDatabases: jest.fn() }));
jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn() },
}));

it("drains the gRPC server before closing queues and database clients", async () => {
  jest.isolateModules(() => {
    require("../server");
  });
  await new Promise((r) => setImmediate(r));
  expect(mockSteps.map(({ name, phase }) => `${phase}:${name}`)).toEqual([
    "drain:gRPC server",
    "cleanup:queues",
    "cleanup:database clients",
  ]);
  await mockSteps[0].step(6000);
  expect(mockStop).toHaveBeenCalledWith(6000);
});
