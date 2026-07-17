import { buildAssetIssueStages } from "@web/features/assets/asset-issues/helpers";

describe("buildAssetIssueStages", () => {
  it("returns an empty list when there is no issue", () => {
    expect(buildAssetIssueStages(null)).toEqual([]);
  });

  it("shows Reported done and Reviewed/Resolved pending for a freshly reported issue", () => {
    const stages = buildAssetIssueStages({
      status: "open",
      createdAt: "2024-01-01",
    });
    expect(stages).toEqual([
      { label: "Reported", date: "2024-01-01", state: "done" },
      { label: "Reviewed", date: undefined, state: "pending" },
      { label: "Resolved", date: undefined, state: "pending" },
    ]);
  });

  it("marks Reviewed done and keeps Resolved pending once reviewed but not yet resolved", () => {
    const stages = buildAssetIssueStages({
      status: "in_progress",
      createdAt: "2024-01-01",
      reviewedAt: "2024-01-02",
    });
    expect(stages[1]).toEqual({
      label: "Reviewed",
      date: "2024-01-02",
      state: "done",
    });
    expect(stages[2]).toEqual({
      label: "Resolved",
      date: undefined,
      state: "pending",
    });
  });

  it("marks all stages done once fully resolved", () => {
    const stages = buildAssetIssueStages({
      status: "resolved",
      createdAt: "2024-01-01",
      reviewedAt: "2024-01-02",
      resolvedAt: "2024-01-03",
    });
    expect(stages).toEqual([
      { label: "Reported", date: "2024-01-01", state: "done" },
      { label: "Reviewed", date: "2024-01-02", state: "done" },
      { label: "Resolved", date: "2024-01-03", state: "done" },
    ]);
  });

  it("marks Reviewed as rejected and omits the Resolved stage entirely when rejected", () => {
    const stages = buildAssetIssueStages({
      status: "rejected",
      createdAt: "2024-01-01",
      reviewedAt: "2024-01-02",
    });
    expect(stages).toEqual([
      { label: "Reported", date: "2024-01-01", state: "done" },
      { label: "Reviewed", date: "2024-01-02", state: "rejected" },
    ]);
  });
});
