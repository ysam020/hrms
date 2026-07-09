import { createHrActivity } from "./createHrActivity";
import { getHrActivity } from "./getHrActivity";
import { listHrActivities } from "./listHrActivities";
import { updateHrActivity } from "./updateHrActivity";
import { createPolicy } from "./createPolicy";
import { getPolicy } from "./getPolicy";
import { listPolicies } from "./listPolicies";
import { getUserRoles } from "./getUserRoles";
import { checkPermission } from "./checkPermission";
import { assignRole } from "./assignRole";

export const handlers = {
  CreateHrActivity: createHrActivity,
  GetHrActivity: getHrActivity,
  ListHrActivities: listHrActivities,
  UpdateHrActivity: updateHrActivity,
  CreatePolicy: createPolicy,
  GetPolicy: getPolicy,
  ListPolicies: listPolicies,
  GetUserRoles: getUserRoles,
  CheckPermission: checkPermission,
  AssignRole: assignRole,
};
