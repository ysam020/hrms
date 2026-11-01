import { assertConfirmedWriteTarget, databaseHost } from "../scriptGuard";

// Synthetic URIs only.
const SRV =
  "mongodb+srv://user:s3cret@cluster9.example.mongodb.net/hrms-x?retryWrites=true";
const LOCAL = "mongodb://localhost:27017/hrms?replicaSet=rs0";

describe("scriptGuard", () => {
  it("extracts the host without credentials", () => {
    expect(databaseHost(SRV)).toBe("cluster9.example.mongodb.net");
    expect(databaseHost(LOCAL)).toBe("localhost:27017");
    expect(databaseHost(undefined)).toBeNull();
    expect(databaseHost("postgres://x")).toBeNull();
  });

  it("refuses unless the operator names the exact target host", () => {
    expect(() => assertConfirmedWriteTarget("seed", SRV, undefined)).toThrow(
      /refused/,
    );
    expect(() =>
      assertConfirmedWriteTarget("seed", SRV, "localhost:27017"),
    ).toThrow(/refused/);
    expect(() =>
      assertConfirmedWriteTarget("seed", SRV, "cluster9.example.mongodb.net"),
    ).not.toThrow();
  });

  it("never echoes credentials in the refusal message", () => {
    try {
      assertConfirmedWriteTarget("seed", SRV, undefined);
    } catch (e) {
      expect((e as Error).message).not.toContain("s3cret");
      expect((e as Error).message).not.toContain("user:");
    }
  });

  it("refuses when no database URI is configured", () => {
    expect(() => assertConfirmedWriteTarget("seed", undefined, "x")).toThrow(
      /missing/,
    );
  });
});
