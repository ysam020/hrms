import { readFileSync } from "fs";

const mockSend = jest.fn();

jest.mock("@aws-sdk/client-secrets-manager", () => ({
  SecretsManagerClient: jest
    .fn()
    .mockImplementation(() => ({ send: mockSend })),
  GetSecretValueCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

jest.mock("fs", () => ({ readFileSync: jest.fn() }));

import {
  loadSecrets,
  REQUIRED_SECRET_KEYS,
  DEPLOY_ENVIRONMENTS,
} from "../loadSecrets";

// A complete, correctly-tagged secret for the given environment.
const complete = (env: string, extra: Record<string, unknown> = {}) => ({
  SECRET_ENV: env,
  DEV_MONGODB_URI: `mongodb://${env}-mongo/hrms`,
  REDIS_URL: `redis://${env}-redis:6379`,
  ACCESS_JWT_TOKEN: "a",
  REFRESH_TOKEN: "r",
  ...extra,
});

describe("loadSecrets (fail-closed)", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
    for (const k of [
      "LOCAL_SECRETS_FILE",
      "AWS_SECRET_NAME",
      "DEPLOY_ENV",
      "SECRET_ENV",
      ...REQUIRED_SECRET_KEYS,
    ]) {
      delete process.env[k];
    }
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  describe("no production fallback", () => {
    it("refuses to start without DEPLOY_ENV", async () => {
      process.env.AWS_SECRET_NAME = "hrms/config/staging";
      await expect(loadSecrets("hrms/config")).rejects.toThrow(
        /DEPLOY_ENV is not set/,
      );
      expect(mockSend).not.toHaveBeenCalled();
    });

    it("refuses to start without AWS_SECRET_NAME — never falls back to the passed-in name", async () => {
      process.env.DEPLOY_ENV = "staging";
      await expect(loadSecrets("hrms/config")).rejects.toThrow(
        /AWS_SECRET_NAME is not set/,
      );
      expect(mockSend).not.toHaveBeenCalled();
    });

    it("fetches exactly AWS_SECRET_NAME", async () => {
      process.env.DEPLOY_ENV = "staging";
      process.env.AWS_SECRET_NAME = "hrms/config/staging";
      mockSend.mockResolvedValue({
        SecretString: JSON.stringify(complete("staging")),
      });
      await loadSecrets("hrms/config");
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({ input: { SecretId: "hrms/config/staging" } }),
      );
      expect(process.env.DEV_MONGODB_URI).toBe("mongodb://staging-mongo/hrms");
    });
  });

  describe("known environments only", () => {
    it.each(["prod", "Production", "stage", "dev", "local"])(
      "refuses an unknown DEPLOY_ENV (%s) before fetching anything",
      async (value) => {
        process.env.DEPLOY_ENV = value;
        process.env.AWS_SECRET_NAME = "hrms/config-production";
        await expect(loadSecrets()).rejects.toThrow(/is not one of/);
        expect(mockSend).not.toHaveBeenCalled();
      },
    );

    it("accepts exactly production | staging | development | test", () => {
      expect([...DEPLOY_ENVIRONMENTS]).toEqual([
        "production",
        "staging",
        "development",
        "test",
      ]);
    });
  });

  describe("development and production cannot load each other's secret", () => {
    it("development refuses the production secret", async () => {
      process.env.DEPLOY_ENV = "development";
      process.env.AWS_SECRET_NAME = "hrms/config-production";
      mockSend.mockResolvedValue({
        SecretString: JSON.stringify(complete("production")),
      });
      await expect(loadSecrets()).rejects.toThrow(
        /does not match DEPLOY_ENV "development"/,
      );
      expect(process.env.DEV_MONGODB_URI).toBeUndefined();
    });

    it("production refuses the development secret", async () => {
      process.env.DEPLOY_ENV = "production";
      process.env.AWS_SECRET_NAME = "hrms/dev/config";
      mockSend.mockResolvedValue({
        SecretString: JSON.stringify(complete("development")),
      });
      await expect(loadSecrets()).rejects.toThrow(
        /does not match DEPLOY_ENV "production"/,
      );
      expect(process.env.DEV_MONGODB_URI).toBeUndefined();
    });

    it("an untagged legacy secret (today's hrms/config) is refused by every environment", async () => {
      for (const env of ["production", "development"]) {
        process.env.DEPLOY_ENV = env;
        process.env.AWS_SECRET_NAME = "hrms/config";
        const { SECRET_ENV: _omit, ...legacy } = complete(env);
        mockSend.mockResolvedValue({ SecretString: JSON.stringify(legacy) });
        await expect(loadSecrets()).rejects.toThrow(/missing SECRET_ENV/);
      }
    });
  });

  describe("environment tag", () => {
    it("a staging deployment handed the PRODUCTION secret refuses to start and sets nothing", async () => {
      process.env.DEPLOY_ENV = "staging";
      process.env.AWS_SECRET_NAME = "hrms/config"; // the mistake
      mockSend.mockResolvedValue({
        SecretString: JSON.stringify(complete("production")),
      });
      await expect(loadSecrets()).rejects.toThrow(
        /"production" does not match DEPLOY_ENV "staging"/,
      );
      expect(process.env.DEV_MONGODB_URI).toBeUndefined();
    });

    it("a secret without SECRET_ENV is refused", async () => {
      process.env.DEPLOY_ENV = "production";
      process.env.AWS_SECRET_NAME = "hrms/config";
      const { SECRET_ENV: _omit, ...untagged } = complete("production");
      mockSend.mockResolvedValue({ SecretString: JSON.stringify(untagged) });
      await expect(loadSecrets()).rejects.toThrow(/missing SECRET_ENV/);
    });

    it("an environment variable cannot vouch for the secret (SECRET_ENV is read from the secret only)", async () => {
      process.env.DEPLOY_ENV = "staging";
      process.env.SECRET_ENV = "staging";
      process.env.AWS_SECRET_NAME = "hrms/config";
      mockSend.mockResolvedValue({
        SecretString: JSON.stringify(complete("production")),
      });
      await expect(loadSecrets()).rejects.toThrow(/does not match/);
    });
  });

  describe("required keys", () => {
    it("a secret missing a required key refuses to start, naming the key", async () => {
      process.env.DEPLOY_ENV = "staging";
      process.env.AWS_SECRET_NAME = "hrms/config/staging";
      const { REDIS_URL: _omit, ...partial } = complete("staging");
      mockSend.mockResolvedValue({ SecretString: JSON.stringify(partial) });
      await expect(loadSecrets()).rejects.toThrow(
        "Missing required configuration: REDIS_URL",
      );
    });

    it("a required key provided by the environment satisfies the check", async () => {
      process.env.DEPLOY_ENV = "staging";
      process.env.AWS_SECRET_NAME = "hrms/config/staging";
      process.env.REDIS_URL = "redis://compose-redis:6379";
      const { REDIS_URL: _omit, ...partial } = complete("staging");
      mockSend.mockResolvedValue({ SecretString: JSON.stringify(partial) });
      await loadSecrets();
      expect(process.env.REDIS_URL).toBe("redis://compose-redis:6379");
    });
  });

  describe("local file (development only)", () => {
    it("loads LOCAL_SECRETS_FILE without calling AWS", async () => {
      process.env.DEPLOY_ENV = "development";
      process.env.LOCAL_SECRETS_FILE = "/tmp/secrets.json";
      (readFileSync as jest.Mock).mockReturnValue(
        JSON.stringify(complete("development", { MY_SECRET: "from-file" })),
      );
      await loadSecrets("hrms/config");
      expect(process.env.MY_SECRET).toBe("from-file");
      expect(mockSend).not.toHaveBeenCalled();
    });

    it.each(["production", "staging"])(
      "refuses LOCAL_SECRETS_FILE when DEPLOY_ENV=%s",
      async (env) => {
        process.env.DEPLOY_ENV = env;
        process.env.LOCAL_SECRETS_FILE = "/tmp/secrets.json";
        await expect(loadSecrets()).rejects.toThrow(
          /LOCAL_SECRETS_FILE is not allowed/,
        );
        expect(readFileSync).not.toHaveBeenCalled();
      },
    );

    it("does not override an already-set environment variable", async () => {
      process.env.DEPLOY_ENV = "development";
      process.env.LOCAL_SECRETS_FILE = "/tmp/secrets.json";
      process.env.MY_SECRET = "already-set";
      (readFileSync as jest.Mock).mockReturnValue(
        JSON.stringify(complete("development", { MY_SECRET: "from-file" })),
      );
      await loadSecrets();
      expect(process.env.MY_SECRET).toBe("already-set");
    });
  });

  describe("malformed secrets", () => {
    beforeEach(() => {
      process.env.DEPLOY_ENV = "staging";
      process.env.AWS_SECRET_NAME = "hrms/config/staging";
    });

    it("throws when the secret response has no string value", async () => {
      mockSend.mockResolvedValue({ SecretString: undefined });
      await expect(loadSecrets()).rejects.toThrow("Secret has no string value");
    });

    it("throws when the secret string is not valid JSON", async () => {
      mockSend.mockResolvedValue({ SecretString: "not-json{" });
      await expect(loadSecrets()).rejects.toThrow(
        "Secret contains invalid JSON",
      );
    });
  });
});
