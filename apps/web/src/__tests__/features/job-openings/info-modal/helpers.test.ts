import {
  buildApplicationStages,
  getStatusOptions,
  interviewHasEnded,
  shouldHideStatusDropdown,
  getStatusColor,
} from "@web/features/job-openings/info-modal/helpers";

describe("buildApplicationStages", () => {
  it("always starts with an Applied stage", () => {
    const stages = buildApplicationStages([], "In Progress");
    expect(stages[0]).toEqual({ label: "Applied", state: "done" });
  });

  it("adds one stage per interview round, done when cleared and pending otherwise", () => {
    const interviews = [
      { roundNumber: 1, cleared: true, interviewStartTime: "20240101T100000" },
      { roundNumber: 2, cleared: false },
    ];
    const stages = buildApplicationStages(interviews, "In Progress");
    expect(stages[1]).toMatchObject({ label: "Round 1", state: "done" });
    expect(stages[2]).toMatchObject({
      label: "Round 2",
      state: "pending",
      date: undefined,
    });
  });

  it("appends a Hired terminal stage when the application was hired", () => {
    const stages = buildApplicationStages([], "Hired");
    expect(stages[stages.length - 1]).toEqual({
      label: "Hired",
      state: "done",
    });
  });

  it("appends a Rejected terminal stage when the application was rejected", () => {
    const stages = buildApplicationStages([], "Rejected");
    expect(stages[stages.length - 1]).toEqual({
      label: "Rejected",
      state: "rejected",
    });
  });

  it("adds no terminal stage for an in-progress application", () => {
    const stages = buildApplicationStages([], "In Progress");
    expect(stages).toHaveLength(1);
  });
});

describe("getStatusOptions", () => {
  it("offers only 'Completed' before the interview has been conducted", () => {
    expect(getStatusOptions({ interviewConducted: false })).toEqual([
      "Completed",
    ]);
  });

  it("offers only 'Cleared' once the interview has been conducted", () => {
    expect(getStatusOptions({ interviewConducted: true })).toEqual(["Cleared"]);
  });

  it("defaults to 'Completed' when interview info is missing", () => {
    expect(getStatusOptions(null)).toEqual(["Completed"]);
  });
});

describe("interviewHasEnded", () => {
  it("returns false when there is no end time", () => {
    expect(interviewHasEnded({})).toBe(false);
  });

  it("returns true for an end time in the past", () => {
    expect(interviewHasEnded({ interviewEndTime: "20200101T100000" })).toBe(
      true,
    );
  });

  it("returns false for an end time in the future", () => {
    expect(interviewHasEnded({ interviewEndTime: "20990101T100000" })).toBe(
      false,
    );
  });
});

describe("shouldHideStatusDropdown", () => {
  it("shows the dropdown when there is no status yet", () => {
    expect(shouldHideStatusDropdown(1, "")).toBe(false);
  });

  it("hides the dropdown once the application is Hired or Rejected", () => {
    expect(shouldHideStatusDropdown(1, "Hired")).toBe(true);
    expect(shouldHideStatusDropdown(1, "Rejected")).toBe(true);
  });

  it("hides the dropdown for a round earlier than the current status round", () => {
    expect(shouldHideStatusDropdown(1, "Round 2 Cleared")).toBe(true);
  });

  it("hides the dropdown for the current round once it has been Cleared", () => {
    expect(shouldHideStatusDropdown(2, "Round 2 Cleared")).toBe(true);
  });

  it("keeps the dropdown visible for the current round when only Completed (not yet Cleared)", () => {
    expect(shouldHideStatusDropdown(2, "Round 2 Completed")).toBe(false);
  });

  it("keeps the dropdown visible for a round later than the current status round", () => {
    expect(shouldHideStatusDropdown(3, "Round 2 Cleared")).toBe(false);
  });

  it("shows the dropdown when the status string doesn't match the expected round pattern", () => {
    expect(shouldHideStatusDropdown(1, "Some Other Status")).toBe(false);
  });
});

describe("getStatusColor", () => {
  it("returns 'success' for Cleared or Hired statuses", () => {
    expect(getStatusColor("Round 1 Cleared")).toBe("success");
    expect(getStatusColor("Hired")).toBe("success");
  });

  it("returns 'error' for Rejected", () => {
    expect(getStatusColor("Rejected")).toBe("error");
  });

  it("returns 'info' for Scheduled", () => {
    expect(getStatusColor("Round 1 Scheduled")).toBe("info");
  });

  it("returns 'warning' for Completed", () => {
    expect(getStatusColor("Round 1 Completed")).toBe("warning");
  });

  it("returns 'default' for anything unrecognized", () => {
    expect(getStatusColor("")).toBe("default");
  });
});
