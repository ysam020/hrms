/**
 * jsdom doesn't implement IndexedDB, so this is a minimal in-memory fake of the
 * subset of the API `@web/core/db` actually uses (single-key object stores,
 * one simple "roomId" index). It's installed as `global.indexedDB` before the
 * module under test is imported, so the module's real `openDB()`/`tx()` logic
 * runs unmodified against it.
 */
function installFakeIndexedDB() {
  const stores: Record<
    string,
    { keyPath: string; data: Map<any, any>; indexes: Record<string, string> }
  > = {};
  let opened = false;

  function makeRequest(): any {
    return {
      onsuccess: null,
      onerror: null,
      result: undefined,
      error: undefined,
    };
  }
  function succeed(req: any, result: any) {
    req.result = result;
    queueMicrotask(() => req.onsuccess && req.onsuccess({ target: req }));
  }

  function storeHandle(name: string) {
    const store = stores[name];
    return {
      put(value: any) {
        const req = makeRequest();
        store.data.set(value[store.keyPath], value);
        succeed(req, value[store.keyPath]);
        return req;
      },
      get(key: any) {
        const req = makeRequest();
        succeed(req, store.data.get(key));
        return req;
      },
      delete(key: any) {
        const req = makeRequest();
        store.data.delete(key);
        succeed(req, undefined);
        return req;
      },
      clear() {
        const req = makeRequest();
        store.data.clear();
        succeed(req, undefined);
        return req;
      },
      getAll() {
        const req = makeRequest();
        succeed(req, Array.from(store.data.values()));
        return req;
      },
      getAllKeys() {
        const req = makeRequest();
        succeed(req, Array.from(store.data.keys()));
        return req;
      },
      createIndex(indexName: string, keyPath: string) {
        store.indexes[indexName] = keyPath;
      },
      index(indexName: string) {
        const keyPath = store.indexes[indexName];
        return {
          getAll(value: any) {
            const req = makeRequest();
            succeed(
              req,
              Array.from(store.data.values()).filter(
                (r: any) => r[keyPath] === value,
              ),
            );
            return req;
          },
          getAllKeys(value: any) {
            const req = makeRequest();
            succeed(
              req,
              Array.from(store.data.entries())
                .filter(([, r]: any) => r[keyPath] === value)
                .map(([k]) => k),
            );
            return req;
          },
        };
      },
    };
  }

  const fakeDb: any = {
    objectStoreNames: { contains: (n: string) => !!stores[n] },
    createObjectStore(name: string, opts: { keyPath: string }) {
      stores[name] = { keyPath: opts.keyPath, data: new Map(), indexes: {} };
      return storeHandle(name);
    },
    transaction(name: string) {
      return { objectStore: (n: string) => storeHandle(n) };
    },
    close() {},
  };

  (global as any).indexedDB = {
    open() {
      const req: any = {
        onupgradeneeded: null,
        onsuccess: null,
        onerror: null,
        result: undefined,
      };
      queueMicrotask(() => {
        if (!opened) {
          opened = true;
          req.onupgradeneeded &&
            req.onupgradeneeded({ target: { result: fakeDb } });
        }
        req.result = fakeDb;
        req.onsuccess && req.onsuccess({ target: { result: fakeDb } });
      });
      return req;
    },
  };

  return {
    reset() {
      Object.values(stores).forEach((s) => s.data.clear());
    },
  };
}

const fakeIdb = installFakeIndexedDB();

const {
  getPaginationCache,
  setPaginationCache,
  invalidatePaginationCache,
  getAnalyticsCache,
  setAnalyticsCache,
  invalidateAnalyticsCache,
  saveMessage,
  saveMessages,
  getMessagesByRoom,
  patchMessage,
  deleteMessageFromDB,
  deleteRoomMessages,
  saveConversation,
  saveConversations,
  getConversations,
  deleteConversationFromDB,
  saveNotification,
  saveNotifications,
  getNotifications,
  pruneNotifications,
  enqueueMessage,
  dequeueMessage,
  getPendingMessages,
  clearPendingMessages,
} = await import("@web/core/db");

