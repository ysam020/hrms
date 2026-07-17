import { render, screen, act } from "@testing-library/react";
import AnimatedClock from "@web/features/layout/AnimatedClock";

function makeMockWorker() {
  const instance: any = {
    postMessage: vi.fn(),
    terminate: vi.fn(),
    onmessage: null as any,
  };
  return instance;
}

describe("AnimatedClock", () => {
  let mockWorkerInstance: any;

  beforeEach(() => {
    mockWorkerInstance = makeMockWorker();
    (global as any).Worker = vi.fn(function MockWorker() {
      return mockWorkerInstance;
    });
  });

  it("renders 00:00 before any tick arrives", () => {
    render(
      <AnimatedClock
        targetDate={new Date()}
        theme="light"
        sessionColor="#000"
        onExpire={vi.fn()}
      />,
    );
    expect(screen.getByText("00:00")).toBeInTheDocument();
  });

  it("starts the worker with the target date once mounted", () => {
    const targetDate = new Date();
    render(
      <AnimatedClock
        targetDate={targetDate}
        theme="light"
        sessionColor="#000"
        onExpire={vi.fn()}
      />,
    );
    expect(mockWorkerInstance.postMessage).toHaveBeenCalledWith({
      type: "start",
      targetDate,
    });
  });

  it("updates the displayed time on a tick message, zero-padded", () => {
    render(
      <AnimatedClock
        targetDate={new Date()}
        theme="light"
        sessionColor="#000"
        onExpire={vi.fn()}
      />,
    );
    act(() =>
      mockWorkerInstance.onmessage({
        data: { type: "tick", minutes: 5, seconds: 9 },
      }),
    );
    expect(screen.getByText("05:09")).toBeInTheDocument();
  });

  it("calls onExpire when the worker reports expiry", () => {
    const onExpire = vi.fn();
    render(
      <AnimatedClock
        targetDate={new Date()}
        theme="light"
        sessionColor="#000"
        onExpire={onExpire}
      />,
    );
    act(() => mockWorkerInstance.onmessage({ data: { type: "expired" } }));
    expect(onExpire).toHaveBeenCalled();
  });

  it("stops the worker when targetDate changes/unmounts, and terminates on unmount", () => {
    const { rerender, unmount } = render(
      <AnimatedClock
        targetDate={new Date()}
        theme="light"
        sessionColor="#000"
        onExpire={vi.fn()}
      />,
    );
    const newDate = new Date(Date.now() + 100000);
    rerender(
      <AnimatedClock
        targetDate={newDate}
        theme="light"
        sessionColor="#000"
        onExpire={vi.fn()}
      />,
    );
    expect(mockWorkerInstance.postMessage).toHaveBeenCalledWith({
      type: "stop",
    });
    expect(mockWorkerInstance.postMessage).toHaveBeenCalledWith({
      type: "start",
      targetDate: newDate,
    });

    unmount();
    expect(mockWorkerInstance.terminate).toHaveBeenCalled();
  });

  it("does not create a worker when there is no targetDate", () => {
    (global as any).Worker = vi.fn();
    render(
      <AnimatedClock
        targetDate={null}
        theme="light"
        sessionColor="#000"
        onExpire={vi.fn()}
      />,
    );
    expect((global as any).Worker).not.toHaveBeenCalled();
  });
});
