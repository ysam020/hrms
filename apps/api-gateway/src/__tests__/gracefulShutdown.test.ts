jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn() },
}));

import { registerGracefulShutdown } from "../config/gracefulShutdown";

describe("registerGracefulShutdown", () => {
  let sigtermHandler: (() => Promise<void>) | undefined;
  let sigintHandler: (() => Promise<void>) | undefined;
  let onSpy: jest.SpyInstance;
  let exitSpy: jest.SpyInstance;

  beforeEach(() => {
    sigtermHandler = undefined;
    sigintHandler = undefined;
    onSpy = jest.spyOn(process, "on").mockImplementation(((
      event: string,
      handler: any,
    ) => {
      if (event === "SIGTERM") sigtermHandler = handler;
      if (event === "SIGINT") sigintHandler = handler;
      return process;
    }) as any);
    exitSpy = jest
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as any);
  });

  afterEach(() => {
    onSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it("registers handlers for both SIGTERM and SIGINT", () => {
    const server: any = { close: jest.fn() };
    const redisAdapter = { cleanup: jest.fn().mockResolvedValue(undefined) };

    registerGracefulShutdown(server, redisAdapter);

    expect(sigtermHandler).toBeInstanceOf(Function);
    expect(sigintHandler).toBeInstanceOf(Function);
  });

  it("cleans up the redis adapter and closes the server on SIGTERM", async () => {
    const server: any = { close: jest.fn((cb: () => void) => cb()) };
    const redisAdapter = { cleanup: jest.fn().mockResolvedValue(undefined) };

    registerGracefulShutdown(server, redisAdapter);
    await sigtermHandler!();

    expect(redisAdapter.cleanup).toHaveBeenCalled();
    expect(server.close).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it("exits only after the server has actually finished closing", async () => {
    let closeCallback: (() => void) | undefined;
    const server: any = {
      close: jest.fn((cb: () => void) => {
        closeCallback = cb;
      }),
    };
    const redisAdapter = { cleanup: jest.fn().mockResolvedValue(undefined) };

    registerGracefulShutdown(server, redisAdapter);
    await sigintHandler!();

    expect(exitSpy).not.toHaveBeenCalled();
    closeCallback!();
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  describe("hard-exit timeout", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it("force-exits with a non-zero code if server.close() never calls back (e.g. a long-lived WebSocket connection holding it open)", async () => {
      const server: any = { close: jest.fn() }; // never invokes its callback
      const redisAdapter = { cleanup: jest.fn().mockResolvedValue(undefined) };

      registerGracefulShutdown(server, redisAdapter);
      await sigtermHandler!();

      expect(exitSpy).not.toHaveBeenCalled();
      jest.advanceTimersByTime(15_000);
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it("does not force-exit once the server has already closed cleanly", async () => {
      const server: any = {
        close: jest.fn((cb: () => void) => cb()),
      };
      const redisAdapter = { cleanup: jest.fn().mockResolvedValue(undefined) };

      registerGracefulShutdown(server, redisAdapter);
      await sigtermHandler!();

      expect(exitSpy).toHaveBeenCalledWith(0);
      exitSpy.mockClear();
      jest.advanceTimersByTime(15_000);
      expect(exitSpy).not.toHaveBeenCalled();
    });
  });
});
