import jwt from "jsonwebtoken";

let capturedOptions: any;

jest.mock("csrf-csrf", () => ({
  doubleCsrf: jest.fn((options: any) => {
    capturedOptions = options;
    return {
      generateCsrfToken: jest.fn(),
      doubleCsrfProtection: jest.fn(),
    };
  }),
}));

describe("csrf config", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV, CSRF_SECRET: "test-csrf-secret" };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it("ties the session identifier to the authenticated user's id when a valid Bearer token is present", () => {
    require("../config/csrf");
    const token = jwt.sign({ userId: "u1" }, "any-secret");
    const req = {
      headers: { authorization: `Bearer ${token}` },
      ip: "1.2.3.4",
    };
    expect(capturedOptions.getSessionIdentifier(req)).toBe("u1");
  });

  it("falls back to the request IP when there is no Bearer token", () => {
    require("../config/csrf");
    const req = { headers: {}, ip: "1.2.3.4" };
    expect(capturedOptions.getSessionIdentifier(req)).toBe("1.2.3.4");
  });

  it("falls back to the request IP when the token is malformed", () => {
    require("../config/csrf");
    const req = {
      headers: { authorization: "Bearer not-a-jwt" },
      ip: "1.2.3.4",
    };
    expect(capturedOptions.getSessionIdentifier(req)).toBe("1.2.3.4");
  });

  it("falls back to an empty string when there is neither a token nor an IP", () => {
    require("../config/csrf");
    const req = { headers: {}, ip: undefined };
    expect(capturedOptions.getSessionIdentifier(req)).toBe("");
  });

  it("reads the CSRF token from the x-csrf-token header", () => {
    require("../config/csrf");
    const req = { headers: { "x-csrf-token": "abc123" } };
    expect(capturedOptions.getCsrfTokenFromRequest(req)).toBe("abc123");
  });

  it("marks the cookie secure only in production", () => {
    process.env.NODE_ENV = "production";
    require("../config/csrf");
    expect(capturedOptions.cookieOptions.secure).toBe(true);

    jest.resetModules();
    process.env.NODE_ENV = "development";
    require("../config/csrf");
    expect(capturedOptions.cookieOptions.secure).toBe(false);
  });

  it("configures httpOnly, sameSite=strict cookies scoped to the whole app", () => {
    require("../config/csrf");
    expect(capturedOptions.cookieOptions).toMatchObject({
      httpOnly: true,
      sameSite: "strict",
      path: "/",
    });
    expect(capturedOptions.cookieName).toBe("csrf-token");
  });
});
