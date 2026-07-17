import { prisma } from "@hrms/db";
import { checkTicketSla } from "../jobs/checkTicketSla";

jest.mock("@hrms/db", () => ({
  prisma: {
    ticket: { updateMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockUpdateMany = (prisma as any).ticket.updateMany as jest.Mock;
const mockFindUnique = (prisma as any).ticket.findUnique as jest.Mock;
const mockUpdate = (prisma as any).ticket.update as jest.Mock;

describe("checkTicketSla", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("bulk sweep mode (no ticketId)", () => {
    it("marks all overdue, unresolved tickets as SLA-breached", async () => {
      mockUpdateMany.mockResolvedValue({ count: 5 });

      await checkTicketSla();

      expect(mockUpdateMany).toHaveBeenCalledWith({
        where: {
          slaBreached: false,
          slaDeadline: { lte: expect.any(Date) },
          status: { notIn: ["resolved", "closed"] },
        },
        data: { slaBreached: true },
      });
      expect(mockFindUnique).not.toHaveBeenCalled();
    });

    it("is a no-op when nothing is overdue", async () => {
      mockUpdateMany.mockResolvedValue({ count: 0 });
      await expect(checkTicketSla()).resolves.toBeUndefined();
    });

    it("is also used when called with data but no ticketId", async () => {
      mockUpdateMany.mockResolvedValue({ count: 1 });
      await checkTicketSla({});
      expect(mockUpdateMany).toHaveBeenCalled();
    });
  });

  describe("targeted mode (with ticketId)", () => {
    it("logs and returns when the ticket does not exist", async () => {
      mockFindUnique.mockResolvedValue(null);
      await checkTicketSla({ ticketId: "missing" });
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it("skips a ticket that is already marked breached", async () => {
      mockFindUnique.mockResolvedValue({
        id: "t1",
        status: "open",
        slaBreached: true,
        slaDeadline: new Date(),
      });
      await checkTicketSla({ ticketId: "t1" });
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it.each(["resolved", "closed"])(
      "skips a ticket that is already %s",
      async (status) => {
        mockFindUnique.mockResolvedValue({
          id: "t1",
          status,
          slaBreached: false,
          slaDeadline: new Date(),
        });
        await checkTicketSla({ ticketId: "t1" });
        expect(mockUpdate).not.toHaveBeenCalled();
      },
    );

    it("marks an open, un-breached ticket as SLA-breached", async () => {
      mockFindUnique.mockResolvedValue({
        id: "t1",
        status: "open",
        slaBreached: false,
        slaDeadline: new Date(),
      });

      await checkTicketSla({ ticketId: "t1" });

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: "t1" },
        data: { slaBreached: true },
      });
    });
  });
});
