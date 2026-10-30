import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildSteps,
  clearLocal,
  emptyAnswers,
  joinMobile,
  readLocal,
  splitMobile,
  reconcile,
  stepOfField,
  validateAll,
  validateStep,
  writeLocal,
  type Answers,
} from "@next/features/public/applyForm";
import {
  jobConfig,
  locationSummary,
  normalizeFormConfig,
} from "@next/features/recruitment/jobConfig";

const job = (over: Record<string, unknown> = {}) => ({
  id: "j1",
  jobTitle: "Engineer",
  applicationForm: { fields: {}, resume: "required" },
  screeningQuestions: [
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
      id: "q1",
      label: "Visa?",
      type: "yes_no",
      required: true,
      options: [],
      helpText: "",
      order: 0,
    },
  ],
  ...over,
});

const filled = (): Answers => ({
  ...emptyAnswers(),
  name: "Asha Rao",
  email: "asha@example.com",
  mobile: "9876543210",
  resume: "https://cdn/x.pdf",
  resumeName: "cv.pdf",
  profile: { currentLocation: "Pune", totalExperience: 4 },
  answers: { q1: "yes" },
  consent: true,
});

describe("buildSteps", () => {
  it("lays out the default form in five steps, questions in their set order", () => {
    const steps = buildSteps(job());
    expect(steps.map((s) => s.key)).toEqual([
      "personal",
      "professional",
      "preferences",
      "additional",
      "review",
    ]);
    expect(steps[3].questions!.map((q) => q.id)).toEqual(["q1", "q2"]);
  });

  it("skips steps with nothing to ask", () => {
    const hidden = Object.fromEntries(
      [
        "expectedCtc",
        "currentCtc",
        "noticePeriod",
        "preferredLocation",
        "willingToRelocate",
        "linkedinUrl",
        "portfolioUrl",
        "githubUrl",
      ].map((k) => [k, "hidden"]),
    );
    const steps = buildSteps(
      job({ applicationForm: { fields: hidden }, screeningQuestions: [] }),
    );
    expect(steps.map((s) => s.key)).toEqual([
      "personal",
      "professional",
      "review",
    ]);
  });

  it("never asks for Aadhaar", () => {
    const keys = buildSteps(job()).flatMap((s) => s.fields.map((f) => f.key));
    expect(keys.join()).not.toMatch(/aadha/i);
  });
});

describe("validateStep", () => {
  const steps = buildSteps(job());
  const form = jobConfig(job()).form;

  it("checks contact details on the first step", () => {
    const e = validateStep(
      steps[0],
      { ...emptyAnswers(), mobile: "123" },
      form,
    );
    expect(Object.keys(e).sort()).toEqual([
      "currentLocation",
      "email",
      "mobile",
      "name",
    ]);
  });

  it("accepts international mobile numbers with a country code", () => {
    const e = validateStep(
      steps[0],
      { ...filled(), mobile: "+44 7700 900123" },
      form,
    );
    expect(e).toEqual({});
  });

  it("requires the résumé when the opening does, and checks experience", () => {
    const e = validateStep(
      steps[1],
      {
        ...filled(),
        resume: "",
        profile: { totalExperience: 2, relevantExperience: 5 },
      },
      form,
    );
    expect(e.resume).toBeDefined();
    expect(e.relevantExperience).toMatch(/more than your total/);
  });

  it("checks required screening questions and link formats", () => {
    const e = validateStep(
      steps[3],
      {
        ...filled(),
        answers: {},
        profile: { linkedinUrl: "linkedin.com/in/x" },
      },
      form,
    );
    expect(Object.keys(e).sort()).toEqual(["linkedinUrl", "q:q1"]);
  });

  it("needs consent before submitting", () => {
    expect(
      validateStep(steps[4], { ...filled(), consent: false }, form),
    ).toEqual({
      consent: "Confirm you've read the privacy notice.",
    });
  });

  it("finds every problem across steps for review", () => {
    const out = validateAll(
      steps,
      { ...filled(), name: "", answers: {} },
      form,
    );
    expect(out.map((p) => p.step)).toEqual([0, 3]);
  });

  it("maps server field errors back to the step that shows them", () => {
    expect(stepOfField(steps, "email")).toBe(0);
    expect(stepOfField(steps, "resume")).toBe(1);
    expect(stepOfField(steps, "noticePeriod")).toBe(2);
    expect(stepOfField(steps, "q:q1")).toBe(3);
    expect(stepOfField(steps, "consent")).toBe(4);
  });
});

