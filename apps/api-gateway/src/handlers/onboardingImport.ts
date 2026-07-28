import { Request, Response } from "express";
import path from "path";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { salary } from "@hrms/proto";
import { salaryClient, grpcCall } from "../grpc/clients";
import { AuthRequest } from "../middleware/authenticate";
import {
  prisma as masterPrisma,
  canonicalizeEmail,
  generateUniqueUsername,
  getTenantId,
} from "@hrms/db";
import { logger } from "@hrms/logger";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";
import { deriveOfferCompensationBreakup } from "@hrms/common";
import { handleError } from "../utils/handleError";
import { s3Client, S3_BUCKET } from "../config/s3";
import { sanitizePart } from "./general";
import {
  buildOnboardingTemplate,
  parseWorkbook,
  ParsedRow,
} from "../services/onboardingImportParser";

const ALLOWED_IMPORT_EXTENSION = ".csv";
// Browsers/OSes disagree on what MIME type a .csv file carries — Chrome/
// Firefox report "text/csv", Windows-originated files often show up as
// "application/vnd.ms-excel", and some report the generic "text/plain".
// Gate primarily on extension; accept any of these observed CSV types.
const ALLOWED_IMPORT_MIMETYPES = new Set([
  "text/csv",
  "application/vnd.ms-excel",
  "application/csv",
  "text/plain",
]);

/**
 * GET /bulk-onboarding/template
 * Streams a fresh CSV with the current header row (see
 * buildOnboardingTemplate) — generated on demand rather than a static file
 * so it never drifts from the spec (onboardingImportSpec.ts).
 */
export async function downloadOnboardingTemplate(req: Request, res: Response) {
  try {
    const buffer = await buildOnboardingTemplate();

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="employee-onboarding-template.csv"',
    );
    res.send(buffer);
  } catch (error: unknown) {
    logger.error("download-onboarding-template error:", { error });
    return handleError(res, error);
  }
}

/**
 * POST /bulk-onboarding/upload-url
 * Same presigned-PUT pattern as the resume upload (general.ts/recruitment.ts)
 * — the filled-in CSV goes straight from the browser to S3, restricted here
 * to .csv only rather than the general upload endpoint's broader whitelist.
 */
export async function getOnboardingImportUploadUrl(
  req: Request,
  res: Response,
) {
  try {
    const { fileName, fileType } = req.body as {
      fileName: string;
      fileType: string;
    };

    const ext = path.extname(fileName).toLowerCase();
    // An empty fileType is common for .csv on some OS/browser combinations —
    // don't reject on that alone; the extension check is the primary gate.
    if (
      ext !== ALLOWED_IMPORT_EXTENSION ||
      (fileType && !ALLOWED_IMPORT_MIMETYPES.has(fileType))
    ) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "Only .csv files are accepted",
      });
    }

    const tenantId = getTenantId();
    const safeBase = sanitizePart(path.basename(fileName, ext)) ?? "import";
    if (!tenantId) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "No active tenant",
      });
    }

    const key = `bulk-onboarding/${tenantId}/${safeBase}_${Date.now()}_${Math.random().toString(36).substring(7)}${ext}`;
    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      ContentType: fileType,
    });
    const url = await getSignedUrl(s3Client, command, { expiresIn: 300 });

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Pre-signed URL generated",
      data: { url, key },
    });
  } catch (error: unknown) {
    logger.error("onboarding-import-upload-url error:", { error });
    return handleError(res, error);
  }
}

async function fetchS3Buffer(key: string): Promise<Buffer> {
  const response = await s3Client.send(
    new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }),
  );
  const bytes = await (response.Body as any).transformToByteArray();
  return Buffer.from(bytes);
}

interface FullValidationResult {
  valid: boolean;
  summary: { sheetName: string; rows: number; errors: number }[];
  errors: { sheetName: string; row: number; message: string }[];
  candidates: ParsedRow[];
}

