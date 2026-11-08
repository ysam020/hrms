import { EventEmitter } from "events";

const mockPublish = jest.fn();
jest.mock("../client", () => ({
  getRedisClient: () => ({ publish: (...a: unknown[]) => mockPublish(...a) }),
}));
const subs: any[] = [];
jest.mock("ioredis", () =>
  jest.fn().mockImplementation(() => {
    const s: any = new EventEmitter();
    s.subscribe = jest.fn().mockResolvedValue(1);
    s.quit = jest.fn().mockResolvedValue("OK");
    s.disconnect = jest.fn();
    subs.push(s);
    return s;
  }),
);
jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import {
  publishAccountRevocation,
  subscribeAccountRevocations,
  ACCOUNT_REVOCATION_CHANNEL,
} from "../accountRevocation";

beforeEach(() => mockPublish.mockReset().mockResolvedValue(2));

describe("account revocation channel", () => {
  it("publishes a person's revocation with a timestamp", async () => {
    expect(
      await publishAccountRevocation({ userId: "u1", reason: "terminated" }),
    ).toBe(true);
    const [channel, body] = mockPublish.mock.calls[0];
    expect(channel).toBe(ACCOUNT_REVOCATION_CHANNEL);
    expect(JSON.parse(body)).toEqual({
      userId: "u1",
      reason: "terminated",
      at: expect.any(Number),
    });
  });

  it("refuses a message without userId or tenantId", async () => {
    expect(await publishAccountRevocation({ reason: "x" })).toBe(false);
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it("never throws when Redis is down (the change is already committed; TTL backstop)", async () => {
    mockPublish.mockRejectedValue(new Error("down"));
    await expect(
      publishAccountRevocation({ userId: "u1", reason: "t" }),
    ).resolves.toBe(false);
  });

  it("delivers messages and calls onResync only on RE-connect", async () => {
    const got: any[] = [];
    const onResync = jest.fn();
    const close = subscribeAccountRevocations((r) => got.push(r), onResync);
    const s = subs.at(-1);
    expect(s.subscribe).toHaveBeenCalledWith(ACCOUNT_REVOCATION_CHANNEL);
    s.emit("ready");
    expect(onResync).not.toHaveBeenCalled();
    s.emit(
      "message",
      ACCOUNT_REVOCATION_CHANNEL,
      JSON.stringify({ userId: "u1", reason: "t", at: 1 }),
    );
    s.emit("message", ACCOUNT_REVOCATION_CHANNEL, "not-json");
    s.emit(
      "message",
      ACCOUNT_REVOCATION_CHANNEL,
      JSON.stringify({ reason: "no-target", at: 1 }),
    );
    expect(got).toEqual([{ userId: "u1", reason: "t", at: 1 }]);
    s.emit("ready");
    expect(onResync).toHaveBeenCalledTimes(1);
    await close();
    expect(s.quit).toHaveBeenCalled();
  });
});
