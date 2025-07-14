import mongoose from "mongoose";
import {
  generateBackupCodes,
  getFullName,
  encryptField,
  decryptField,
  resetBlockStatus,
  isPasswordCorrect,
} from "./methods/userMethod.mjs";
import bcrypt from "bcrypt";
import aesEncrypt from "../utils/aesEncrypt.mjs";
import { SENSITIVE_FIELDS } from "../assets/sensitiveFields.mjs";

const Schema = mongoose.Schema;

// Credential schema
const CredentialSchema = new mongoose.Schema({
  credentialID: String,
  publicKey: String,
  counter: Number,
  transports: [String],
  device: {
    type: String,
    default: "Unknown Device",
  },
});

// Event Schema
const eventSchmea = new Schema({
  title: { type: String },
  date: { type: String },
  startTime: { type: String },
  endTime: { type: String },
  description: { type: String },
});

// User schema
const userSchema = new Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
  },
  password: {
    type: String,
    required: true,
  },
  company: {
    type: String,
    enum: ["Paymaster", "Paymaster Management Solutions Limited"],
  },
  rank: { type: Number },
  role: [
    {
      type: String,
    },
  ],
  permissions: [
    {
      type: String,
    },
  ],
  isSuperUser: {
    type: Boolean,
    default: false,
  },
  assets: [
    {
      type: String,
    },
  ],
  favoriteModules: [
    {
      name: { type: String },
      path: { type: String },
    },
  ],
  note: {
    type: String,
  },
  // Hiring
  salary: {
    type: String,
  },
  salaryStructure: {
    basicPay: {
      type: Number,
      min: 0,
    },
    hra: {
      type: Number,
      min: 0,
    },
    conveyance: {
      type: Number,
      min: 0,
    },
    pf: {
      type: Number,
      min: 0,
    },
    esi: {
      type: Number,
      min: 0,
    },
    pt: {
      type: Number,
      min: 0,
    },
  },
  reference_by: {
    type: String,
  },
  // Employee Status Fields
  employeeStatus: {
    type: String,
    enum: ["Active", "Terminated", "Absconded", "Resigned"],
    default: "Active",
    required: true,
  },
  // Termination fields
  reasonForTermination: {
    type: String,
    // Required when status is Terminated
  },
  dateOfTermination: {
    type: String,
    // Required when status is Terminated
  },
  // Abscond fields
  dateOfAbscond: {
    type: String,
    // Required when status is Absconded
  },
  ////////////////////////////////////////////////////////////////// KYC
  first_name: {
    type: String,
    uppercase: true,
  },
  middle_name: {
    type: String,
    uppercase: true,
  },
  last_name: {
    type: String,
    uppercase: true,
  },
  email: {
    type: String,
    lowercase: true,
  },
  employee_photo: {
    type: String,
  },
  face_descriptor: [],
  designation: {
    type: String,
    uppercase: true,
  },
  department: {
    type: String,
    uppercase: true,
  },
  joining_date: {
    type: String,
  },
  permanent_address_line_1: {
    type: String,
  },
  permanent_address_line_2: {
    type: String,
  },
  permanent_address_city: {
    type: String,
  },
  permanent_address_state: {
    type: String,
  },
  permanent_address_pincode: {
    type: String,
  },
  communication_address_line_1: {
    type: String,
  },
  communication_address_line_2: {
    type: String,
  },
  communication_address_city: {
    type: String,
  },
  communication_address_state: {
    type: String,
  },
  communication_address_pincode: {
    type: String,
  },
  official_email: {
    type: String,
    lowercase: true,
  },
  dob: {
    type: String,
  },
  mobile: {
    type: String,
  },
  blood_group: {
    type: String,
    uppercase: true,
  },
  qualification: {
    type: String,
  },
  aadhar_no: {
    type: String,
  },
  aadhar_photo_front: {
    type: String,
  },
  aadhar_photo_back: {
    type: String,
  },
  pan_no: {
    type: String,
  },
  pan_photo: {
    type: String,
  },
  education_certificates: [
    {
      type: String,
    },
  ],
  experience_certificate: {
    type: String,
  },
  electricity_bill: {
    type: String,
  },
  pcc: {
    type: String,
  },
  pf_no: {
    type: String,
  },
  uan_no: { type: String },
  esic_no: {
    type: String,
  },
  bank_account_no: {
    type: String,
  },
  bank_name: {
    type: String,
  },
  ifsc_code: {
    type: String,
    uppercase: true,
  },
  kyc_date: { type: String },
  kyc_approval: {
    type: String,
  },
  // Module fields
  events: [eventSchmea],
  // Password reset fields
  resetPasswordOTP: {
    type: String,
  },
  resetPasswordExpires: {
    type: Date,
  },
  // 2FA fields
  twoFactorSecret: {
    type: String,
  },
  qrCodeImage: { type: String },
  isTwoFactorEnabled: {
    type: Boolean,
  },
  // Rate-limiting fields for login attempts
  failedLoginAttempts: { type: Number, default: 0 },
  firstFailedLoginAt: { type: Date },
  isBlocked: { type: Boolean, default: false },
  blockedUntil: { type: Date },
  backupCodes: {
    type: [String], // Array to store backup codes
  },
  // WebAuthn
  webAuthnCredentials: [CredentialSchema],
  // Push Notification
  fcmTokens: [String],
});

