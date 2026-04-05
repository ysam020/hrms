import { getSalaryStructure } from "./getSalaryStructure";
import { createSalaryStructure } from "./createSalaryStructure";
import { updateSalaryStructure } from "./updateSalaryStructure";
import { processPayroll } from "./processPayroll";
import { getPayslip } from "./getPayslip";

export const handlers = {
  GetSalaryStructure: getSalaryStructure,
  CreateSalaryStructure: createSalaryStructure,
  UpdateSalaryStructure: updateSalaryStructure,
  ProcessPayroll: processPayroll,
  GetPayslip: getPayslip,
};
