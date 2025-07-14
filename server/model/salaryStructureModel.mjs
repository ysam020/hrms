import mongoose from "mongoose";

const SalaryStructureSchema = new mongoose.Schema(
  {
    username: { type: String, required: true },
    grossSalary: { type: Number, required: true, min: 0 },
    month: { type: Number, required: true, min: 1, max: 12 },
    year: { type: Number, required: true },
    salaryStructure: {
      basicPay: { type: Number },
      hra: { type: Number },
      conveyance: { type: Number },
      incentive: { type: Number },
      pf: { type: Number },
      esi: { type: Number },
      pt: { type: Number },
      deductions: { type: Number },
      grossEarnings: { type: Number },
      netPayable: { type: Number },
    },
  },
  { timestamps: true }
);

export default mongoose.model("SalaryStructure", SalaryStructureSchema);
