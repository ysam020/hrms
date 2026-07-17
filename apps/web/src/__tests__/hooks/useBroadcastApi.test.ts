import { renderHook } from "@testing-library/react";
import useBroadcastApi from "@web/shared/hooks/useBroadcastApi";

function makeChannel() {
  return { postMessage: vi.fn(), onmessage: null as any };
}

describe("useBroadcastApi", () => {
  it("broadcasts a tab-opened message on mount", () => {
    const channel = makeChannel();
    renderHook(() => useBroadcastApi(channel, vi.fn()));
    expect(channel.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "tab-opened",
        tabId: expect.any(Number),
      }),
    );
  });

  it("shows the modal when another tab announces tab-opened", () => {
    const channel = makeChannel();
    const setBroadcastModal = vi.fn();
    renderHook(() => useBroadcastApi(channel, setBroadcastModal));

    channel.onmessage({ data: { type: "tab-opened" } });

    expect(setBroadcastModal).toHaveBeenCalledWith(true);
  });

  it("shows the modal when another tab announces activate-tab", () => {
    const channel = makeChannel();
    const setBroadcastModal = vi.fn();
    renderHook(() => useBroadcastApi(channel, setBroadcastModal));

    channel.onmessage({ data: { type: "activate-tab" } });

    expect(setBroadcastModal).toHaveBeenCalledWith(true);
  });

  it("ignores unrelated message types", () => {
    const channel = makeChannel();
    const setBroadcastModal = vi.fn();
    renderHook(() => useBroadcastApi(channel, setBroadcastModal));

    channel.onmessage({ data: { type: "something-else" } });

    expect(setBroadcastModal).not.toHaveBeenCalled();
  });

  it("clears the onmessage handler on unmount", () => {
    const channel = makeChannel();
    const { unmount } = renderHook(() => useBroadcastApi(channel, vi.fn()));
    expect(channel.onmessage).toEqual(expect.any(Function));

    unmount();

    expect(channel.onmessage).toBeNull();
  });

  it("handleUseInThisTab broadcasts activate-tab and hides the modal locally", () => {
    const channel = makeChannel();
    const setBroadcastModal = vi.fn();
    const { result } = renderHook(() =>
      useBroadcastApi(channel, setBroadcastModal),
    );

    result.current();

    expect(channel.postMessage).toHaveBeenCalledWith({ type: "activate-tab" });
    expect(setBroadcastModal).toHaveBeenCalledWith(false);
  });
});
