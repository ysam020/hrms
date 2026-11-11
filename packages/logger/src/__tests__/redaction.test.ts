process.env.NODE_ENV = "test";

import winston from "winston";
import {
  classifyField,
  redactSensitive,
  redactForLog,
  scrubText,
  redactSensitiveFormat,
} from "../index";

// Synthetic fixtures only — not real identifiers.
const AADHAAR = "1234 5678 9012";
const AADHAAR_COMPACT = "123456789012";
const PAN = "ABCDE1234F";
const RESUME_DATA_URL = `data:application/pdf;base64,${"QUJD".repeat(5000)}`;
const COVER = "Dear hiring manager, ".repeat(10);

describe("classifyField", () => {
  it.each([
    "aadharNo",
    "aadhar_no",
    "aadhaarNumber",
    "AADHAR-NO",
    "aadhaar",
    "adhaarNo",
    "aadhar_photo_front",
    "uidaiNumber",
    "pan_no",
    "panNo",
    "panCard",
    "pan_photo",
    "bank_account_no",
    "bankAccountNumber",
    "ifsc_code",
    "passportNo",
    "password",
    "tokenHashes",
    "recoveryCodeHash",
  ])("%s is a secret", (key) => {
    expect(classifyField(key)).toBe("secret");
  });

  it.each([
    "resume",
    "resumeText",
    "parsedResume",
    "coverLetter",
    "cover_letter",
    "answers",
  ])("%s is omitted", (key) => {
    expect(classifyField(key)).toBe("omit");
  });

  it("omits `data` only on ApplicationDraft", () => {
    expect(classifyField("data", "ApplicationDraft")).toBe("omit");
    expect(classifyField("data", "Notification")).toBeNull();
    expect(classifyField("data")).toBeNull();
  });

  it.each([
    "userId",
    "status",
    "salary",
    "designation",
    "company",
    "panel",
    "companyPan2",
    "bank_name",
    "emailVerifiedAt",
    "jobTitleId",
    "resumeScore",
  ])("leaves ordinary field %s alone", (key) => {
    expect(classifyField(key)).toBeNull();
  });
});

