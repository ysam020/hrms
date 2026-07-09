import { isLocalDevEnvironment } from "../utils/devSeedGuard";

describe("isLocalDevEnvironment", () => {
  const original = process.env.CLIENT_URL;

  afterEach(() => {
    if (original === undefined) delete process.env.CLIENT_URL;
    else process.env.CLIENT_URL = original;
  });

  it("returns true when CLIENT_URL is the local dev secret's value", () => {
    process.env.CLIENT_URL = "https://localhost";
    expect(isLocalDevEnvironment()).toBe(true);
  });

  it("returns true for https://localhost:5173", () => {
    process.env.CLIENT_URL = "https://localhost:5173";
    expect(isLocalDevEnvironment()).toBe(true);
  });

  it("returns false for the production CLIENT_URL", () => {
    process.env.CLIENT_URL = "https://praesto.cloud,https://www.praesto.cloud";
    expect(isLocalDevEnvironment()).toBe(false);
  });

  it("returns false when CLIENT_URL is unset", () => {
    delete process.env.CLIENT_URL;
    expect(isLocalDevEnvironment()).toBe(false);
  });
});
