import { getEmployee } from "./getEmployee";
import { createEmployee } from "./createEmployee";
import { updateEmployee } from "./updateEmployee";
import { deleteEmployee } from "./deleteEmployee";
import { listEmployees } from "./listEmployees";
import { submitKyc } from "./submitKyc";
import { getKycStatus } from "./getKycStatus";
import { approveKyc } from "./approveKyc";
import { requestKycRevision } from "./requestKycRevision";
import { requestKycEditAccess } from "./requestKycEditAccess";
import { allowKycEdit } from "./allowKycEdit";

export const handlers = {
  GetEmployee: getEmployee,
  CreateEmployee: createEmployee,
  UpdateEmployee: updateEmployee,
  DeleteEmployee: deleteEmployee,
  ListEmployees: listEmployees,
  SubmitKyc: submitKyc,
  GetKycStatus: getKycStatus,
  ApproveKyc: approveKyc,
  RequestKycRevision: requestKycRevision,
  RequestKycEditAccess: requestKycEditAccess,
  AllowKycEdit: allowKycEdit,
};