describe("core/db pagination cache", () => {
  beforeEach(() => {
    fakeIdb.reset();
    vi.useRealTimers();
  });

  it("returns null for a key that was never cached", async () => {
    expect(await getPaginationCache("employees:p0:s10")).toBeNull();
  });

  it("stores and retrieves a page", async () => {
    await setPaginationCache("employees:p0:s10", [{ id: 1 }], 42);
    expect(await getPaginationCache("employees:p0:s10")).toEqual({
      data: [{ id: 1 }],
      totalCount: 42,
    });
  });

  it("expires a cached page after the 2-minute TTL", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    await setPaginationCache("employees:p0:s10", [{ id: 1 }], 1);

    vi.setSystemTime(new Date("2026-01-01T00:01:59Z"));
    expect(await getPaginationCache("employees:p0:s10")).not.toBeNull();

    vi.setSystemTime(new Date("2026-01-01T00:02:01Z"));
    expect(await getPaginationCache("employees:p0:s10")).toBeNull();
    vi.useRealTimers();
  });

  it("invalidates only keys matching the given prefix", async () => {
    await setPaginationCache("employees:p0:s10", [{ id: 1 }], 1);
    await setPaginationCache("employees:p1:s10", [{ id: 2 }], 1);
    await setPaginationCache("jobs:p0:s10", [{ id: 3 }], 1);

    await invalidatePaginationCache("employees:");

    expect(await getPaginationCache("employees:p0:s10")).toBeNull();
    expect(await getPaginationCache("employees:p1:s10")).toBeNull();
    expect(await getPaginationCache("jobs:p0:s10")).not.toBeNull();
  });

  it("invalidates every key when no prefix is given", async () => {
    await setPaginationCache("employees:p0:s10", [{ id: 1 }], 1);
    await setPaginationCache("jobs:p0:s10", [{ id: 3 }], 1);

    await invalidatePaginationCache(undefined);

    expect(await getPaginationCache("employees:p0:s10")).toBeNull();
    expect(await getPaginationCache("jobs:p0:s10")).toBeNull();
  });
});

describe("core/db analytics cache", () => {
  beforeEach(() => {
    fakeIdb.reset();
  });

  it("stores and retrieves data using the default 5-minute TTL", async () => {
    await setAnalyticsCache("/attendance-insights", { rate: 90 });
    expect(await getAnalyticsCache("/attendance-insights")).toEqual({
      rate: 90,
    });
  });

  it("expires after the default TTL", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    await setAnalyticsCache("/attendance-insights", { rate: 90 });

    vi.setSystemTime(new Date("2026-01-01T00:05:01Z"));
    expect(await getAnalyticsCache("/attendance-insights")).toBeNull();
    vi.useRealTimers();
  });

  it("honors a custom TTL override", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    await setAnalyticsCache("/attendance-insights", { rate: 90 }, 1000);

    vi.setSystemTime(new Date("2026-01-01T00:00:01.001Z"));
    expect(await getAnalyticsCache("/attendance-insights")).toBeNull();
    vi.useRealTimers();
  });

  it("invalidates entries whose key contains the given pattern", async () => {
    await setAnalyticsCache("/attendance-insights", { a: 1 });
    await setAnalyticsCache("/payroll-insights", { b: 2 });

    await invalidateAnalyticsCache("attendance");

    expect(await getAnalyticsCache("/attendance-insights")).toBeNull();
    expect(await getAnalyticsCache("/payroll-insights")).toEqual({ b: 2 });
  });
});

