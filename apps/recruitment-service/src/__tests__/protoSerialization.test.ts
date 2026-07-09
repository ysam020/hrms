import { recruitment } from "@hrms/proto";
import { toResignationProto } from "../handlers/resignationSerializer";
import { toJobOpeningProto } from "../handlers/jobOpeningSerializer";

/**
 * Handler unit tests mock the DB and never touch real gRPC binary encoding,
 * which is exactly how several handlers shipped with fields that crash
 * @bufbuild/protobuf's encoder (undefined/null on int32/float fields, a
 * non-array on a repeated field) without any test catching it — the mocked
 * callback happily accepted whatever shape was passed. These tests instead
 * run the *real* generated encode()/decode() round-trip, so a field that
 * would break actual wire serialization fails here too.
 */
describe("Resignation proto serialization", () => {
  it("round-trips a fully-populated row", () => {
    const row = {
      id: "r1",
      userId: "u1",
      reason: "Better opportunity",
      status: "Approved",
      submittedOn: new Date("2024-01-01T00:00:00.000Z"),
      resignationDate: new Date("2024-01-01T00:00:00.000Z"),
      lastWorkingDay: new Date("2024-02-01T00:00:00.000Z"),
      rejectionReason: null,
      exitType: "voluntary",
      noticePeriodDays: 30,
      noticePeriodWaived: true,
      buyoutAmount: 5000,
      relievedFromDutyOn: new Date("2024-01-15T00:00:00.000Z"),
      rehireEligible: true,
    };
    const encoded = recruitment.Resignation.encode(
      recruitment.Resignation.fromPartial(toResignationProto(row)),
    ).finish();
    const decoded = recruitment.Resignation.decode(encoded);
    expect(decoded.id).toBe("r1");
    expect(decoded.noticePeriodDays).toBe(30);
    expect(decoded.buyoutAmount).toBe(5000);
  });

  it("round-trips a row with every nullable field unset (fresh Mongo doc predating a schema field)", () => {
    const row = { id: "r2", status: "Submitted" };
    expect(() =>
      recruitment.Resignation.encode(
        recruitment.Resignation.fromPartial(toResignationProto(row)),
      ).finish(),
    ).not.toThrow();
  });
});

describe("JobOpening proto serialization", () => {
  it("round-trips a fully-populated row", () => {
    const row = {
      id: "j1",
      jobTitle: "Engineer",
      numberOfVacancies: 2,
      jobPostingDate: new Date("2024-01-01T00:00:00.000Z"),
      applicationDeadline: new Date("2024-02-01T00:00:00.000Z"),
      jobDescription: "Build things",
      requiredSkills: "TypeScript",
      experience: 3,
      budget: [10, 20],
      department: "Engineering",
      hiringManager: "jane",
      candidatesHired: 0,
      status: "Active",
      createdBy: "jane",
      createdOn: new Date("2024-01-01T00:00:00.000Z"),
      pipelineTemplateId: "pt1",
      visibility: "external",
      branchIds: ["b1", "b2"],
    };
    const encoded = recruitment.JobOpening.encode(
      recruitment.JobOpening.fromPartial(toJobOpeningProto(row)),
    ).finish();
    const decoded = recruitment.JobOpening.decode(encoded);
    expect(decoded.id).toBe("j1");
    expect(decoded.branchIds).toEqual(["b1", "b2"]);
  });

  it("round-trips a row with branchIds/pipelineTemplateId unset (predates those columns)", () => {
    const row = { id: "j2", jobTitle: "Engineer", status: "Active" };
    expect(() =>
      recruitment.JobOpening.encode(
        recruitment.JobOpening.fromPartial(toJobOpeningProto(row)),
      ).finish(),
    ).not.toThrow();
  });
});
