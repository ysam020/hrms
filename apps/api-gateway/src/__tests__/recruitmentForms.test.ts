import {
  ValidationError,
  normalizeFormConfig,
  normalizeMobile,
  normalizeScreeningQuestions,
  sanitizeApplicationData,
  validateApplication,
  validateJobOpening,
  type ScreeningQuestion,
} from "../services/recruitmentForms";

const DAY = 24 * 3600_000;
const iso = (offsetDays: number) =>
  new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);

const base = () => ({
  jobTitle: "Engineer",
  experience: "3",
  employmentType: "full_time",
  workplaceType: "onsite",
  locations: [{ country: "India", state: "Karnataka", city: "Bengaluru" }],
  jobPostingDate: iso(0),
  applicationDeadline: iso(30),
});

const fieldOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    if (e instanceof ValidationError) return e.field;
    throw e;
  }
  return null;
};

describe("validateJobOpening", () => {
  it("accepts an on-site opening with a location", () => {
    const out = validateJobOpening(base());
    expect(JSON.parse(out.locationsJson)).toEqual([
      { country: "India", state: "Karnataka", city: "Bengaluru", office: "" },
    ]);
    expect(out.remoteScope).toBe("");
  });

  it("requires a city and country for on-site and hybrid openings", () => {
    expect(
      fieldOf(() => validateJobOpening({ ...base(), locations: [] })),
    ).toBe("locations");
    expect(
      fieldOf(() =>
        validateJobOpening({
          ...base(),
          workplaceType: "hybrid",
          locations: [{ country: "India" }],
        }),
      ),
    ).toBe("locations");
  });

  it("accepts a fully remote opening with no office address", () => {
    const out = validateJobOpening({
      ...base(),
      workplaceType: "remote",
      locations: [],
      remoteScope: "country",
      remoteRegions: ["India"],
    });
    expect(out.remoteScope).toBe("country");
    expect(out.remoteRegions).toEqual(["India"]);
    expect(JSON.parse(out.locationsJson)).toEqual([]);
  });

  it("requires regions when remote work is limited to some", () => {
    expect(
      fieldOf(() =>
        validateJobOpening({
          ...base(),
          workplaceType: "remote",
          remoteScope: "regions",
          remoteRegions: [],
        }),
      ),
    ).toBe("remoteRegions");
  });

  it("requires employment and workplace type on new openings only", () => {
    expect(
      fieldOf(() => validateJobOpening({ ...base(), employmentType: "" })),
    ).toBe("employmentType");
    expect(
      fieldOf(() => validateJobOpening({ ...base(), workplaceType: "" })),
    ).toBe("workplaceType");
    // Openings from before these fields existed can still be edited.
    expect(
      validateJobOpening(
        { ...base(), employmentType: "", workplaceType: "" },
        { applicationDeadline: new Date(iso(30)).toISOString() },
      ).workplaceType,
    ).toBe("");
  });

  it("rejects invalid experience ranges", () => {
    expect(
      fieldOf(() => validateJobOpening({ ...base(), experienceMax: "2" })),
    ).toBe("experienceMax");
    expect(
      fieldOf(() => validateJobOpening({ ...base(), experience: "-1" })),
    ).toBe("experience");
    expect(
      validateJobOpening({ ...base(), experienceMax: "5" }).experienceMax,
    ).toBe("5");
  });

  it("treats compensation as optional but checks it when given", () => {
    expect(validateJobOpening({ ...base(), budget: ["", ""] }).budget).toEqual(
      [],
    );
    expect(
      fieldOf(() => validateJobOpening({ ...base(), budget: [10, 5] })),
    ).toBe("budgetMax");
    expect(
      fieldOf(() => validateJobOpening({ ...base(), budget: [-1, 5] })),
    ).toBe("budgetMax");
    expect(
      fieldOf(() => validateJobOpening({ ...base(), budget: [5, ""] })),
    ).toBe("budgetMax");
    expect(validateJobOpening({ ...base(), budget: [5, 5] }).budget).toEqual([
      5, 5,
    ]);
  });

  it("only discloses a budget when asked to", () => {
    expect(validateJobOpening(base()).budgetDisclosed).toBe("false");
    expect(
      validateJobOpening({ ...base(), budgetDisclosed: true }).budgetDisclosed,
    ).toBe("true");
  });

  it("validates deadlines on the server", () => {
    expect(
      fieldOf(() =>
        validateJobOpening({
          ...base(),
          jobPostingDate: iso(0),
          applicationDeadline: iso(-1),
        }),
      ),
    ).toBe("applicationDeadline");
    expect(
      fieldOf(() => validateJobOpening({ ...base(), applicationDeadline: "" })),
    ).toBe("applicationDeadline");
    expect(
      fieldOf(() => validateJobOpening({ ...base(), jobPostingDate: iso(5) })),
    ).toBe("jobPostingDate");
  });
});