// Shared by both /validate (report-only) and /commit (report, then write
// only if this comes back clean) — commit deliberately re-runs this against
// a fresh S3 fetch rather than trusting an earlier /validate call, since
// DB state (e.g. another import landing in between) can change either
// answer between the two requests.
async function runFullValidation(key: string): Promise<FullValidationResult> {
  const buffer = await fetchS3Buffer(key);
  const { employees } = await parseWorkbook(buffer);

  const errors: FullValidationResult["errors"] = employees.errors.map((e) => ({
    sheetName: "Employees",
    row: e.row,
    message: e.message,
  }));

  const seenAt = new Map<string, number>();
  for (const row of employees.rows) {
    const rawEmail = row.values.officialEmail as string | null;
    if (!rawEmail) continue;
    const canon = canonicalizeEmail(rawEmail);
    const firstRow = seenAt.get(canon);
    if (firstRow) {
      errors.push({
        sheetName: "Employees",
        row: row.rowNumber,
        message: `Duplicate "Official Email" — already used on row ${firstRow}`,
      });
    } else {
      seenAt.set(canon, row.rowNumber);
    }
  }

  if (seenAt.size > 0) {
    const existing = await masterPrisma.user.findMany({
      where: { email: { in: Array.from(seenAt.keys()) } },
      select: { email: true },
    });
    const existingEmails = new Set(existing.map((u) => u.email));
    for (const row of employees.rows) {
      const rawEmail = row.values.officialEmail as string | null;
      if (!rawEmail) continue;
      const canon = canonicalizeEmail(rawEmail);
      if (existingEmails.has(canon)) {
        errors.push({
          sheetName: "Employees",
          row: row.rowNumber,
          message: `An account already exists for ${rawEmail}`,
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    summary: [
      {
        sheetName: "Employees",
        rows: employees.rows.length,
        errors: employees.errors.length,
      },
    ],
    errors,
    candidates: employees.rows,
  };
}

/**
 * POST /bulk-onboarding/validate
 * Report-only — parses and validates the whole workbook but writes nothing.
 */
export async function validateOnboardingImport(req: Request, res: Response) {
  try {
    const { key } = req.body as { key: string };
    const result = await runFullValidation(key);
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: result.valid ? "Workbook is valid" : "Workbook has errors",
      data: {
        valid: result.valid,
        summary: result.summary,
        errors: result.errors,
      },
    });
  } catch (error: unknown) {
    logger.error("validate-onboarding-import error:", { error });
    return handleError(res, error);
  }
}

/**
 * POST /bulk-onboarding/commit
 * Re-validates, and only writes if the workbook is still fully clean —
 * nothing is written for a batch with any remaining error, matching the
 * "validate everything, commit only if clean" behavior decided for this
 * feature. Once writing starts there's no cross-service transaction
 * wrapping the User/TenantMembership/SalaryStructure writes (nothing else
 * in this codebase has one either — see approveJoinRequest's salary
 * seeding), so a failure on one row after pre-validation passed is reported
 * per-row rather than assumed impossible.
 */
export async function commitOnboardingImport(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const { key } = req.body as { key: string };
    const result = await runFullValidation(key);
    if (!result.valid) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "Workbook still has validation errors — nothing was imported",
        data: {
          valid: false,
          summary: result.summary,
          errors: result.errors,
        },
      });
    }

    const tenantId = getTenantId();
    if (!tenantId) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "No active tenant",
      });
    }

    const created: { row: number; email: string; userId: string }[] = [];
    const failed: { row: number; email: string; message: string }[] = [];

    for (const candidate of result.candidates) {
      const v = candidate.values as Record<string, any>;
      const email = canonicalizeEmail(String(v.officialEmail));

      try {
        const username = await generateUniqueUsername(email);
        const newUser = await masterPrisma.user.create({
          data: {
            tenantId,
            username,
            email,
            official_email: String(v.officialEmail),
            first_name: v.firstName ?? null,
            middle_name: v.middleName ?? null,
            last_name: v.lastName ?? null,
            mobile: v.mobile ?? null,
            dob: v.dob ?? null,
            blood_group: v.bloodGroup ?? null,
            qualification: v.qualification ?? null,
            department: v.department ?? null,
            designation: v.designation ?? null,
            attendanceMode: v.attendanceMode ?? "office",
            joining_date: v.joiningDate,
            reference_by: v.referenceBy ?? null,
            permanent_address_line_1: v.permanentAddressLine1 ?? null,
            permanent_address_line_2: v.permanentAddressLine2 ?? null,
            permanent_address_city: v.permanentAddressCity ?? null,
            permanent_address_state: v.permanentAddressState ?? null,
            permanent_address_pincode: v.permanentAddressPincode ?? null,
            pan_no: v.panNo ?? null,
            aadhar_no: v.aadharNo ?? null,
            pf_no: v.pfNo ?? null,
            uan_no: v.uanNo ?? null,
            esic_no: v.esicNo ?? null,
            bank_name: v.bankName ?? null,
            bank_account_no: v.bankAccountNo ?? null,
            ifsc_code: v.ifscCode ?? null,
            employeeStatus: "Active",
            isSuperUser: false,
          },
        });

        await masterPrisma.tenantMembership.create({
          data: {
            tenantId,
            userId: newUser.id,
            role: "employee",
            invitedBy: user!.userId,
          },
        });

        // Manual breakdown (Basic Pay filled in) is passed straight through;
        // otherwise derive one from the single CTC figure via the same
        // formula seedSalaryFromHire's fallback path uses (salary.ts), so a
        // migrated employee's payslip breakup looks like every other
        // gross-only-captured hire's does.
        const joinDate = v.joiningDate as Date;
        const flatFields =
          v.basicPay != null
            ? {
                basicPay: v.basicPay,
                hra: v.hra ?? 0,
                conveyance: v.conveyance ?? 0,
                incentive: v.incentive ?? 0,
                pf: v.pf ?? 0,
                esi: v.esi ?? 0,
                pt: v.pt ?? 0,
              }
            : (() => {
                const breakup = deriveOfferCompensationBreakup(v.grossSalary);
                return {
                  basicPay: breakup.basic,
                  hra: breakup.hra,
                  conveyance: breakup.transportAllowance,
                  incentive: breakup.specialAllowance,
                  pf: breakup.employerPF,
                  esi: 0,
                  pt: 0,
                };
              })();

        await grpcCall(
          salaryClient,
          "createSalaryStructure",
          salary.CreateSalaryRequest.fromPartial({
            userId: newUser.id,
            month: joinDate.getMonth() + 1,
            year: joinDate.getFullYear(),
            ...flatFields,
          }),
        );

        created.push({ row: candidate.rowNumber, email, userId: newUser.id });
      } catch (rowError: unknown) {
        logger.error("commitOnboardingImport: row failed", {
          row: candidate.rowNumber,
          email,
          error: rowError,
        });
        failed.push({
          row: candidate.rowNumber,
          email,
          message:
            rowError instanceof Error ? rowError.message : "Unknown error",
        });
      }
    }

    logger.info("Bulk onboarding import committed", {
      tenantId,
      createdCount: created.length,
      failedCount: failed.length,
      actor: user?.userId,
    });

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message:
        failed.length === 0
          ? `${created.length} employees imported`
          : `${created.length} imported, ${failed.length} failed after passing validation`,
      data: { created, failed },
    });
  } catch (error: unknown) {
    logger.error("commit-onboarding-import error:", { error });
    return handleError(res, error);
  }
}
