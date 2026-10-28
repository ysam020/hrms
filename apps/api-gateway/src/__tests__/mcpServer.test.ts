// The MCP protocol layer: discovery and call-time enforcement, driven
// through a real McpServer from the official SDK (in-memory transport).
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

jest.mock("@hrms/logger", () => ({
  apiRequestLogger: jest.fn(),
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  mcpToolCallsTotal: { inc: jest.fn() },
  mcpToolCallDuration: { observe: jest.fn() },
}));
jest.mock("../config/rateLimiters", () => ({ redisStore: jest.fn() }));
jest.mock("express-rate-limit", () => ({
  __esModule: true,
  default: jest.fn(() => jest.fn()),
  ipKeyGenerator: jest.fn(),
}));
jest.mock("../mcp/oauth", () => new Proxy({}, { get: () => jest.fn() }));
const mockAudit = jest.fn();
jest.mock("../mcp/audit", () => ({
  recordMcpAudit: (...a: any[]) => mockAudit(...a),
}));
jest.mock("../mcp/principal", () => ({
  McpAuthError: class extends Error {},
  authenticateMcpRequest: jest.fn(),
  runAsTenant: jest.fn((_t: any, _a: any, fn: any) => fn()),
}));

const mockRun = jest.fn();
jest.mock("../mcp/tools", () => {
  const { z } = jest.requireActual("zod");
  class ToolError extends Error {
    constructor(
      public kind: string,
      m: string,
    ) {
      super(m);
    }
  }
  const def = (name: string, scope: string | null) => ({
    name,
    title: name,
    description: name,
    scope,
    input: z.object({ n: z.number().int().max(5).optional() }).strict(),
    run: (args: any, p: any) => mockRun(name, args, p),
  });
  return {
    ToolError,
    TOOLS: [
      def("get_my_profile", "profile:read"),
      def("get_my_salary", "payroll:read"),
      def("list_job_openings", null),
    ],
  };
});

import { buildMcpServer, toolsFor } from "../mcp/router";
import { runAsTenant } from "../mcp/principal";

const principal: any = {
  userId: "u1",
  username: "psharma",
  tenantId: "t1",
  tenantRole: "employee",
  dbName: "hrms-acme",
  scopes: new Set(["profile:read"]),
  clientId: "mcp_abc",
  clientName: "Claude",
  grantId: "g1",
};
const meta = { ipAddress: "1.2.3.4", userAgent: "test" };

async function connect(p: any) {
  const server = buildMcpServer(p, meta);
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "1" });
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}

beforeEach(() =>
  mockRun.mockResolvedValue({ secretValue: "SENSITIVE-RESULT" }),
);

describe("MCP discovery", () => {
  it("lists public tools plus those the token's scopes allow", async () => {
    const client = await connect(principal);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "get_my_profile",
      "list_job_openings",
    ]);
    for (const t of tools) {
      expect(t.annotations?.readOnlyHint).toBe(true);
      expect(t.inputSchema.additionalProperties).toBe(false);
    }
  });

  it("without a principal, lists only public tools", () => {
    expect(toolsFor(null).map((t) => t.name)).toEqual(["list_job_openings"]);
  });
});

describe("MCP tool calls", () => {
  it("run inside the principal's tenant context and return structured content", async () => {
    const client = await connect(principal);
    const res: any = await client.callTool({
      name: "get_my_profile",
      arguments: {},
    });
    expect(res.isError).toBeFalsy();
    expect(res.structuredContent).toEqual({ secretValue: "SENSITIVE-RESULT" });
    expect(runAsTenant).toHaveBeenCalledWith(
      { tenantId: "t1", dbName: "hrms-acme" },
      expect.objectContaining({ userId: "u1" }),
      expect.any(Function),
    );
    expect(mockRun).toHaveBeenCalledWith("get_my_profile", {}, principal);
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "READ", userId: "u1", tenantId: "t1" }),
    );
    // The audit entry carries identifiers only, not results.
    expect(JSON.stringify(mockAudit.mock.calls[0][0])).not.toContain(
      "SENSITIVE-RESULT",
    );
  });

  it("a tool outside the token's scopes can't be called", async () => {
    const client = await connect(principal);
    const res: any = await client
      .callTool({ name: "get_my_salary", arguments: {} })
      .catch((e: Error) => ({ isError: true, error: e }));
    expect(res.isError).toBe(true);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("invalid or smuggled arguments never reach the tool", async () => {
    const client = await connect(principal);
    for (const args of [
      { n: 99 },
      { userId: "someone-else" },
      { tenantId: "t2" },
    ]) {
      const res: any = await client
        .callTool({ name: "get_my_profile", arguments: args })
        .catch((e: Error) => ({ isError: true, error: e }));
      expect(res.isError).toBe(true);
    }
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("internal errors come back generic, with no stack or internals", async () => {
    mockRun.mockRejectedValue(
      new Error(
        "PrismaClientKnownRequestError: connection to mongodb://secret@host failed",
      ),
    );
    const client = await connect(principal);
    const res: any = await client.callTool({
      name: "get_my_profile",
      arguments: {},
    });
    expect(res.isError).toBe(true);
    const text = JSON.stringify(res);
    expect(text).not.toMatch(/Prisma|mongodb|secret|stack/i);
  });

  it("public tools run without any tenant context of their own", async () => {
    const client = await connect(null);
    await client.callTool({ name: "list_job_openings", arguments: {} });
    expect(runAsTenant).not.toHaveBeenCalled();
    expect(mockRun).toHaveBeenCalledWith("list_job_openings", {}, null);
    expect(mockAudit).not.toHaveBeenCalled();
  });
});
