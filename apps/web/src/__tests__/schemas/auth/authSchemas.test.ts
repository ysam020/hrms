import {
  webAuthnLoginSchema,
  webAuthnAuthenticationOptionsSchema,
  webAuthnRegistrationOptionsSchema,
  webAuthnRegistrationVerifySchema,
  webAuthnAuthenticationVerifySchema,
} from "@web/shared/schemas/auth/webAuthn";
import { resetPasswordSchema } from "@web/shared/schemas/auth/resetPassword";
import { updatePasswordSchema } from "@web/shared/schemas/auth/updatePassword";

describe("webAuthnLoginSchema", () => {
  it("accepts username >= 4 characters", () => {
    expect(webAuthnLoginSchema.safeParse({ username: "john" }).success).toBe(
      true,
    );
    expect(webAuthnLoginSchema.safeParse({ username: "johndoe" }).success).toBe(
      true,
    );
  });

  it("rejects username shorter than 4 characters", () => {
    const result = webAuthnLoginSchema.safeParse({ username: "ab" });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("at least 4");
  });
});

describe("webAuthnAuthenticationOptionsSchema", () => {
  it("accepts valid email", () => {
    const result = webAuthnAuthenticationOptionsSchema.safeParse({
      email: "user@example.com",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = webAuthnAuthenticationOptionsSchema.safeParse({
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain(
      "Valid email required",
    );
  });
});

describe("webAuthnRegistrationOptionsSchema", () => {
  it("accepts userId with optional email", () => {
    expect(
      webAuthnRegistrationOptionsSchema.safeParse({ userId: "u1" }).success,
    ).toBe(true);
    expect(
      webAuthnRegistrationOptionsSchema.safeParse({
        userId: "u1",
        email: "a@b.com",
      }).success,
    ).toBe(true);
  });

  it("rejects empty userId", () => {
    const result = webAuthnRegistrationOptionsSchema.safeParse({ userId: "" });
    expect(result.success).toBe(false);
  });
});

describe("webAuthnRegistrationVerifySchema", () => {
  it("accepts userId and credential", () => {
    const result = webAuthnRegistrationVerifySchema.safeParse({
      userId: "u1",
      credential: "cred123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty credential", () => {
    const result = webAuthnRegistrationVerifySchema.safeParse({
      userId: "u1",
      credential: "",
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain(
      "Credential required",
    );
  });
});

describe("webAuthnAuthenticationVerifySchema", () => {
  it("accepts valid userId and credential", () => {
    const result = webAuthnAuthenticationVerifySchema.safeParse({
      userId: "u1",
      credential: "cred",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing userId", () => {
    const result = webAuthnAuthenticationVerifySchema.safeParse({
      userId: "",
      credential: "cred",
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("User ID required");
  });
});

describe("resetPasswordSchema", () => {
  it("accepts matching passwords", () => {
    const result = resetPasswordSchema.safeParse({
      password: "oldPass123",
      new_password: "newPass456",
      confirm_password: "newPass456",
    });
    expect(result.success).toBe(true);
  });

  it("rejects mismatched passwords", () => {
    const result = resetPasswordSchema.safeParse({
      password: "oldPass123",
      new_password: "newPass456",
      confirm_password: "different",
    });
    expect(result.success).toBe(false);
    const issues = result.error?.issues ?? [];
    expect(
      issues.some(
        (i) =>
          i.path.includes("confirm_password") &&
          i.message === "Passwords must match",
      ),
    ).toBe(true);
  });

  it("rejects empty current password", () => {
    const result = resetPasswordSchema.safeParse({
      password: "",
      new_password: "newPass456",
      confirm_password: "newPass456",
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain(
      "Current password is required",
    );
  });
});

describe("updatePasswordSchema", () => {
  it("accepts valid OTP and matching passwords", () => {
    const result = updatePasswordSchema.safeParse({
      otp: "123456",
      password: "newPass123",
      confirmPassword: "newPass123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects OTP not exactly 6 characters", () => {
    const result = updatePasswordSchema.safeParse({
      otp: "12345",
      password: "newPass123",
      confirmPassword: "newPass123",
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("exactly 6 digits");
  });

  it("rejects OTP longer than 6 characters", () => {
    const result = updatePasswordSchema.safeParse({
      otp: "1234567",
      password: "newPass123",
      confirmPassword: "newPass123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects mismatched confirmPassword", () => {
    const result = updatePasswordSchema.safeParse({
      otp: "123456",
      password: "newPass123",
      confirmPassword: "different",
    });
    expect(result.success).toBe(false);
    const issues = result.error?.issues ?? [];
    expect(
      issues.some(
        (i) =>
          i.path.includes("confirmPassword") &&
          i.message === "Passwords must match",
      ),
    ).toBe(true);
  });
});
