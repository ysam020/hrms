/**
 * recruitment-service registers its gRPC server and resume worker to drain
 * on SIGTERM, then its queues and database clients — so an in-flight call
 * or scoring job finishes instead of being killed (and retried) mid-way.
 */
const mockSteps: Array<{
  name: string;
  step: (ms: number) => Promise<unknown>;
  phase: string;
}> = [];
jest.mock("@hrms/common", () => ({
  processShutdown: jest.fn(() => ({
    onShutdown: (name: string, step: any, phase = "drain") =>
      mockSteps.push({ name, step, phase }),
  })),
}));

const mockStop = jest.fn().mockResolvedValue(undefined);
jest.mock("../index", () => ({
  RecruitmentServer: jest.fn().mockImplementation(() => ({
    start: jest.fn(),
    stop: mockStop,
  })),
}));

const mockResumeWorker = { name: "resumeParsingQueue" };
jest.mock("../workers/resumeParser", () => ({
  startResumeParserWorker: jest.fn(() => mockResumeWorker),
}));

const mockCloseWorker = jest.fn().mockResolvedValue(undefined);
const mockCloseQueues = jest.fn().mockResolvedValue(undefined);
jest.mock("@hrms/queue", () => ({
  closeWorker: mockCloseWorker,
  closeQueues: mockCloseQueues,
}));
const mockDisconnect = jest.fn().mockResolvedValue(undefined);
jest.mock("@hrms/db", () => ({ disconnectDatabases: mockDisconnect }));
jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn() },
}));

it("drains the gRPC server and resume worker, then closes queues and databases", async () => {
  jest.isolateModules(() => {
    require("../server");
  });
  await new Promise((r) => setImmediate(r));

  expect(mockSteps.map(({ name, phase }) => `${phase}:${name}`)).toEqual([
    "drain:gRPC server",
    "cleanup:queues",
    "cleanup:database clients",
    "drain:resume parser worker",
  ]);

  const byName = Object.fromEntries(mockSteps.map((s) => [s.name, s.step]));
  await byName["gRPC server"](4000);
  expect(mockStop).toHaveBeenCalledWith(4000);
  await byName["resume parser worker"](4000);
  expect(mockCloseWorker).toHaveBeenCalledWith(mockResumeWorker, 4000);
  await byName["queues"](1000);
  await byName["database clients"](1000);
  expect(mockCloseQueues).toHaveBeenCalled();
  expect(mockDisconnect).toHaveBeenCalled();
});
