import jwt from "jsonwebtoken";
import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  type AccessTokenPayload,
} from "../services/jwt";

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  process.env = {
    ...ORIGINAL_ENV,
    ACCESS_JWT_TOKEN: "access-secret",
    REFRESH_TOKEN: "refresh-secret",
  };
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
});

const PAYLOAD: AccessTokenPayload = {
  userId: "u1",
  tenantId: "t1",
  tenantRole: "owner",
  pendingSetup: false,
  orgSetupComplete: true,
  dbName: "hrms-acme",
};

describe("signAccessToken / verifyAccessToken", () => {
  it("round-trips a payload through sign and verify", () => {
    const token = signAccessToken(PAYLOAD);
    const result = verifyAccessToken(token);
    expect(result).toMatchObject(PAYLOAD);
  });

  it("signs with HS256 and the configured expiry", () => {
    process.env.ACCESS_JWT_EXPIRE = "1h";
    const token = signAccessToken(PAYLOAD);
    const decoded = jwt.decode(token, { complete: true });
    expect(decoded?.header.alg).toBe("HS256");
    const payload = decoded?.payload as any;
    expect(payload.exp - payload.iat).toBe(3600);
  });

  it("defaults to a 24h expiry when ACCESS_JWT_EXPIRE is unset", () => {
    delete process.env.ACCESS_JWT_EXPIRE;
    const token = signAccessToken(PAYLOAD);
    const decoded = jwt.decode(token) as any;
    expect(decoded.exp - decoded.iat).toBe(24 * 60 * 60);
  });

  it("returns null for a token signed with a different secret", () => {
    const foreignToken = jwt.sign(PAYLOAD, "wrong-secret", {
      algorithm: "HS256",
    });
    expect(verifyAccessToken(foreignToken)).toBeNull();
  });

  it("returns null for an expired token", () => {
    const expired = jwt.sign(PAYLOAD, "access-secret", {
      algorithm: "HS256",
      expiresIn: -10,
    });
    expect(verifyAccessToken(expired)).toBeNull();
  });

  it("returns null for a malformed token", () => {
    expect(verifyAccessToken("not-a-jwt")).toBeNull();
  });

  it("rejects a token signed with a different algorithm (alg confusion guard)", () => {
    // verifyAccessToken pins algorithms: ["HS256"] — a token claiming HS384
    // (even with the right secret bytes) must not verify.
    const wrongAlg = jwt.sign(PAYLOAD, "access-secret", { algorithm: "HS384" });
    expect(verifyAccessToken(wrongAlg)).toBeNull();
  });
});

describe("signRefreshToken / verifyRefreshToken", () => {
  it("round-trips a userId through sign and verify", () => {
    const token = signRefreshToken("u1");
    expect(verifyRefreshToken(token)).toMatchObject({ userId: "u1" });
  });

  it("defaults to a 30-day expiry when REFRESH_TOKEN_EXPIRE is unset", () => {
    delete process.env.REFRESH_TOKEN_EXPIRE;
    const token = signRefreshToken("u1");
    const decoded = jwt.decode(token) as any;
    expect(decoded.exp - decoded.iat).toBe(30 * 24 * 60 * 60);
  });

  it("returns null for a refresh token verified against the wrong secret", () => {
    const foreign = jwt.sign({ userId: "u1" }, "wrong-secret", {
      algorithm: "HS256",
    });
    expect(verifyRefreshToken(foreign)).toBeNull();
  });

  it("access and refresh tokens are not interchangeable (different secrets)", () => {
    const accessToken = signAccessToken(PAYLOAD);
    expect(verifyRefreshToken(accessToken)).toBeNull();
  });
});
