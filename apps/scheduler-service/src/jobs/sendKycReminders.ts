import { prisma } from "@hrms/db";
import { sendEmail } from "@hrms/common";
import { logger } from "@hrms/logger";

function getFullName(user: {
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  username: string;
}): string {
  return (
    [user.first_name, user.middle_name, user.last_name]
      .filter(Boolean)
      .join(" ") || user.username
  );
}

function kycReminderHtml(
  fullName: string,
  status: string,
  recipient: "employee" | "hr",
  username = "",
): string {
  const employeeInfo = username ? ` (Username: ${username})` : "";

  let title: string;
  let message: string;

  if (recipient === "hr") {
    switch (status) {
      case "missing":
        title = "KYC Missing Alert";
        message = `Employee ${fullName}${employeeInfo} has not submitted their KYC documentation. Please follow up with the employee to ensure compliance requirements are met.`;
        break;
      case "rejected":
        title = "KYC Rejected - Follow-up Required";
        message = `Employee ${fullName}${employeeInfo} has rejected KYC documentation. Please provide guidance to the employee for proper resubmission.`;
        break;
      default:
        title = "KYC Pending Review";
        message = `Employee ${fullName}${employeeInfo} has submitted KYC documentation that is pending your review and approval.`;
    }
  } else {
    switch (status) {
      case "missing":
        title = "KYC Submission Required";
        message =
          "Your KYC documentation has not been submitted. Please complete the KYC form with all required documents to proceed with your account verification.";
        break;
      default:
        title = "KYC Resubmission Required";
        message =
          "Your KYC application has been rejected due to documentation issues. Please complete the KYC form again with correct and complete documents to proceed with the verification process.";
    }
  }

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>${title}</title></head>
<body style="font-family:Arial,sans-serif;padding:20px">
<h2>Hello ${recipient === "hr" ? "HR Team" : fullName},</h2>
<p><strong>${title}</strong></p>
<p>${message}</p>
<p>${recipient === "hr" ? "Please take appropriate action as needed." : "Should you have any questions, please don't hesitate to ask."}</p>
<p>Warm regards,<br/>Praesto Team</p>
</body></html>`;
}

const subjectMap: Record<string, Record<string, string>> = {
  employee: {
    missing: "KYC Submission Required - Action Needed",
    rejected: "KYC Resubmission Required - Application Rejected",
  },
  hr: {
    missing: "KYC Missing Alert",
    rejected: "KYC Rejected - Follow-up Required",
    pending: "KYC Pending Review",
  },
};

export async function sendKycReminders(): Promise<void> {
  try {
    const hrEmail = process.env.HR_EMAIL || process.env.DEV_EMAIL;
    const emailFrom = process.env.EMAIL_FROM;

    const [missingUsers, rejectedUsers, pendingUsers] = await Promise.all([
      prisma.user.findMany({
        where: { OR: [{ kyc_approval: null }, { kyc_approval: "" }] },
        select: {
          username: true,
          email: true,
          first_name: true,
          middle_name: true,
          last_name: true,
        },
      }),
      prisma.user.findMany({
        where: { kyc_approval: "Rejected" },
        select: {
          username: true,
          email: true,
          first_name: true,
          middle_name: true,
          last_name: true,
        },
      }),
      prisma.user.findMany({
        where: { kyc_approval: "Pending" },
        select: {
          username: true,
          email: true,
          first_name: true,
          middle_name: true,
          last_name: true,
        },
      }),
    ]);

    // Missing KYC - notify employee + HR
    for (const user of missingUsers) {
      const fullName = getFullName(user);
      if (user.email) {
        await sendEmail({
          to: user.email,
          subject: subjectMap.employee.missing,
          html: kycReminderHtml(fullName, "missing", "employee"),
          from: emailFrom,
        }).catch((e: unknown) =>
          logger.warn(`KYC email to ${user.email} failed`, { e }),
        );
      }
      if (hrEmail) {
        await sendEmail({
          to: hrEmail,
          subject: `${subjectMap.hr.missing} - ${fullName} (${user.username})`,
          html: kycReminderHtml(fullName, "missing", "hr", user.username),
          from: emailFrom,
        }).catch((e: unknown) =>
          logger.warn(`KYC HR email failed for ${user.username}`, { e }),
        );
      }
    }

    // Rejected KYC - notify employee + HR
    for (const user of rejectedUsers) {
      const fullName = getFullName(user);
      if (user.email) {
        await sendEmail({
          to: user.email,
          subject: subjectMap.employee.rejected,
          html: kycReminderHtml(fullName, "rejected", "employee"),
          from: emailFrom,
        }).catch((e: unknown) =>
          logger.warn(`KYC email to ${user.email} failed`, { e }),
        );
      }
      if (hrEmail) {
        await sendEmail({
          to: hrEmail,
          subject: `${subjectMap.hr.rejected} - ${fullName} (${user.username})`,
          html: kycReminderHtml(fullName, "rejected", "hr", user.username),
          from: emailFrom,
        }).catch((e: unknown) =>
          logger.warn(`KYC HR email failed for ${user.username}`, { e }),
        );
      }
    }

    // Pending KYC - notify HR only
    for (const user of pendingUsers) {
      const fullName = getFullName(user);
      if (hrEmail) {
        await sendEmail({
          to: hrEmail,
          subject: `${subjectMap.hr.pending} - ${fullName} (${user.username})`,
          html: kycReminderHtml(fullName, "pending", "hr", user.username),
          from: emailFrom,
        }).catch((e: unknown) =>
          logger.warn(`KYC HR email failed for ${user.username}`, { e }),
        );
      }
    }

    logger.info(
      `sendKycReminders: processed missing=${missingUsers.length} rejected=${rejectedUsers.length} pending=${pendingUsers.length}`,
    );
  } catch (error) {
    logger.error("Error in KYC reminder job:", { error });
    throw error;
  }
}
