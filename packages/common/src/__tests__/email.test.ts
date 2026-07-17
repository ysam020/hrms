const mockSendMail = jest.fn();

jest.mock("nodemailer", () => ({
  createTransport: jest.fn().mockReturnValue({ sendMail: mockSendMail }),
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn() },
}));

import { logger } from "@hrms/logger";
import { sendEmail } from "../email";

describe("sendEmail", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("sends mail with the given options and logs success", async () => {
    mockSendMail.mockResolvedValue(undefined);

    await sendEmail({ to: "a@b.com", subject: "Hi", html: "<p>hi</p>" });

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "a@b.com",
        subject: "Hi",
        html: "<p>hi</p>",
      }),
    );
    expect(logger.info).toHaveBeenCalledWith("Email sent to a@b.com");
  });

  it("uses the provided `from` address when given", async () => {
    mockSendMail.mockResolvedValue(undefined);
    await sendEmail({
      to: "a@b.com",
      subject: "Hi",
      html: "<p>hi</p>",
      from: "custom@x.com",
    });
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({ from: "custom@x.com" }),
    );
  });

  it("logs and rethrows when sending fails", async () => {
    const error = new Error("SMTP down");
    mockSendMail.mockRejectedValue(error);

    await expect(
      sendEmail({ to: "a@b.com", subject: "Hi", html: "<p>hi</p>" }),
    ).rejects.toThrow("SMTP down");

    expect(logger.error).toHaveBeenCalledWith("Failed to send email:", {
      error,
    });
  });
});
