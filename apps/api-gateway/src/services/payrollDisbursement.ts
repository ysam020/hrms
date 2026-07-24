/**
 * Payroll disbursement — extracted out of payroll.ts's updatePayrollRunStatus
 * handler so it can run as a resumable BullMQ job (see
 * ../workers/payrollDisbursementWorker.ts) instead of synchronously inside
 * the status-update HTTP request. For a real employee count this is
 * 1,000+ sequential external RazorpayX calls plus per-employee DB writes —
 * far too slow for a single request/response cycle, and a crash partway
 * through used to leave the run stuck with no automated recovery.
 *
 * Resumability: every line item's payoutStatus and postProcessed flag are
 * checked before doing any work for it, so calling runPayrollDisbursement()
 * again for the same run — whether via a BullMQ retry after a crash, or via
 * the explicit POST /payroll/runs/:runId/retry-payouts endpoint — only
 * (re-)processes items that haven't reached a terminal state yet. It never
 * re-pays an item whose payout already succeeded.
 *
 * Must be called from within the correct tenant's AsyncLocalStorage context
 * (runWithTenant) — see payrollDisbursementWorker.ts.
 */

import {
  prismaWithTenant as prisma,
  prisma as masterPrisma,
  getTenantId,
} from "@hrms/db";
import { logger } from "@hrms/logger";
import { notify } from "@hrms/notifications";
import { tenantFrom, tenantReplyTo, renderEmailHtml } from "@hrms/common";
import { buildSalarySlipPdf } from "../handlers/salary";

// ─────────────────────────────────────────────────────────────────────────────
// RazorpayX Payouts helpers
//
// RazorpayX is a SEPARATE product from Razorpay Payment Gateway:
//   Existing vars (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET)  → PG, collects money FROM tenants
//   New vars below                                          → X,  sends money   TO employees
//
// Required env vars for live payouts:
//   RAZORPAY_X_KEY_ID          – RazorpayX dashboard key
//   RAZORPAY_X_KEY_SECRET      – RazorpayX dashboard secret
//   RAZORPAY_X_ACCOUNT_NUMBER  – your RazorpayX current account number
//   RAZORPAY_X_WEBHOOK_SECRET  – for verifying async payout webhooks
//
// If RAZORPAY_X_KEY_ID is absent the disburse step is flag-only (test/dev mode).
// ─────────────────────────────────────────────────────────────────────────────

const RZP_X_BASE = "https://api.razorpay.com/v1";

function getRzpXAuth(): string | null {
  const key = process.env.RAZORPAY_X_KEY_ID;
  const secret = process.env.RAZORPAY_X_KEY_SECRET;
  if (!key || !secret) return null;
  return "Basic " + Buffer.from(`${key}:${secret}`).toString("base64");
}

/**
 * Returns the RazorpayX contact_id for an employee.
 * Tries existing contact by reference_id (userId) first; creates if missing.
 * Contacts are reused across payroll runs — one per employee for life.
 */
async function getOrCreateRzpContact(
  auth: string,
  userId: string,
  name: string,
): Promise<string> {
  const listRes = await fetch(
    `${RZP_X_BASE}/contacts?reference_id=${encodeURIComponent(userId)}&count=1`,
    { headers: { Authorization: auth } },
  );
  if (listRes.ok) {
    const list = (await listRes.json()) as any;
    if (list.count > 0 && list.items?.[0]?.id)
      return list.items[0].id as string;
  }
  const createRes = await fetch(`${RZP_X_BASE}/contacts`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({ name, type: "employee", reference_id: userId }),
  });
  const body = (await createRes.json()) as any;
  if (!createRes.ok)
    throw new Error(
      body.error?.description ?? "RazorpayX contact creation failed",
    );
  return body.id as string;
}

/**
 * Creates a fund_account (bank account) under a contact.
 * A fresh fund_account is created each run so bank-detail changes are picked up.
 */
async function createRzpFundAccount(
  auth: string,
  contactId: string,
  holderName: string,
  bankAccountNo: string,
  ifsc: string,
): Promise<string> {
  const res = await fetch(`${RZP_X_BASE}/fund_accounts`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      contact_id: contactId,
      account_type: "bank_account",
      bank_account: { name: holderName, ifsc, account_number: bankAccountNo },
    }),
  });
  const body = (await res.json()) as any;
  if (!res.ok)
    throw new Error(
      body.error?.description ?? "RazorpayX fund account creation failed",
    );
  return body.id as string;
}

