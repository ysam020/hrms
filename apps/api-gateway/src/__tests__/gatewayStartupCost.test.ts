import { readFileSync } from "node:fs";
import { join } from "node:path";

// These packages cost 20-140 MB per worker. Each is needed rarely, so none
// may be imported at module load on the gateway's startup path.
const SRC = join(__dirname, "..");
const read = (f: string) => readFileSync(join(SRC, f), "utf8");

const STATIC_VALUE_IMPORT = (pkg: string) =>
  new RegExp(`^import (?!type )[^;]*from "${pkg}";`, "m");

describe("gateway startup cost", () => {
  it.each([
    ["services/loginEventService.ts", "geoip-lite"],
    ["services/geoLookup.ts", "geoip-lite"],
    ["services/googleCalendar.ts", "googleapis"],
    ["services/onboardingImportParser.ts", "exceljs"],
  ])("%s does not load %s at import", (file, pkg) => {
    expect(read(file)).not.toMatch(STATIC_VALUE_IMPORT(pkg));
  });

  it("does not load the Swagger spec unconditionally", () => {
    expect(read("server.ts")).not.toMatch(/^import .*swaggerSetup/m);
  });
});

describe("geoLookup outside a cluster worker", () => {
  it("looks up in-process and maps the result", async () => {
    jest.resetModules();
    jest.doMock("geoip-lite", () => ({
      lookup: () => ({ country: "IN", city: "X", ll: [1, 2], extra: "y" }),
    }));
    const { lookupGeo } = await import("../services/geoLookup");
    await expect(lookupGeo("203.0.113.1")).resolves.toEqual({
      country: "IN",
      city: "X",
      ll: [1, 2],
    });
  });

  it("resolves null when the lookup fails", async () => {
    jest.resetModules();
    jest.doMock("geoip-lite", () => ({
      lookup: () => {
        throw new Error("no data");
      },
    }));
    const { lookupGeo } = await import("../services/geoLookup");
    await expect(lookupGeo("203.0.113.1")).resolves.toBeNull();
  });
});

describe("serveGeoLookups", () => {
  it("replies to workers and ignores other messages", async () => {
    jest.resetModules();
    jest.doMock("geoip-lite", () => ({
      lookup: () => ({ country: "IN", city: "X", ll: [1, 2] }),
    }));
    const { serveGeoLookups } = await import("../services/geoLookup");
    let handler: any;
    serveGeoLookups({ on: (_: string, h: unknown) => (handler = h) } as any);
    const worker = { isConnected: () => true, send: jest.fn() };
    handler(worker, { type: "unrelated" });
    handler(worker, { type: "geoip:lookup", id: "a", ip: "203.0.113.1" });
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setTimeout(r, 20));
    expect(worker.send).toHaveBeenCalledTimes(1);
    expect(worker.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: "geoip:result", id: "a" }),
    );
  });
});
