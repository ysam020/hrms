import { leave } from "@hrms/proto";
import { toLeaveApplicationProto } from "../handlers/leaveApplicationSerializer";

/**
 * Handler unit tests mock the DB and never touch real gRPC binary encoding,
 * which is how getLeaves/getLeaveById/applyLeave/approveLeave/rejectLeave/
 * cancelLeave/finalizeLeaveCancellation all shipped returning raw Prisma
 * rows — crashing @bufbuild/protobuf's encoder on `shortLeaveHours` (a
 * nullable float column) whenever it was null. This runs the *real*
 * generated encode()/decode() round-trip so that class of bug fails a test
 * instead of shipping again.
 */
describe("LeaveApplication proto serialization", () => {
  it("round-trips a fully-populated full_day row", () => {
    const row = {
      id: "l1",
      userId: "u1",
      leaveType: "Casual",
      from: new Date("2024-03-01T00:00:00.000Z"),
      to: new Date("2024-03-05T00:00:00.000Z"),
      days: 3,
      reason: "Trip",
      status: "Approved",
      approvedById: "m1",
      appliedOn: new Date("2024-02-28T00:00:00.000Z"),
      sickLeave: false,
      medicalCertificate: null,
      approvedOn: new Date("2024-03-01T00:00:00.000Z"),
      unit: "full_day",
      session: null,
      shortLeaveHours: null,
    };
    const encoded = leave.LeaveApplication.encode(
      leave.LeaveApplication.fromPartial(toLeaveApplicationProto(row)),
    ).finish();
    const decoded = leave.LeaveApplication.decode(encoded);
    expect(decoded.id).toBe("l1");
    expect(decoded.days).toBe(3);
  });

  it("round-trips a short_leave row with shortLeaveHours set", () => {
    const row = {
      id: "l2",
      userId: "u1",
      leaveType: "Casual",
      status: "Pending",
      unit: "short_leave",
      shortLeaveHours: 2.5,
    };
    const encoded = leave.LeaveApplication.encode(
      leave.LeaveApplication.fromPartial(toLeaveApplicationProto(row)),
    ).finish();
    const decoded = leave.LeaveApplication.decode(encoded);
    expect(decoded.shortLeaveHours).toBeCloseTo(2.5);
  });

  it("round-trips a row with shortLeaveHours null (full_day/half_day — the crashing case)", () => {
    const row = {
      id: "l3",
      status: "Pending",
      unit: "full_day",
      shortLeaveHours: null,
    };
    expect(() =>
      leave.LeaveApplication.encode(
        leave.LeaveApplication.fromPartial(toLeaveApplicationProto(row)),
      ).finish(),
    ).not.toThrow();
  });
});
