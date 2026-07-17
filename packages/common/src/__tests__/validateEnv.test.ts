import { z } from "zod";
import { validateEnv } from "../validateEnv";

describe("validateEnv", () => {
  let exitSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    exitSpy = jest.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit called");
    }) as unknown as (code?: number) => never);
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("returns the parsed env when validation succeeds", () => {
    process.env.FOO = "bar";
    const schema = z.object({ FOO: z.string().min(1) });
    const result = validateEnv(schema, "test-service");
    expect(result).toMatchObject({ FOO: "bar" });
    expect(exitSpy).not.toHaveBeenCalled();
    delete process.env.FOO;
  });

  it("exits the process and logs every missing/invalid var when validation fails", () => {
    process.env.REQUIRED_A = "";
    process.env.REQUIRED_B = "";
    const schema = z.object({
      REQUIRED_A: z.string().min(1, "required — A"),
      REQUIRED_B: z.string().min(1, "required — B"),
    });

    expect(() => validateEnv(schema, "my-service")).toThrow(
      "process.exit called",
    );

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "[my-service] Invalid environment configuration:",
      ),
    );
    const loggedMessage = errorSpy.mock.calls[0][0] as string;
    expect(loggedMessage).toContain("REQUIRED_A: required — A");
    expect(loggedMessage).toContain("REQUIRED_B: required — B");

    delete process.env.REQUIRED_A;
    delete process.env.REQUIRED_B;
  });

  it("fails on an empty-string value the same way as a missing one", () => {
    process.env.EMPTY_VAR = "";
    const schema = z.object({ EMPTY_VAR: z.string().min(1, "required") });

    expect(() => validateEnv(schema, "svc")).toThrow("process.exit called");
    expect(exitSpy).toHaveBeenCalledWith(1);

    delete process.env.EMPTY_VAR;
  });
});
