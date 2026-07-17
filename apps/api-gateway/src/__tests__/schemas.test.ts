import {
  disableWebAuthnSchema,
  addLeaveSchema,
  kycApprovalSchema,
  addHrActivitySchema,
  editHrActivitySchema,
} from "../schemas";

describe("disableWebAuthnSchema", () => {
  it("accepts a credentialId alone", () => {
    expect(
      disableWebAuthnSchema.safeParse({ credentialId: "cred1" }).success,
    ).toBe(true);
  });

  it("accepts disableAll alone", () => {
    expect(disableWebAuthnSchema.safeParse({ disableAll: true }).success).toBe(
      true,
    );
  });

  it("rejects when neither credentialId nor disableAll is provided", () => {
    const result = disableWebAuthnSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects disableAll: false with no credentialId (falsy, not just absent)", () => {
    const result = disableWebAuthnSchema.safeParse({ disableAll: false });
    expect(result.success).toBe(false);
  });
});

describe("addLeaveSchema", () => {
  const base = {
    from: "2026-08-01",
    to: "2026-08-01",
    leaveType: "annual",
  };

  it("accepts a full-day leave with no session/shortLeaveHours", () => {
    const result = addLeaveSchema.safeParse({ ...base, unit: "full_day" });
    expect(result.success).toBe(true);
  });

  it("defaults unit to full_day when omitted", () => {
    const result = addLeaveSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.unit).toBe("full_day");
  });

  it("requires a session for a half-day leave", () => {
    const result = addLeaveSchema.safeParse({ ...base, unit: "half_day" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["session"]);
      expect(result.error.issues[0].message).toBe(
        "session is required for a half-day leave",
      );
    }
  });

  it("accepts a half-day leave when a session is provided", () => {
    const result = addLeaveSchema.safeParse({
      ...base,
      unit: "half_day",
      session: "first_half",
    });
    expect(result.success).toBe(true);
  });

  it("requires shortLeaveHours for a short leave", () => {
    const result = addLeaveSchema.safeParse({ ...base, unit: "short_leave" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["shortLeaveHours"]);
    }
  });

  it("accepts a short leave when shortLeaveHours is provided", () => {
    const result = addLeaveSchema.safeParse({
      ...base,
      unit: "short_leave",
      shortLeaveHours: 2,
    });
    expect(result.success).toBe(true);
  });

  it("treats an empty-string session as absent (preprocessed to undefined)", () => {
    const result = addLeaveSchema.safeParse({
      ...base,
      unit: "half_day",
      session: "",
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues[0].path).toEqual(["session"]);
  });

  it("rejects an out-of-range shortLeaveHours", () => {
    const result = addLeaveSchema.safeParse({
      ...base,
      unit: "short_leave",
      shortLeaveHours: 10,
    });
    expect(result.success).toBe(false);
  });
});

describe("kycApprovalSchema", () => {
  it("accepts a plain approval with no field_issues", () => {
    const result = kycApprovalSchema.safeParse({
      username: "alice",
      kyc_approval: "Approved",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a revision request with no field_issues", () => {
    const result = kycApprovalSchema.safeParse({
      username: "alice",
      kyc_approval: "Revision Requested",
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues[0].path).toEqual(["field_issues"]);
  });

  it("rejects a revision request with an empty field_issues object", () => {
    const result = kycApprovalSchema.safeParse({
      username: "alice",
      kyc_approval: "Revision Requested",
      field_issues: {},
    });
    expect(result.success).toBe(false);
  });

  it("accepts a revision request that includes at least one field issue", () => {
    const result = kycApprovalSchema.safeParse({
      username: "alice",
      kyc_approval: "Revision Requested",
      field_issues: { pan_no: "Please re-upload a clearer photo" },
    });
    expect(result.success).toBe(true);
  });
});

describe(".strict() schemas reject unknown fields (mass-assignment protection)", () => {
  it("rejects an unexpected extra field on addHrActivitySchema", () => {
    const result = addHrActivitySchema.safeParse({
      title: "Team outing",
      isSuperUser: true,
    });
    expect(result.success).toBe(false);
  });

  it("accepts addHrActivitySchema with only its declared fields", () => {
    const result = addHrActivitySchema.safeParse({ title: "Team outing" });
    expect(result.success).toBe(true);
  });

  it("rejects an unexpected extra field on the partial editHrActivitySchema too", () => {
    const result = editHrActivitySchema.safeParse({
      title: "Updated title",
      tenantRole: "admin",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a partial update on editHrActivitySchema with no fields at all", () => {
    const result = editHrActivitySchema.safeParse({});
    expect(result.success).toBe(true);
  });
});