describe("normalizeScreeningQuestions", () => {
  it("keeps existing ids, assigns new ones, and orders by position", () => {
    const out = normalizeScreeningQuestions([
      { id: "keep-me", label: "Visa?", type: "yes_no" },
      { label: "Stack", type: "multi_select", options: ["Go", "Go", "Rust"] },
    ]);
    expect(out[0]).toMatchObject({ id: "keep-me", order: 0, required: false });
    expect(out[1].id).toMatch(/^[0-9a-f-]{36}$/);
    expect(out[1].options).toEqual(["Go", "Rust"]);
  });

  it("rejects bad question definitions", () => {
    expect(() =>
      normalizeScreeningQuestions([{ label: "", type: "short_text" }]),
    ).toThrow(ValidationError);
    expect(() =>
      normalizeScreeningQuestions([
        { label: "Pick", type: "select", options: ["A"] },
      ]),
    ).toThrow(/two options/);
    expect(() =>
      normalizeScreeningQuestions([{ label: "X", type: "file" }]),
    ).toThrow(/unknown type/);
  });
});

describe("application answers", () => {
  const questions: ScreeningQuestion[] = [
    {
      id: "q1",
      label: "Work authorisation?",
      type: "yes_no",
      required: true,
      options: [],
      helpText: "",
      order: 0,
    },
    {
      id: "q2",
      label: "Stack",
      type: "multi_select",
      required: false,
      options: ["Go", "Rust"],
      helpText: "",
      order: 1,
    },
    {
      id: "q3",
      label: "Start",
      type: "date",
      required: false,
      options: [],
      helpText: "",
      order: 2,
    },
  ];
  const form = normalizeFormConfig({ resume: "optional" });
  const valid = {
    name: "Asha Rao",
    email: "asha@example.com",
    mobile: "9876543210",
    profile: { currentLocation: "Pune", totalExperience: 4 },
    answers: { q1: "yes", q2: ["Go", "Cobol"] },
    consent: true,
    // Ignored: never part of the model any more.
    aadharNo: "123412341234",
  };

  it("drops answers to unknown questions and options a question doesn't offer", () => {
    const data = sanitizeApplicationData(
      { ...valid, answers: { ...valid.answers, removed: "x" } },
      questions,
    );
    expect(data.answers).toEqual({ q1: "yes", q2: ["Go"] });
    expect(JSON.stringify(data)).not.toContain("123412341234");
  });

  it("accepts a complete application", () => {
    const data = sanitizeApplicationData(valid, questions);
    expect(validateApplication(data, form, questions, () => true)).toEqual({});
  });

  it("reports required fields, required questions, consent and bad links", () => {
    const data = sanitizeApplicationData(
      {
        ...valid,
        profile: {
          linkedinUrl: "javascript:alert(1)",
          totalExperience: 2,
          relevantExperience: 5,
        },
        answers: {},
        consent: false,
      },
      questions,
    );
    expect(
      Object.keys(
        validateApplication(data, form, questions, () => true),
      ).sort(),
    ).toEqual([
      "consent",
      "currentLocation",
      "linkedinUrl",
      "q:q1",
      "relevantExperience",
    ]);
  });

  it("needs a résumé by default, and only one this tenant uploaded", () => {
    const data = sanitizeApplicationData(valid, questions);
    const strict = normalizeFormConfig({});
    expect(
      validateApplication(data, strict, questions, () => true).resume,
    ).toBe("Attach your résumé.");
    const foreign = sanitizeApplicationData(
      { ...valid, resume: "https://evil.example/x.pdf" },
      questions,
    );
    expect(
      validateApplication(foreign, strict, questions, () => false).resume,
    ).toBeDefined();
  });

  it("normalises mobile numbers, defaulting bare 10-digit numbers to India", () => {
    expect(normalizeMobile("98765 43210")).toBe("+919876543210");
    expect(normalizeMobile("+44 7700 900123")).toBe("+447700900123");
    expect(normalizeMobile("919876543210")).toBe("+919876543210");
    expect(normalizeMobile("12345")).toBeNull();
  });
});