describe("mobile numbers", () => {
  it("defaults to India and keeps the chosen country code", () => {
    expect(splitMobile("")).toEqual({ code: "+91", number: "" });
    expect(splitMobile("9876543210")).toEqual({
      code: "+91",
      number: "9876543210",
    });
    expect(splitMobile("+918377971782")).toEqual({
      code: "+91",
      number: "8377971782",
    });
    expect(splitMobile("+44 7700 900123")).toEqual({
      code: "+44",
      number: "7700 900123",
    });
    expect(splitMobile("+971 50 123 4567").code).toBe("+971");
    expect(joinMobile("+91", " 98765 43210 ")).toBe("+91 98765 43210");
    expect(joinMobile("+91", "")).toBe("");
    expect(splitMobile(joinMobile("+44", "")).code).toBe("+44");
  });

  it("needs ten digits for India", () => {
    const form = jobConfig(job()).form;
    const step = buildSteps(job())[0];
    expect(
      validateStep(step, { ...filled(), mobile: "+91 98765" }, form).mobile,
    ).toBe("Enter a 10-digit mobile number.");
    expect(
      validateStep(step, { ...filled(), mobile: "+91 98765 43210" }, form)
        .mobile,
    ).toBeUndefined();
  });
});

describe("local recovery", () => {
  beforeEach(() => localStorage.clear());

  it("keeps answers per opening and clears them", () => {
    writeLocal("acme", "j1", {
      draftId: "d1",
      token: "t",
      baseRevision: 2,
      dirty: true,
      savedAt: 1,
      answers: filled(),
    });
    expect(readLocal("acme", "j1")?.answers.name).toBe("Asha Rao");
    expect(readLocal("acme", "j2")).toBeNull();
    clearLocal("acme", "j1");
    expect(readLocal("acme", "j1")).toBeNull();
  });

  it("copes with storage being unavailable or full", () => {
    const spy = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    expect(
      writeLocal("acme", "j1", {
        baseRevision: 0,
        dirty: true,
        savedAt: 1,
        answers: filled(),
      }),
    ).toBe(false);
    spy.mockRestore();
  });

  it("ignores corrupt stored data", () => {
    localStorage.setItem("praesto:apply:acme:j1", "{not json");
    expect(readLocal("acme", "j1")).toBeNull();
  });
});

describe("reconcile", () => {
  const server = { revision: 5, data: filled() };
  const local = (baseRevision: number, dirty: boolean) => ({
    baseRevision,
    dirty,
    savedAt: 1,
    answers: filled(),
  });

  it("uses the server copy when this browser has nothing unsaved", () => {
    expect(reconcile(null, server)).toBe("server");
    expect(reconcile(local(3, false), server)).toBe("server");
  });

  it("keeps unsaved local answers made on top of the current server copy", () => {
    expect(reconcile(local(5, true), server)).toBe("local");
  });

  it("asks rather than silently overwriting when another device saved since", () => {
    expect(reconcile(local(3, true), server)).toBe("ask");
  });
});

describe("job config", () => {
  it("summarises locations", () => {
    expect(
      locationSummary({
        workplaceType: "hybrid",
        locationsJson: JSON.stringify([
          { city: "Pune", state: "MH", country: "India" },
          { city: "Delhi", country: "India" },
        ]),
      }),
    ).toBe("Hybrid · Pune, MH, India +1");
    expect(
      locationSummary({ workplaceType: "remote", remoteRegions: [] }),
    ).toBe("Remote · Anywhere");
    expect(
      locationSummary({ workplaceType: "remote", remoteRegions: ["India"] }),
    ).toBe("Remote · India");
  });

  it("defaults the form for openings saved before it was configurable", () => {
    const form = normalizeFormConfig(null);
    expect(form.resume).toBe("required");
    expect(form.fields.currentLocation).toBe("required");
    expect(form.fields.currentCtc).toBe("hidden");
  });
});
