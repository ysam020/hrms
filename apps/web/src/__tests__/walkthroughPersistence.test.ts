import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createProgressStore,
  localAdapter,
  localKey,
  writeRunningMarker,
  type ProgressAdapter,
} from "@next/walkthrough/persistence";
import { emptyState, start } from "@next/walkthrough/engine";
import { APP_TOUR, type ResolvedStep } from "@next/walkthrough/types";

// Saving and loading walkthrough progress: per-person isolation, the
// local + server copies, and failures on either side.

vi.mock("@next/lib/api", () => ({ apiClient: {}, unwrap: (r: any) => r }));

const steps: ResolvedStep[] = [
  {
    id: "a.1",
    module: "a",
    moduleLabel: "A",
    target: ["x"],
    title: "",
    content: "",
    route: "/a",
    placement: "bottom",
  },
];
const running = (at = "2026-10-01T00:00:00.000Z") => ({
  ...start(emptyState(), APP_TOUR, steps),
  updatedAt: at,
});

function memoryRemote(initial: unknown = null) {
  let stored = initial;
  const r = {
    load: vi.fn(async () => stored),
    save: vi.fn(async (s: unknown) => void (stored = s)),
    clear: vi.fn(async () => void (stored = null)),
    get stored() {
      return stored;
    },
  };
  return r;
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("local copy", () => {
  it("is namespaced by tenant and user", async () => {
    const a = localAdapter("t1:alice");
    await a.save(running());
    expect(localStorage.getItem(localKey("t1:alice"))).toBeTruthy();
    expect(await localAdapter("t1:bob").load()).toBeNull();
    expect(await localAdapter("t2:alice").load()).toBeNull();
  });

  it("survives storage that throws", async () => {
    vi.spyOn(localStorage, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    const a = localAdapter("t1:alice");
    await expect(a.save(running())).resolves.toBeUndefined();
    await expect(a.load()).resolves.toBeNull();
  });

  it("treats a corrupt value as nothing saved", async () => {
    localStorage.setItem(localKey("t1:alice"), "{not json");
    expect(await localAdapter("t1:alice").load()).toBeNull();
  });
});

describe("progress store", () => {
  it("restores the server copy after a refresh (paused unless this tab ran it)", async () => {
    const remote = memoryRemote(running());
    const store = createProgressStore("t1:alice", { remote });
    const s = await store.load();
    expect(s?.tours.app.status).toBe("paused");

    writeRunningMarker("t1:alice", APP_TOUR);
    const again = await createProgressStore("t1:alice", { remote }).load();
    expect(again?.tours.app.status).toBe("running");
  });

  it("falls back to the local copy when the server fails", async () => {
    await localAdapter("t1:alice").save(running());
    const remote: ProgressAdapter = {
      load: vi.fn().mockRejectedValue(new Error("offline")),
      save: vi.fn(),
      clear: vi.fn(),
    };
    const s = await createProgressStore("t1:alice", { remote }).load();
    expect(s?.tours.app.stepId).toBe("a.1");
    expect(remote.save).not.toHaveBeenCalled();
  });

  it("pushes a newer local copy up to the server", async () => {
    await localAdapter("t1:alice").save(running("2026-10-05T00:00:00.000Z"));
    const remote = memoryRemote(running("2026-10-01T00:00:00.000Z"));
    const s = await createProgressStore("t1:alice", { remote }).load();
    expect(s?.updatedAt).toBe("2026-10-05T00:00:00.000Z");
    await vi.runAllTimersAsync();
    expect(remote.save).toHaveBeenCalledTimes(1);
  });

  it("ignores invalid saved data", async () => {
    const remote = memoryRemote({ schema: 42, tours: "nope" });
    expect(await createProgressStore("t1:alice", { remote }).load()).toBeNull();
  });

  it("saves locally at once and coalesces server saves", async () => {
    const remote = memoryRemote();
    const store = createProgressStore("t1:alice", { remote, delay: 500 });
    store.save(running("2026-10-01T00:00:00.000Z"));
    store.save(running("2026-10-02T00:00:00.000Z"));
    store.save(running("2026-10-03T00:00:00.000Z"));
    expect(
      JSON.parse(localStorage.getItem(localKey("t1:alice"))!).updatedAt,
    ).toBe("2026-10-03T00:00:00.000Z");
    expect(remote.save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);
    expect(remote.save).toHaveBeenCalledTimes(1);
    expect((remote.stored as any).updatedAt).toBe("2026-10-03T00:00:00.000Z");
  });

  it("retries a failed server save on flush", async () => {
    const remote = memoryRemote();
    remote.save.mockRejectedValueOnce(new Error("500"));
    const store = createProgressStore("t1:alice", { remote, delay: 100 });
    store.save(running());
    await vi.advanceTimersByTimeAsync(100);
    expect(remote.save).toHaveBeenCalledTimes(1);
    await store.flush();
    expect(remote.save).toHaveBeenCalledTimes(2);
    expect(remote.stored).toBeTruthy();
  });

  it("sends nothing after dispose (the next person's token)", async () => {
    const remote = memoryRemote();
    const store = createProgressStore("t1:alice", { remote, delay: 100 });
    store.save(running());
    store.dispose();
    await vi.advanceTimersByTimeAsync(1000);
    await store.flush();
    store.save(running());
    await vi.advanceTimersByTimeAsync(1000);
    expect(remote.save).not.toHaveBeenCalled();
  });
});