describe("redactSensitive (audit snapshots)", () => {
  const application = {
    id: "app-1",
    status: "Applied",
    name: "Synthetic Applicant",
    aadharNo: AADHAAR,
    resume: RESUME_DATA_URL,
    coverLetter: COVER,
    resumeScore: 7,
    interviews: [
      { round: 1, notes: "ok", panelist: { aadhaar_number: AADHAAR_COMPACT } },
    ],
    meta: { nested: { deeper: { panNo: PAN, kept: "yes" } } },
  };

  it("never lets a sensitive value through, at any depth", () => {
    const out = JSON.stringify(redactSensitive(application, "JobApplication"));
    for (const secret of [
      AADHAAR,
      AADHAAR_COMPACT,
      PAN,
      "QUJDQUJD",
      "Dear hiring manager",
    ]) {
      expect(out).not.toContain(secret);
    }
  });

  it("keeps the useful, non-sensitive fields", () => {
    const out = redactSensitive(application, "JobApplication") as any;
    expect(out.id).toBe("app-1");
    expect(out.status).toBe("Applied");
    expect(out.resumeScore).toBe(7);
    expect(out.interviews[0].round).toBe(1);
    expect(out.meta.nested.deeper.kept).toBe("yes");
    expect(out.aadharNo).toBe("[REDACTED]");
    expect(out.resume).toMatch(/^\[OMITTED: \d+ bytes\]$/);
    expect(out.interviews[0].panelist.aadhaar_number).toBe("[REDACTED]");
  });

  it("drops ApplicationDraft.data but not other models' data", () => {
    const draft = redactSensitive(
      { id: "d1", data: { fullName: "x", aadhar: AADHAAR } },
      "ApplicationDraft",
    ) as any;
    expect(draft.data).toMatch(/^\[OMITTED/);
    const other = redactSensitive(
      { data: { title: "kept" } },
      "Notification",
    ) as any;
    expect(other.data).toEqual({ title: "kept" });
  });

  it("omits oversized strings and data URLs under unknown keys", () => {
    const out = redactSensitive({
      attachmentBlob: RESUME_DATA_URL,
      note: "x".repeat(3000),
    }) as any;
    expect(out.attachmentBlob).toMatch(/^\[OMITTED/);
    expect(out.note).toMatch(/^\[OMITTED/);
  });

  it("handles arrays, nulls, dates and cycles", () => {
    const cyclic: any = { a: [null, undefined, new Date(0)] };
    cyclic.self = cyclic;
    const out = redactSensitive(cyclic) as any;
    expect(out.a[2]).toEqual(new Date(0));
    expect(out.self).toBe("[Circular]");
  });
});

describe("log redaction", () => {
  it("scrubs Aadhaar-shaped numbers and data URLs inside free text", () => {
    const text = scrubText(
      `Invalid prisma.jobApplication.update() invocation: data: { aadharNo: "${AADHAAR}", resume: "${RESUME_DATA_URL}" }`,
    );
    expect(text).not.toContain(AADHAAR);
    expect(text).not.toContain("QUJDQUJD");
    expect(text).toContain("[REDACTED-ID]");
  });

  it("keeps long stack traces (no size cut-off in logs)", () => {
    const stack = "Error: boom\n" + "    at fn (file.ts:1:1)\n".repeat(200);
    expect(redactForLog({ stack })).toEqual({ stack });
  });

  it("applies to every transport through the logger format", () => {
    const lines: string[] = [];
    const sink = new winston.transports.Stream({
      stream: new (require("stream").Writable)({
        write(chunk: Buffer, _enc: string, cb: () => void) {
          lines.push(chunk.toString());
          cb();
        },
      }),
    });
    const testLogger = winston.createLogger({
      level: "info",
      format: winston.format.combine(
        redactSensitiveFormat,
        winston.format.json(),
      ),
      transports: [sink],
    });
    const err = {
      message: `Unique constraint failed for ${AADHAAR_COMPACT}`,
      stack: "Error\n at x",
    };
    testLogger.error(`create application failed for ${AADHAAR}`, {
      aadharNo: AADHAAR,
      application: {
        resume: RESUME_DATA_URL,
        coverLetter: COVER,
        status: "Applied",
      },
      error: err,
    });
    const out = lines.join("");
    for (const secret of [
      AADHAAR,
      AADHAAR_COMPACT,
      "QUJDQUJD",
      "Dear hiring manager",
    ]) {
      expect(out).not.toContain(secret);
    }
    expect(out).toContain('"status":"Applied"');
  });
});

describe("error serialization for log lines", () => {
  const { serializeErrors, wasLogged } = jest.requireActual("../index");

  it("marks an Error as logged and keeps only name, message and stack (no request config or headers)", () => {
    const err: any = new Error("request failed");
    err.config = { headers: { Authorization: "Bearer secret-token" } };
    const info: any = serializeErrors.transform({
      level: "error",
      message: "x",
      err,
    });

    expect(wasLogged(err)).toBe(true);
    expect(Object.keys(info.err).sort()).toEqual(["message", "name", "stack"]);
    expect(JSON.stringify(info)).not.toContain("secret-token");
  });

  it("does not mark errors that were never logged", () => {
    expect(wasLogged(new Error("quiet"))).toBe(false);
    expect(wasLogged("not an error")).toBe(false);
  });
});

describe("log-only personal data", () => {
  const { redactForLog, scrubText } = require("../redaction");

  it("hides encrypted-at-rest personal fields from log lines", () => {
    const out = redactForLog({
      user: {
        first_name: "Asha",
        email: "asha@example.test",
        mobile: "+919876543210",
        permanent_address_line_1: "12 MG Road",
        department: "Engineering",
      },
      salary: { grossSalary: 90000, month: 3 },
      err: {
        name: "PrismaClientKnownRequestError",
        message: "Unique constraint failed for asha@example.test",
      },
    }) as any;
    expect(out.user).toEqual({
      first_name: "[REDACTED]",
      email: "[REDACTED]",
      mobile: "[REDACTED]",
      permanent_address_line_1: "[REDACTED]",
      department: "Engineering",
    });
    expect(out.salary).toBe("[REDACTED]");
    expect(out.err.name).toBe("PrismaClientKnownRequestError");
    expect(out.err.message).toBe(
      "Unique constraint failed for [REDACTED-EMAIL]",
    );
  });

  it("scrubs email, PAN and Indian mobile numbers out of free text", () => {
    expect(
      scrubText(
        "pan ABCDE1234F, call +91 98765 43210 or 9876543210, mail a.b@x.io",
      ),
    ).toBe(
      "pan [REDACTED-ID], call [REDACTED-PHONE] or [REDACTED-PHONE], mail [REDACTED-EMAIL]",
    );
  });
});
