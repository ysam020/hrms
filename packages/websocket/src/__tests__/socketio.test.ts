let capturedServerArgs: { server: any; options: any } | null = null;
let capturedMiddleware:
  | ((socket: any, next: (err?: Error) => void) => Promise<void>)
  | null = null;

jest.mock("socket.io", () => ({
  Server: jest.fn().mockImplementation(function (
    this: any,
    server: any,
    options: any,
  ) {
    capturedServerArgs = { server, options };
    this.use = (fn: any) => {
      capturedMiddleware = fn;
    };
    return this;
  }),
}));

const mockRedisAdapterInstances: any[] = [];
jest.mock("../RedisWebSocketAdapter", () => ({
  RedisWebSocketAdapter: jest.fn().mockImplementation(function (
    this: any,
    io: any,
  ) {
    this.__io = io;
    mockRedisAdapterInstances.push(this);
    return this;
  }),
}));

import { configureSocketIO } from "../socketio";

function makeSocket(auth: Record<string, any> = {}) {
  return { handshake: { auth } };
}

async function runMiddleware(socket: any) {
  return new Promise<Error | undefined>((resolve) => {
    capturedMiddleware!(socket, (err?: Error) => resolve(err));
  });
}

describe("configureSocketIO", () => {
  const httpServer: any = { __fakeHttpServer: true };

  beforeEach(() => {
    jest.clearAllMocks();
    capturedServerArgs = null;
    capturedMiddleware = null;
    mockRedisAdapterInstances.length = 0;
  });

  it("constructs the socket.io server with CORS scoped to the allowed origins", () => {
    configureSocketIO(httpServer, ["https://app.example.com"]);
    expect(capturedServerArgs!.server).toBe(httpServer);
    expect(capturedServerArgs!.options.cors).toMatchObject({
      origin: ["https://app.example.com"],
      credentials: true,
    });
    expect(capturedServerArgs!.options.transports).toEqual([
      "websocket",
      "polling",
    ]);
  });

  it("wires the resulting io instance into a new RedisWebSocketAdapter and returns both", () => {
    const { io, redisAdapter } = configureSocketIO(httpServer, "*");
    expect(redisAdapter).toBe(mockRedisAdapterInstances[0]);
    expect((redisAdapter as any).__io).toBe(io);
  });

  describe("with a token verifier", () => {
    const verifyToken = jest.fn();

    beforeEach(() => {
      verifyToken.mockReset();
      configureSocketIO(httpServer, "*", verifyToken);
    });

    it("rejects a connection with no token", async () => {
      const err = await runMiddleware(makeSocket());
      expect(err?.message).toBe("Authentication failed: token required");
      expect(verifyToken).not.toHaveBeenCalled();
    });

    it("rejects a connection when the token fails verification", async () => {
      verifyToken.mockResolvedValue(null);
      const err = await runMiddleware(makeSocket({ token: "bad-token" }));
      expect(err?.message).toBe("Authentication failed: invalid token");
    });

    it("accepts a valid token and attaches userId/tenantId/dbName to the socket", async () => {
      verifyToken.mockResolvedValue({
        userId: "u1",
        tenantId: "t1",
        dbName: "tenant_db",
      });
      const socket = makeSocket({ token: "good-token" });
      const err = await runMiddleware(socket);

      expect(err).toBeUndefined();
      expect(socket.userId).toBe("u1");
      expect(socket.tenantId).toBe("t1");
      expect(socket.dbName).toBe("tenant_db");
    });

    it("defaults dbName to null when the verifier omits it", async () => {
      verifyToken.mockResolvedValue({ userId: "u1", tenantId: null });
      const socket = makeSocket({ token: "good-token" });
      await runMiddleware(socket);
      expect(socket.dbName).toBeNull();
    });

    it("rejects the connection when the verifier throws", async () => {
      verifyToken.mockRejectedValue(new Error("jwks fetch failed"));
      const err = await runMiddleware(makeSocket({ token: "any-token" }));
      expect(err?.message).toBe("Authentication failed");
    });
  });

  describe("without a token verifier (local dev fallback)", () => {
    beforeEach(() => {
      configureSocketIO(httpServer, "*");
    });

    it("rejects a connection with no userId", async () => {
      const err = await runMiddleware(makeSocket());
      expect(err?.message).toBe("Authentication failed: userId is required");
    });

    it("accepts a connection with a userId and sets dbName to null", async () => {
      const socket = makeSocket({ userId: "u1" });
      const err = await runMiddleware(socket);
      expect(err).toBeUndefined();
      expect(socket.userId).toBe("u1");
      expect(socket.dbName).toBeNull();
    });
  });
});
