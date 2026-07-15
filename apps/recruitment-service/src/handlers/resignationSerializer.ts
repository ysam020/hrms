import { recruitment } from "@hrms/proto";

/**
 * Maps a raw Prisma Resignation row onto the exact proto `Resignation`
 * message shape. Handlers used to pass the raw row straight through as
 * `data`, which crashes the gRPC binary encoder — proto fields are int32/
 * float/bool/string, but Prisma returns `null` (typeof "object") for unset
 * nullable columns and real `Date` objects for date columns, neither of
 * which the encoder accepts. `username` is left blank here since the
 * services in this repo don't join across models — api-gateway fills it in
 * from `User` after the gRPC call returns. Typed against the generated
 * message (every field always set) rather than a loose object, so a field
 * renamed/removed in the .proto fails the build instead of shipping silently.
 */
export function toResignationProto(r: any): recruitment.Resignation {
  return {
    id: r.id ?? "",
    userId: r.userId ?? "",
    reason: r.reason ?? "",
    lastWorkingDate: r.lastWorkingDay ? r.lastWorkingDay.toISOString() : "",
    status: r.status ?? "",
    createdAt: r.submittedOn ? r.submittedOn.toISOString() : "",
    username: "",
    resignationDate: r.resignationDate ? r.resignationDate.toISOString() : "",
    submittedOn: r.submittedOn ? r.submittedOn.toISOString() : "",
    rejectionReason: r.rejectionReason ?? "",
    lastDate: r.lastWorkingDay ? r.lastWorkingDay.toISOString() : "",
    exitType: r.exitType ?? "voluntary",
    noticePeriodDays: r.noticePeriodDays ?? 0,
    noticePeriodWaived: r.noticePeriodWaived ?? false,
    buyoutAmount: r.buyoutAmount ?? 0,
    relievedFromDutyOn: r.relievedFromDutyOn
      ? r.relievedFromDutyOn.toISOString()
      : "",
    rehireEligible: r.rehireEligible ?? false,
    approvedOn: r.approvedOn ? r.approvedOn.toISOString() : "",
    rejectedOn: r.rejectedOn ? r.rejectedOn.toISOString() : "",
    withdrawnOn: r.withdrawnOn ? r.withdrawnOn.toISOString() : "",
    overallJobSatisfaction: r.overallJobSatisfaction ?? 0,
    qualityOfCommunication: r.qualityOfCommunication ?? "",
    supportFromManager: r.supportFromManager ?? "",
    appreciationForWork: r.appreciationForWork ?? "",
    collaborationWithinTheTeam: r.collaborationWithinTheTeam ?? "",
    overallCompanyCulture: r.overallCompanyCulture ?? "",
    suggestions: r.suggestions ?? "",
  };
}
