import { buildResignationStages } from "@web/features/resignation/exit-management/helpers";

describe("buildResignationStages", () => {
  it("shows Submitted done, Approved pending for a freshly submitted resignation", () => {
    const stages = buildResignationStages({
      status: "Pending",
      submittedOn: "2024-01-01",
    });
    expect(stages).toEqual([
      { label: "Submitted", date: "2024-01-01", state: "done" },
      { label: "Approved", date: undefined, state: "pending" },
      { label: "Relieved", date: undefined, state: "pending" },
    ]);
  });

  it("marks Approved done and adds a pending Relieved stage once approved", () => {
    const stages = buildResignationStages({
      status: "Approved",
      submittedOn: "2024-01-01",
      approvedOn: "2024-01-05",
    });
    expect(stages[1]).toEqual({
      label: "Approved",
      date: "2024-01-05",
      state: "done",
    });
    expect(stages[2]).toEqual({
      label: "Relieved",
      date: undefined,
      state: "pending",
    });
  });

  it("marks Relieved done once relievedFromDutyOn is set", () => {
    const stages = buildResignationStages({
      status: "Approved",
      submittedOn: "2024-01-01",
      approvedOn: "2024-01-05",
      relievedFromDutyOn: "2024-02-01",
    });
    expect(stages[2]).toEqual({
      label: "Relieved",
      date: "2024-02-01",
      state: "done",
    });
  });

  it("shows Rejected instead of Approved and omits the Relieved stage when rejected", () => {
    const stages = buildResignationStages({
      status: "Rejected",
      submittedOn: "2024-01-01",
      rejectedOn: "2024-01-03",
    });
    expect(stages).toEqual([
      { label: "Submitted", date: "2024-01-01", state: "done" },
      { label: "Rejected", date: "2024-01-03", state: "rejected" },
    ]);
  });

  it("short-circuits to just Submitted + Withdrawn when withdrawn", () => {
    const stages = buildResignationStages({
      status: "Withdrawn",
      submittedOn: "2024-01-01",
      withdrawnOn: "2024-01-02",
    });
    expect(stages).toEqual([
      { label: "Submitted", date: "2024-01-01", state: "done" },
      { label: "Withdrawn", date: "2024-01-02", state: "done" },
    ]);
  });
});
