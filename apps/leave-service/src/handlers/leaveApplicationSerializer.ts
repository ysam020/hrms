import { leave } from "@hrms/proto";

/**
 * Maps a raw Prisma LeaveApplication row onto the exact proto
 * `LeaveApplication` message shape. Handlers used to pass the raw row
 * straight through as `data`, which crashes the gRPC binary encoder —
 * `shortLeaveHours` is a nullable float column, and Prisma returns `null`
 * (typeof "object") for rows where it's unset (full_day/half_day leaves, or
 * any row predating the half-day/short-leave columns), which
 * @bufbuild/protobuf's float32 writer rejects. Date fields also need
 * `.toISOString()` — the proto fields are strings, not Date objects.
 */
export function toLeaveApplicationProto(l: any): leave.LeaveApplication {
  return {
    id: l.id ?? "",
    userId: l.userId ?? "",
    leaveType: l.leaveType ?? "",
    from: l.from ? l.from.toISOString() : "",
    to: l.to ? l.to.toISOString() : "",
    days: l.days ?? 0,
    reason: l.reason ?? "",
    status: l.status ?? "",
    approvedById: l.approvedById ?? "",
    appliedOn: l.appliedOn ? l.appliedOn.toISOString() : "",
    sickLeave: l.sickLeave ?? false,
    medicalCertificate: l.medicalCertificate ?? "",
    approvedOn: l.approvedOn ? l.approvedOn.toISOString() : "",
    unit: l.unit ?? "full_day",
    session: l.session ?? "",
    shortLeaveHours: l.shortLeaveHours ?? 0,
  };
}
