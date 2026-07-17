import { readFileSync } from "fs";

const mockSend = jest.fn();

jest.mock("@aws-sdk/client-secrets-manager", () => ({
  SecretsManagerClient: jest
    .fn()
    .mockImplementation(() => ({ send: mockSend })),
  GetSecretValueCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

jest.mock("fs", () => ({ readFileSync: jest.fn() }));

import { loadSecrets } from "../loadSecrets";

describe("loadSecrets", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.LOCAL_SECRETS_FILE;
    delete process.env.AWS_SECRET_NAME;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  describe("local file path", () => {
    it("loads secrets from LOCAL_SECRETS_FILE without calling AWS", async () => {
      process.env.LOCAL_SECRETS_FILE = "/tmp/secrets.json";
      (readFileSync as jest.Mock).mockReturnValue(
        JSON.stringify({ MY_SECRET: "from-file" }),
      );

      await loadSecrets("hrms/config");

      expect(process.env.MY_SECRET).toBe("from-file");
      expect(mockSend).not.toHaveBeenCalled();
      delete process.env.MY_SECRET;
    });

    it("does not override an already-set environment variable", async () => {
      process.env.LOCAL_SECRETS_FILE = "/tmp/secrets.json";
      process.env.MY_SECRET = "already-set";
      (readFileSync as jest.Mock).mockReturnValue(
        JSON.stringify({ MY_SECRET: "from-file" }),
      );

      await loadSecrets("hrms/config");

      expect(process.env.MY_SECRET).toBe("already-set");
      delete process.env.MY_SECRET;
    });
  });

  describe("AWS Secrets Manager path", () => {
    it("fetches the named secret and sets each key into process.env", async () => {
      mockSend.mockResolvedValue({
        SecretString: JSON.stringify({ DB_PASS: "hunter2", API_KEY: "abc" }),
      });

      await loadSecrets("hrms/config");

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({ input: { SecretId: "hrms/config" } }),
      );
      expect(process.env.DB_PASS).toBe("hunter2");
      expect(process.env.API_KEY).toBe("abc");
      delete process.env.DB_PASS;
      delete process.env.API_KEY;
    });

    it("uses AWS_SECRET_NAME to override the passed-in secret name", async () => {
      process.env.AWS_SECRET_NAME = "override/secret";
      mockSend.mockResolvedValue({ SecretString: JSON.stringify({}) });

      await loadSecrets("hrms/config");

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({ input: { SecretId: "override/secret" } }),
      );
    });

    it("does not override an already-set environment variable", async () => {
      process.env.DB_PASS = "already-set";
      mockSend.mockResolvedValue({
        SecretString: JSON.stringify({ DB_PASS: "from-aws" }),
      });

      await loadSecrets("hrms/config");

      expect(process.env.DB_PASS).toBe("already-set");
      delete process.env.DB_PASS;
    });

    it("throws when the secret response has no string value", async () => {
      mockSend.mockResolvedValue({ SecretString: undefined });

      await expect(loadSecrets("hrms/config")).rejects.toThrow(
        "Secret has no string value",
      );
    });

    it("throws when the secret string is not valid JSON", async () => {
      mockSend.mockResolvedValue({ SecretString: "not-json{" });

      await expect(loadSecrets("hrms/config")).rejects.toThrow(
        "Secret contains invalid JSON",
      );
    });
  });
});
