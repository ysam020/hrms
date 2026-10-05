const mockSend = jest.fn();

jest.mock("resend", () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: mockSend },
  })),
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn() },
}));

import { logger } from "@hrms/logger";
import { sendEmail } from "../email";

describe("sendEmail", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.RESEND_API_KEY = "test-key";
  });

  it("sends mail with the given options and logs success", async () => {
    mockSend.mockResolvedValue({ data: { id: "abc" }, error: null });

    await sendEmail({
      to: "a@b.com",
      subject: "Hi",
      html: "<p>hi</p>",
      from: '"Praesto" <noreply@praesto.in>',
    });

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "a@b.com",
        subject: "Hi",
        html: "<p>hi</p>",
        from: '"Praesto" <noreply@praesto.in>',
      }),
    );
    expect(logger.info).toHaveBeenCalledWith("Email sent to a@b.com");
  });

  it("passes replyTo and attachments through to Resend", async () => {
    mockSend.mockResolvedValue({ data: { id: "abc" }, error: null });

    await sendEmail({
      to: "a@b.com",
      subject: "Hi",
      html: "<p>hi</p>",
      from: '"Acme Corp HR" <hr@notifications.praesto.in>',
      replyTo: "hr@acme.example",
      attachments: [{ filename: "payslip.pdf", content: "base64content" }],
    });

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        replyTo: "hr@acme.example",
        attachments: [{ filename: "payslip.pdf", content: "base64content" }],
      }),
    );
  });

  it("passes an attachment's contentType through to Resend — required for calendar invites to render as an interactive card rather than a plain file", async () => {
    mockSend.mockResolvedValue({ data: { id: "abc" }, error: null });

    await sendEmail({
      to: "a@b.com",
      subject: "Interview invite",
      html: "<p>hi</p>",
      from: '"Acme Corp" <hr@praesto.in>',
      attachments: [
        {
          filename: "interview-invite.ics",
          content: "base64ics",
          contentType: 'text/calendar; charset="UTF-8"; method=REQUEST',
        },
      ],
    });

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [
          {
            filename: "interview-invite.ics",
            content: "base64ics",
            contentType: 'text/calendar; charset="UTF-8"; method=REQUEST',
          },
        ],
      }),
    );
  });

  it("throws when Resend returns an error payload", async () => {
    mockSend.mockResolvedValue({
      data: null,
      error: { message: "invalid from address" },
    });

    await expect(
      sendEmail({
        to: "a@b.com",
        subject: "Hi",
        html: "<p>hi</p>",
        from: '"Praesto" <noreply@praesto.in>',
      }),
    ).rejects.toThrow("invalid from address");

    expect(logger.error).toHaveBeenCalledWith(
      "Failed to send email:",
      expect.objectContaining({ error: expect.any(Error) }),
    );
  });

  it("logs and rethrows when sending fails", async () => {
    const error = new Error("Resend API down");
    mockSend.mockRejectedValue(error);

    await expect(
      sendEmail({
        to: "a@b.com",
        subject: "Hi",
        html: "<p>hi</p>",
        from: '"Praesto" <noreply@praesto.in>',
      }),
    ).rejects.toThrow("Resend API down");

    expect(logger.error).toHaveBeenCalledWith("Failed to send email:", {
      error,
    });
  });
});
