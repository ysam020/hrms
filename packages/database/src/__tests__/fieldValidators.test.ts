import {
  ensureFieldValidators,
  validationLevelFromEnv,
} from "../fieldValidators";

describe("validator rollout safety", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("is off unless explicitly enabled", () => {
    expect(validationLevelFromEnv({})).toBe("off");
    expect(validationLevelFromEnv({ FIELD_VALIDATION_LEVEL: "" })).toBe("off");
    expect(validationLevelFromEnv({ FIELD_VALIDATION_LEVEL: "yes" })).toBe(
      "off",
    );
    expect(validationLevelFromEnv({ FIELD_VALIDATION_LEVEL: "moderate" })).toBe(
      "moderate",
    );
    expect(validationLevelFromEnv({ FIELD_VALIDATION_LEVEL: "strict" })).toBe(
      "strict",
    );
  });

  it("changes nothing when not enabled", async () => {
    delete process.env.FIELD_VALIDATION_LEVEL;
    const client = { $runCommandRaw: jest.fn() } as any;
    expect(await ensureFieldValidators(client, ["User"])).toEqual([]);
    expect(client.$runCommandRaw).not.toHaveBeenCalled();
  });

  it("a development process never changes a shared database's rules", async () => {
    process.env.NODE_ENV = "development";
    delete process.env.ALLOW_NONPROD_SENSITIVE_WRITES;
    process.env.DEV_MONGODB_URI =
      "mongodb+srv://u:p@cluster0.example.mongodb.net/hrms";
    const client = { $runCommandRaw: jest.fn() } as any;
    expect(await ensureFieldValidators(client, ["User"], "strict")).toEqual([]);
    expect(client.$runCommandRaw).not.toHaveBeenCalled();
  });

  it("a local database is still configured when enabled", async () => {
    process.env.NODE_ENV = "development";
    process.env.DEV_MONGODB_URI = "mongodb://127.0.0.1:27017/hrms";
    const client = {
      $runCommandRaw: jest.fn().mockResolvedValue({
        cursor: { firstBatch: [{ name: "users" }] },
        ok: 1,
      }),
    } as any;
    expect(await ensureFieldValidators(client, ["User"], "moderate")).toEqual([
      "users",
    ]);
    expect(client.$runCommandRaw).toHaveBeenCalledWith(
      expect.objectContaining({
        collMod: "users",
        validationLevel: "moderate",
      }),
    );
  });
});