userSchema.index({ username: 1 }, { unique: true });
userSchema.index({ department: 1 });
userSchema.index({ employeeStatus: 1 });

userSchema.methods.generateBackupCodes = generateBackupCodes;
userSchema.methods.getFullName = getFullName;
userSchema.methods.encryptField = encryptField;
userSchema.methods.decryptField = decryptField;
userSchema.methods.resetBlockStatus = resetBlockStatus;
userSchema.methods.isPasswordCorrect = isPasswordCorrect;

// Add validation for employee status and salary structure
userSchema.pre("validate", function (next) {
  // Company-based salary structure logic
  if (this.isModified("company") || this.isNew) {
    if (this.company === "Paymaster") {
      // Initialize salaryStructure if it doesn't exist
      if (!this.salaryStructure) {
        this.salaryStructure = {};
      }

      // Set pf, pt, and esi to 0 for Paymaster company
      this.salaryStructure.pf = 0;
      this.salaryStructure.pt = 0;
      this.salaryStructure.esi = 0;
    }
  }

  // Termination validation
  if (this.employeeStatus === "Terminated") {
    if (!this.reasonForTermination) {
      this.invalidate(
        "reasonForTermination",
        "Reason for termination is required when employee is Terminated"
      );
    }
    if (!this.dateOfTermination) {
      this.invalidate(
        "dateOfTermination",
        "Date of termination is required when employee is Terminated"
      );
    }

    this.isSuperUser = false;
    this.permissions = [];
  }

  // Abscond validation
  if (this.employeeStatus === "Absconded") {
    if (!this.dateOfAbscond) {
      this.invalidate(
        "dateOfAbscond",
        "Date of abscond is required when employee is Absconded"
      );
    }

    this.isSuperUser = false;
    this.permissions = [];
  }

  // Resignation validation
  if (this.employeeStatus === "Resigned") {
    this.isSuperUser = false;
    this.permissions = [];
  }

  // Clear irrelevant fields based on status
  if (this.employeeStatus === "Active" || this.employeeStatus === "Resigned") {
    this.reasonForTermination = undefined;
    this.dateOfTermination = undefined;
    this.dateOfAbscond = undefined;
  } else if (this.employeeStatus === "Terminated") {
    this.dateOfAbscond = undefined;
  } else if (this.employeeStatus === "Absconded") {
    this.reasonForTermination = undefined;
    this.dateOfTermination = undefined;
  }

  next();
});

userSchema.pre("save", async function (next) {
  try {
    // Original password hashing logic
    if (this.isModified("password") || this.isNew) {
      const hashedPassword = await bcrypt.hash(this.password, 10);
      this.password = hashedPassword;
    }

    // Encrypt sensitive fields if they are modified or new
    for (const field of SENSITIVE_FIELDS) {
      if ((this.isModified(field) || this.isNew) && this[field]) {
        // Use your existing aesEncrypt function
        this[field] = aesEncrypt(this[field].toString());
      }
    }

    next();
  } catch (error) {
    console.error("Error in pre-save hook:", error);
    next(error);
  }
});

const UserModel = mongoose.model("User", userSchema);
export default UserModel;