describe("core/db messages", () => {
  beforeEach(() => {
    fakeIdb.reset();
  });

  it("saves and retrieves messages scoped to a room", async () => {
    await saveMessages([
      { _id: "m1", roomId: "r1", text: "hi" },
      { _id: "m2", roomId: "r2", text: "other room" },
    ]);
    const messages = await getMessagesByRoom("r1");
    expect(messages).toEqual([{ _id: "m1", roomId: "r1", text: "hi" }]);
  });

  it("no-ops when saving an empty message list", async () => {
    await expect(saveMessages([])).resolves.toBeUndefined();
  });

  it("patches an existing message by merging fields", async () => {
    await saveMessage({ _id: "m1", roomId: "r1", text: "hi", status: "sent" });
    await patchMessage("m1", { status: "read" });
    const [msg] = (await getMessagesByRoom("r1")) as any[];
    expect(msg).toEqual({
      _id: "m1",
      roomId: "r1",
      text: "hi",
      status: "read",
    });
  });

  it("is a no-op when patching a message that doesn't exist", async () => {
    await expect(
      patchMessage("missing", { status: "read" }),
    ).resolves.toBeUndefined();
  });

  it("deletes a single message and all messages in a room", async () => {
    await saveMessages([
      { _id: "m1", roomId: "r1" },
      { _id: "m2", roomId: "r1" },
    ]);
    await deleteMessageFromDB("m1");
    expect(await getMessagesByRoom("r1")).toEqual([
      { _id: "m2", roomId: "r1" },
    ]);

    await deleteRoomMessages("r1");
    expect(await getMessagesByRoom("r1")).toEqual([]);
  });
});

describe("core/db conversations", () => {
  beforeEach(() => {
    fakeIdb.reset();
  });

  it("saves and lists conversations, and deletes one by id", async () => {
    await saveConversations([{ _id: "c1" }, { _id: "c2" }]);
    expect(await getConversations()).toHaveLength(2);

    await saveConversation({ _id: "c3" });
    expect(await getConversations()).toHaveLength(3);

    await deleteConversationFromDB("c2");
    const remaining = (await getConversations()) as any[];
    expect(remaining.map((c) => c._id).sort()).toEqual(["c1", "c3"]);
  });
});

describe("core/db notifications", () => {
  beforeEach(() => {
    fakeIdb.reset();
  });

  it("returns notifications sorted newest-first", async () => {
    await saveNotifications([
      { _id: "n1", timeStamp: "2026-01-01T00:00:00Z" },
      { _id: "n2", timeStamp: "2026-01-03T00:00:00Z" },
      { _id: "n3", timeStamp: "2026-01-02T00:00:00Z" },
    ]);
    const notifications = (await getNotifications()) as any[];
    expect(notifications.map((n) => n._id)).toEqual(["n2", "n3", "n1"]);
  });

  it("does nothing when under the max count", async () => {
    await saveNotification({ _id: "n1", timeStamp: "2026-01-01T00:00:00Z" });
    await pruneNotifications(200);
    expect(await getNotifications()).toHaveLength(1);
  });

  it("prunes down to the max count, keeping the most recent", async () => {
    await saveNotifications([
      { _id: "n1", timeStamp: "2026-01-01T00:00:00Z" },
      { _id: "n2", timeStamp: "2026-01-02T00:00:00Z" },
      { _id: "n3", timeStamp: "2026-01-03T00:00:00Z" },
    ]);
    await pruneNotifications(2);
    const remaining = (await getNotifications()) as any[];
    expect(remaining.map((n) => n._id)).toEqual(["n3", "n2"]);
  });
});

describe("core/db message outbox", () => {
  beforeEach(() => {
    fakeIdb.reset();
  });

  it("enqueues, lists, and dequeues pending messages", async () => {
    await enqueueMessage("t1", "r1", { text: "hi" });
    const pending = (await getPendingMessages()) as any[];
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      tempId: "t1",
      roomId: "r1",
      payload: { text: "hi" },
    });

    await dequeueMessage("t1");
    expect(await getPendingMessages()).toEqual([]);
  });

  it("clears every pending message", async () => {
    await enqueueMessage("t1", "r1", { text: "hi" });
    await enqueueMessage("t2", "r1", { text: "hi2" });
    await clearPendingMessages();
    expect(await getPendingMessages()).toEqual([]);
  });
});
