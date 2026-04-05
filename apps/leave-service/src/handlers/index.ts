import { applyLeave } from "./applyLeave";
import { getLeaves } from "./getLeaves";
import { getLeaveById } from "./getLeaveById";
import { approveLeave } from "./approveLeave";
import { rejectLeave } from "./rejectLeave";
import { cancelLeave } from "./cancelLeave";
import { getLeaveBalance } from "./getLeaveBalance";
import { updateLeaveBalance } from "./updateLeaveBalance";

export const handlers = {
  ApplyLeave: applyLeave,
  GetLeaves: getLeaves,
  GetLeaveById: getLeaveById,
  ApproveLeave: approveLeave,
  RejectLeave: rejectLeave,
  CancelLeave: cancelLeave,
  GetLeaveBalance: getLeaveBalance,
  UpdateLeaveBalance: updateLeaveBalance,
};
