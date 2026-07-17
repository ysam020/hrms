import { getBullMQConnection } from "../connection";

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  delete process.env.REDIS_HOST;
  delete process.env.REDIS_PORT;
  delete process.env.REDIS_PASSWORD;
  delete process.env.REDIS_TLS;
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
});

describe("getBullMQConnection", () => {
  it("defaults to 127.0.0.1:6379 with no password/TLS", () => {
    const conn = getBullMQConnection() as any;
    expect(conn.host).toBe("127.0.0.1");
    expect(conn.port).toBe(6379);
    expect(conn.password).toBeUndefined();
    expect(conn.tls).toBeUndefined();
  });

  it("always sets maxRetriesPerRequest:null and enableReadyCheck:false (BullMQ requirement)", () => {
    const conn = getBullMQConnection() as any;
    expect(conn.maxRetriesPerRequest).toBeNull();
    expect(conn.enableReadyCheck).toBe(false);
  });

  it("uses REDIS_HOST/REDIS_PORT from the environment when set", () => {
    process.env.REDIS_HOST = "redis.internal";
    process.env.REDIS_PORT = "6380";
    const conn = getBullMQConnection() as any;
    expect(conn.host).toBe("redis.internal");
    expect(conn.port).toBe(6380);
  });

  it("includes a password only when REDIS_PASSWORD is set", () => {
    process.env.REDIS_PASSWORD = "secret";
    const conn = getBullMQConnection() as any;
    expect(conn.password).toBe("secret");
  });

  it("enables tls only when REDIS_TLS is exactly 'true'", () => {
    process.env.REDIS_TLS = "true";
    expect((getBullMQConnection() as any).tls).toEqual({});

    process.env.REDIS_TLS = "false";
    expect((getBullMQConnection() as any).tls).toBeUndefined();
  });
});