/**
 * Creates a RazorpayX payout and returns { id, status }.
 * X-Payout-Idempotency = runId_userId prevents double-payment on retry.
 */
async function createRzpPayout(
  auth: string,
  params: {
    accountNumber: string;
    fundAccountId: string;
    amountPaise: number;
    runId: string;
    userId: string;
    month: number;
    year: number;
  },
): Promise<{ id: string; status: string }> {
  const res = await fetch(`${RZP_X_BASE}/payouts`, {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Type": "application/json",
      "X-Payout-Idempotency": `${params.runId}_${params.userId}`,
    },
    body: JSON.stringify({
      account_number: params.accountNumber,
      fund_account_id: params.fundAccountId,
      amount: params.amountPaise, // in paise
      currency: "INR",
      mode: "IMPS", // instant; falls back to NEFT automatically
      purpose: "salary",
      queue_if_low_balance: true,
      reference_id: `${params.runId}_${params.userId}`,
      narration: `Salary ${String(params.month).padStart(2, "0")}/${params.year}`,
    }),
  });
  const body = (await res.json()) as any;
  if (!res.ok)
    throw new Error(
      body.error?.description ?? "RazorpayX payout creation failed",
    );
  return { id: body.id as string, status: body.status as string };
}

// ─────────────────────────────────────────────────────────────────────────────

export interface DisbursementSummary {
  runId: string;
  payoutOk: number;
  payoutFail: number;
  payoutPermanentlyFailed: number;
  payoutSkipped: number;
  alreadyDone: number;
  postProcessed: number;
  notifiedRecipients: number;
}

// Payout statuses that mean the bank-transfer side of a payout is fully
// settled — safe to post-process on (see toPostProcess below), since money
// genuinely moved (or was correctly deemed unnecessary, for "skipped").
// "failed" and "permanently_failed" are both deliberately excluded — never
// a reason to decrement an advance, generate a payslip, or notify the
// employee for money that never arrived.
const SUCCESSFUL_PAYOUT_STATUSES = ["processed", "processing", "skipped"];

// Statuses that stop an item from being retried on the next disbursement
// pass. Includes every successful terminal status, plus "permanently_failed"
// — a "failed" item is deliberately NOT included here, so it keeps being
// retried automatically until it either succeeds or exhausts its attempt
// budget below.
const NO_LONGER_RETRYABLE_STATUSES = [
  ...SUCCESSFUL_PAYOUT_STATUSES,
  "permanently_failed",
];

// After this many failed attempts, a payout stops being silently retried on
// every pass and is parked in the distinct "permanently_failed" terminal
// state instead. An automatic retry that keeps failing the same way (bad
// bank details, a suspended RazorpayX account, ...) isn't going to start
// succeeding on attempt 20 — past this point it needs a human to look at
// why, not an indefinite silent re-attempt loop. Recovering from
// "permanently_failed" is a deliberate manual action (clearing payoutStatus
// back to null after fixing the underlying issue), not something this
// function ever does automatically.
const MAX_PAYOUT_ATTEMPTS = 5;

function nextFailureStatus(currentAttempts: number): {
  status: "failed" | "permanently_failed";
  attempts: number;
} {
  const attempts = currentAttempts + 1;
  return {
    attempts,
    status: attempts >= MAX_PAYOUT_ATTEMPTS ? "permanently_failed" : "failed",
  };
}

function failureReasonFor(message: string, status: string): string {
  return status === "permanently_failed"
    ? `${message} (exhausted ${MAX_PAYOUT_ATTEMPTS} attempts — needs manual correction before retrying)`
    : message;
}

