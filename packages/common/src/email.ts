import { Resend } from "resend";
import { logger } from "@hrms/logger";

let resend: Resend | null = null;

const getResendClient = (): Resend => {
  if (!resend) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("RESEND_API_KEY is not set");
    resend = new Resend(apiKey);
  }
  return resend;
};

export const sendEmail = async (options: {
  to: string;
  subject: string;
  html: string;
  /** Required — every caller resolves this via emailFrom.ts's tenantFrom()/PLATFORM_FROM,
   * matching whichever of the two verified sending identities the mail belongs to. */
  from: string;
  replyTo?: string;
  /** Base64-encoded file content — plays nicely with BullMQ job data (JSON, no Buffers)
   * and Resend's API accepts base64 attachment content directly.
   * contentType matters beyond just correctness of the downloaded file — e.g.
   * a calendar invite needs `text/calendar; method=REQUEST` (not just the
   * `.ics` extension) for Gmail/Outlook to render it as an interactive
   * invite card (When/Guests/Yes-No-Maybe) instead of a plain attachment. */
  attachments?: { filename: string; content: string; contentType?: string }[];
}): Promise<void> => {
  try {
    const { error } = await getResendClient().emails.send({
      from: options.from,
      to: options.to,
      subject: options.subject,
      html: options.html,
      replyTo: options.replyTo,
      attachments: options.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
    });
    if (error) throw new Error(error.message);
    logger.info(`Email sent to ${options.to}`);
  } catch (error) {
    logger.error("Failed to send email:", { error });
    throw error;
  }
};
