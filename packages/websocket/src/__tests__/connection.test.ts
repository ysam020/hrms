const instances: any[] = [];

jest.mock("ioredis", () => {
  return jest.fn().mockImplementation(() => {
    const inst: any = {
      status: "ready",
      on: jest.fn(),
      disconnect: jest.fn().mockResolvedValue(undefined),
    };
    instances.push(inst);
    return inst;
  });
});

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

import {
  getWebSocketRedis,
  closeWebSocketRedisConnections,
} from "../connection";

describe("getWebSocketRedis", () => {
  beforeEach(() => {
    instances.length = 0;
    jest.clearAllMocks();
  });

  afterEach(async () => {
    // See the closeWebSocketRedisConnections describe block below for why
    // fake timers are needed here too.
    jest.useFakeTimers();
    await closeWebSocketRedisConnections();
    jest.useRealTimers();
  });

  it("creates one connection per distinct type", () => {
    const pub = getWebSocketRedis("publisher");
    const sub = getWebSocketRedis("subscriber");
    const client = getWebSocketRedis("client");
    expect(pub).not.toBe(sub);
    expect(sub).not.toBe(client);
    expect(instances).toHaveLength(3);
  });

  it("reuses the same connection for repeated calls with the same type", () => {
    const a = getWebSocketRedis("publisher");
    const b = getWebSocketRedis("publisher");
    expect(a).toBe(b);
    expect(instances).toHaveLength(1);
  });
});

describe("closeWebSocketRedisConnections", () => {
  beforeEach(() => {
    instances.length = 0;
    jest.clearAllMocks();
    // closeWebSocketRedisConnections races each disconnect() against a real
    // 5173ms setTimeout fallback — even when disconnect() wins the race,
    // that timer handle isn't cancelled and holds the process open past
    // the test run. Fake timers keep it from leaking.
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("disconnects every open connection and clears the pool", async () => {
    const pub = getWebSocketRedis("publisher") as any;
    const sub = getWebSocketRedis("subscriber") as any;

    await closeWebSocketRedisConnections();

    expect(pub.disconnect).toHaveBeenCalled();
    expect(sub.disconnect).toHaveBeenCalled();

    // Pool was cleared — a subsequent get creates a brand new connection.
    const pubAgain = getWebSocketRedis("publisher");
    expect(pubAgain).not.toBe(pub);
  });

  it("skips connections that are already ended/closed", async () => {
    const pub = getWebSocketRedis("publisher") as any;
    pub.status = "end";

    await closeWebSocketRedisConnections();

    expect(pub.disconnect).not.toHaveBeenCalled();
  });

  it("does not throw when a disconnect rejects", async () => {
    const pub = getWebSocketRedis("publisher") as any;
    pub.disconnect.mockRejectedValue(new Error("disconnect failed"));

    await expect(closeWebSocketRedisConnections()).resolves.toBeUndefined();
  });
});
