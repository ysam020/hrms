import { closeWorker } from "../shutdown";

const worker = (close: () => Promise<void>) =>
  ({ name: "notificationQueueV2", close: jest.fn(close) }) as any;

describe("closeWorker", () => {
  afterEach(() => jest.useRealTimers());

  it("resolves once the worker has closed (no new jobs taken, active ones finished)", async () => {
    const w = worker(async () => undefined);
    await expect(closeWorker(w, 1000)).resolves.toBeUndefined();
    expect(w.close).toHaveBeenCalledWith();
  });

  it("rejects, naming the worker, when active jobs outlast the timeout", async () => {
    jest.useFakeTimers();
    const w = worker(() => new Promise(() => {}));
    const closing = closeWorker(w, 2000);
    jest.advanceTimersByTime(2000);
    await expect(closing).rejects.toThrow(
      'worker "notificationQueueV2": active jobs still running after 2000 ms',
    );
  });
});