export async function runPayrollDisbursement(
  runId: string,
): Promise<DisbursementSummary> {
  const tenantId = getTenantId();
  const run = await prisma.payrollRun.findFirst({ where: { id: runId } });
  if (!run) {
    throw new Error(`Payroll run ${runId} not found — cannot disburse.`);
  }
  const runMonth = (run as any).month as number;
  const runYear = (run as any).year as number;

  const allLineItems = await prisma.payrollLineItem.findMany({
    where: { payrollRunId: runId },
    select: {
      id: true,
      userId: true,
      advanceDeduction: true,
      grossSalary: true,
      basicPay: true,
      hra: true,
      conveyance: true,
      pf: true,
      esi: true,
      pt: true,
      tds: true,
      totalDeductions: true,
      netPayable: true,
      payoutStatus: true,
      payoutAttempts: true,
      postProcessed: true,
    },
  });

  let payoutOk = 0;
  let payoutFail = 0;
  let payoutPermanentlyFailed = 0;
  let payoutSkipped = 0;
  let alreadyDone = 0;

  // ── 0. RazorpayX Payouts ─────────────────────────────────────────────────
  // Only line items not already in a terminal payout state get (re-)tried —
  // this is what makes calling this function again (BullMQ retry, or the
  // retry-payouts endpoint) safe: an item whose payout already succeeded in
  // a previous attempt is never re-submitted to RazorpayX. A "failed" item
  // IS included here (retried again, up to MAX_PAYOUT_ATTEMPTS); a
  // "permanently_failed" one is not.
  const retryableItems = (allLineItems as any[]).filter(
    (li) => !NO_LONGER_RETRYABLE_STATUSES.includes(li.payoutStatus ?? ""),
  );
  alreadyDone = allLineItems.length - retryableItems.length;

  // allLineItems was fetched once, above, before any payout attempt this
  // pass — its payoutStatus field goes stale the moment the loop below
  // updates the DB. Track each item's ACTUAL current status here instead of
  // trusting the in-memory copy, so post-processing (below) can gate on
  // what really happened this pass, not what the row looked like before it.
  const finalPayoutStatusById = new Map<string, string | null>(
    (allLineItems as any[]).map((li) => [li.id, li.payoutStatus ?? null]),
  );

  const rzpXAuth = getRzpXAuth();
  const rzpXAccount = process.env.RAZORPAY_X_ACCOUNT_NUMBER;
  if (rzpXAuth && rzpXAccount && retryableItems.length > 0) {
    const empIds = retryableItems.map((li: any) => li.userId);
    const employees = await prisma.user.findMany({
      where: { id: { in: empIds } },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        username: true,
        bank_account_no: true,
        ifsc_code: true,
      },
    });
    const empMap = new Map(employees.map((e) => [e.id, e]));

    for (const li of retryableItems) {
      const emp = empMap.get(li.userId);
      if (!emp || !emp.bank_account_no || !emp.ifsc_code) {
        // Should never reach here after the pre-flight check, but be safe.
        const { status: nextStatus, attempts } = nextFailureStatus(
          li.payoutAttempts ?? 0,
        );
        await prisma.payrollLineItem.update({
          where: { id: li.id },
          data: {
            payoutStatus: nextStatus,
            payoutFailureReason: failureReasonFor(
              "Missing bank details",
              nextStatus,
            ),
            payoutInitiatedAt: new Date(),
            payoutAttempts: attempts,
          },
        });
        finalPayoutStatusById.set(li.id, nextStatus);
        if (nextStatus === "permanently_failed") payoutPermanentlyFailed++;
        else payoutFail++;
        continue;
      }

      const holderName =
        `${emp.first_name ?? ""} ${emp.last_name ?? ""}`.trim() || emp.username;
      const amountPaise = Math.round(li.netPayable * 100); // RazorpayX expects paise

      // Skip zero/negative net (e.g. full advance deduction month).
      if (amountPaise <= 0) {
        await prisma.payrollLineItem.update({
          where: { id: li.id },
          data: {
            payoutStatus: "skipped",
            payoutFailureReason: "Net payable is zero",
            payoutInitiatedAt: new Date(),
          },
        });
        finalPayoutStatusById.set(li.id, "skipped");
        payoutSkipped++;
        continue;
      }

      try {
        const contactId = await getOrCreateRzpContact(
          rzpXAuth,
          li.userId,
          holderName,
        );
        const fundAccountId = await createRzpFundAccount(
          rzpXAuth,
          contactId,
          holderName,
          emp.bank_account_no!,
          emp.ifsc_code!,
        );
        const payout = await createRzpPayout(rzpXAuth, {
          accountNumber: rzpXAccount,
          fundAccountId,
          amountPaise,
          runId,
          userId: li.userId,
          month: runMonth,
          year: runYear,
        });
        // The RazorpayX webhook fires with no auth/tenant context, so it
        // has no way to know which tenant's physical DB to look this
        // payout up in — this master-DB index is what lets it resolve
        // that before touching PayrollLineItem (see razorpayxWebhook.ts).
        //
        // upsert, not create: RazorpayX's payout idempotency key (runId_
        // userId) means a crash between the payout succeeding and the line
        // item being updated below leaves this call resumable — a retry
        // gets the SAME payout.id back from RazorpayX. A plain create would
        // hit this row's unique constraint on payoutId and throw, which the
        // catch below would then wrongly record as a fresh payout failure
        // for a payout that had already gone through.
        await prisma.payoutTenantIndex.upsert({
          where: { payoutId: payout.id },
          create: { payoutId: payout.id, tenantId: tenantId! },
          update: {},
        });
        await prisma.payrollLineItem.update({
          where: { id: li.id },
          data: {
            payoutId: payout.id,
            payoutStatus: payout.status, // "processing" usually at this point
            payoutInitiatedAt: new Date(),
          },
        });
        finalPayoutStatusById.set(li.id, payout.status);
        payoutOk++;
      } catch (payoutErr: any) {
        const { status: nextStatus, attempts } = nextFailureStatus(
          li.payoutAttempts ?? 0,
        );
        logger.error(`RazorpayX payout failed for user ${li.userId}`, {
          runId,
          err: payoutErr.message,
          attempts,
          status: nextStatus,
        });
        await prisma.payrollLineItem.update({
          where: { id: li.id },
          data: {
            payoutStatus: nextStatus,
            payoutFailureReason: failureReasonFor(
              payoutErr.message ?? "Unknown error",
              nextStatus,
            ),
            payoutInitiatedAt: new Date(),
            payoutAttempts: attempts,
          },
        });
        finalPayoutStatusById.set(li.id, nextStatus);
        if (nextStatus === "permanently_failed") payoutPermanentlyFailed++;
        else payoutFail++;
      }
    }
    logger.info(
      `RazorpayX payouts: ${payoutOk} initiated, ${payoutFail} failed, ${payoutPermanentlyFailed} permanently failed, ${payoutSkipped} skipped (zero net)`,
      { runId },
    );
  } else if (!rzpXAuth || !rzpXAccount) {
    logger.warn(
      "RAZORPAY_X_KEY_ID not configured — disburse is flag-only (no real bank transfers)",
    );
  }

  // ── 1 & 2. Advance reconciliation + payslip generation ──────────────────
  // Gated on postProcessed AND (when RazorpayX is actually configured) a
  // confirmed-success payoutStatus for THIS pass — never on a failed
  // payout. Without the payout gate, a failed bank transfer still
  // decremented the employee's advance balance, generated a payslip
  // claiming they were paid, and sent a "Salary Disbursed" notification,
  // then permanently locked that in via postProcessed, so a later
  // successful retry could never correct it. In flag-only/dev mode (no
  // RazorpayX configured) there's no real payout to gate on, so every
  // line item still post-processes, matching the original single-pass
  // behavior test/demo environments rely on. Either way, an item already
  // marked postProcessed is skipped, so a retry never double-decrements a
  // SalaryAdvance's remainingAmount or re-sends a notification.
  const rzpXConfigured = Boolean(rzpXAuth && rzpXAccount);
  const toPostProcess = (allLineItems as any[]).filter((li) => {
    if (li.postProcessed) return false;
    if (!rzpXConfigured) return true;
    return SUCCESSFUL_PAYOUT_STATUSES.includes(
      finalPayoutStatusById.get(li.id) ?? "",
    );
  });
  const justProcessedUserIds: string[] = [];

  for (const item of toPostProcess) {
    if (item.advanceDeduction && item.advanceDeduction > 0) {
      const adv = await prisma.salaryAdvance.findFirst({
        where: {
          userId: item.userId,
          status: { in: ["Approved", "Repaying"] },
        },
      });
      if (adv) {
        const newPaid = (adv as any).paidMonths + 1;
        const newRemaining =
          ((adv as any).remainingAmount ?? 0) - item.advanceDeduction;
        const isDone =
          newRemaining <= 0 || newPaid >= ((adv as any).emiMonths ?? 1);
        await prisma.salaryAdvance.update({
          where: { id: adv.id },
          data: {
            paidMonths: newPaid,
            remainingAmount: Math.max(0, newRemaining),
            status: isDone ? "Repaid" : "Repaying",
          },
        });
      }
    }

    // Generate payslip — upsert a SalaryStructure record per employee so
    // that GET /payroll/my-payslips shows the disbursed salary immediately.
    const payslipData = {
      tenantId: tenantId ?? undefined,
      userId: item.userId,
      month: runMonth,
      year: runYear,
      grossSalary: item.grossSalary,
      basicPay: item.basicPay ?? null,
      hra: item.hra ?? null,
      conveyance: item.conveyance ?? null,
      pf: item.pf ?? null,
      esi: item.esi ?? null,
      pt: item.pt ?? null,
      tds: item.tds ?? null,
      deductions: item.totalDeductions,
      advanceDeduction: item.advanceDeduction ?? 0,
      grossEarnings: item.grossSalary,
      netPayable: item.netPayable,
    };
    await prisma.salaryStructure.upsert({
      where: {
        tenantId_userId_year_month: {
          tenantId: tenantId!,
          userId: item.userId,
          month: runMonth,
          year: runYear,
        },
      },
      create: payslipData,
      update: payslipData,
    });

    await prisma.payrollLineItem.update({
      where: { id: item.id },
      data: { postProcessed: true },
    });
    justProcessedUserIds.push(item.userId);
  }

  // ── 3. Broadcast an in-app notification to newly-processed employees ────
  // Only to items processed in *this* call — an item already postProcessed
  // from an earlier attempt was already notified then.
  if (justProcessedUserIds.length > 0) {
    const notif = await prisma.notification.create({
      data: {
        tenantId: tenantId ?? undefined,
        title: "Salary Disbursed 🎉",
        message: `Your salary for ${String(runMonth).padStart(2, "0")}/${runYear} has been processed and disbursed.`,
        eventType: "payroll",
        priority: "high",
      },
    });
    await prisma.notificationRecipient.createMany({
      data: justProcessedUserIds.map((userId) => ({
        tenantId: tenantId ?? undefined,
        notificationId: notif.id,
        userId,
      })),
    });

    // Email each newly-processed employee their salary slip as a PDF
    // attachment — fire-and-forget, same as the in-app notification above;
    // a failure here shouldn't roll back post-processing that already
    // committed (the payout genuinely happened).
    Promise.all([
      prisma.user.findMany({
        where: { id: { in: justProcessedUserIds } },
        select: { id: true, email: true },
      }),
      tenantId
        ? masterPrisma.tenant.findUnique({
            where: { id: tenantId },
            select: { name: true, helpEmail: true },
          })
        : Promise.resolve(null),
    ])
      .then(async ([employees, tenant]) => {
        const tenantName = tenant?.name ?? "your organisation";
        const from = tenantFrom(tenantName);
        const replyTo = tenantReplyTo(tenant?.helpEmail);
        const monthLabel = `${String(runMonth).padStart(2, "0")}/${runYear}`;
        await Promise.all(
          employees
            .filter((e): e is { id: string; email: string } => !!e.email)
            .map(async (e) => {
              const slip = await buildSalarySlipPdf(
                e.id,
                runYear,
                runMonth,
                tenantId,
              );
              if ("error" in slip) {
                logger.warn(
                  `[payrollDisbursement] skipping payslip email for ${e.id}: ${slip.error}`,
                );
                return;
              }
              await notify({
                tenantId: tenantId!,
                event: "salarySlip",
                email: {
                  to: e.email,
                  subject: `Salary slip — ${monthLabel}`,
                  html: renderEmailHtml({
                    title: "Salary Slip",
                    tenantName,
                    bodyHtml: `<h2>Hello ${slip.employeeName},</h2><p>Your salary for <strong>${monthLabel}</strong> has been disbursed. Your salary slip is attached — the PDF is password-protected with your PAN followed by your date of birth (DDMMYYYY).</p>`,
                  }),
                  from,
                  replyTo,
                  attachments: [
                    {
                      filename: `salary_slip_${slip.employeeUsername}_${runYear}_${String(runMonth).padStart(2, "0")}.pdf`,
                      content: slip.buffer.toString("base64"),
                    },
                  ],
                },
              }).catch((err: unknown) =>
                logger.warn("[payrollDisbursement] email enqueue failed", {
                  err,
                }),
              );
            }),
        );
      })
      .catch((err) =>
        logger.warn("[payrollDisbursement] payslip email batch failed:", {
          err,
        }),
      );
  }

  logger.info(`Payroll disburse run ${runId} pass complete`, {
    payoutOk,
    payoutFail,
    payoutPermanentlyFailed,
    payoutSkipped,
    alreadyDone,
    postProcessed: justProcessedUserIds.length,
  });

  return {
    runId,
    payoutOk,
    payoutFail,
    payoutPermanentlyFailed,
    payoutSkipped,
    alreadyDone,
    postProcessed: justProcessedUserIds.length,
    notifiedRecipients: justProcessedUserIds.length,
  };
}
