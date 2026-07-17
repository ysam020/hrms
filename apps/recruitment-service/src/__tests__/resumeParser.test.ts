const mockDlqAdd = jest.fn().mockResolvedValue(undefined);

jest.mock("@hrms/queue", () => ({
  getBullMQConnection: jest.fn(() => ({ host: "mock-redis" })),
  getDeadLetterQueue: jest.fn(() => ({ add: mockDlqAdd })),
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock("@hrms/db", () => ({
  prisma: {
    jobApplication: { findUnique: jest.fn(), update: jest.fn() },
  },
}));

jest.mock("pdf-parse", () =>
  jest.fn().mockResolvedValue({ text: "  Experienced software engineer.  " }),
);

let capturedWorker: {
  processor: (job: any) => Promise<void>;
  opts: any;
  handlers: Record<string, (...args: any[]) => void>;
} | null = null;

jest.mock("bullmq", () => ({
  Worker: jest.fn().mockImplementation(function (
    this: any,
    _queueName: string,
    processor: any,
    opts: any,
  ) {
    this.handlers = {};
    this.on = (event: string, handler: any) => {
      this.handlers[event] = handler;
      return this;
    };
    capturedWorker = { processor, opts, handlers: this.handlers };
    return this;
  }),
}));

import { logger } from "@hrms/logger";
import { prisma } from "@hrms/db";
import pdfParse from "pdf-parse";
import { startResumeParserWorker } from "../workers/resumeParser";

function mockOllamaResponse(body: string, ok = true) {
  (global as any).fetch = jest.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: async () => ({ message: { content: body } }),
  });
}

function makeApplication(overrides: Partial<any> = {}) {
  return {
    id: "app1",
    resume: "data:application/pdf;base64,JVBERi0xLjQ=",
    jobTitleId: "jt1",
    jobOpening: {
      jobTitle: "Backend Engineer",
      requiredSkills: "Node.js, TypeScript",
      jobDescription: "Build APIs",
      experience: 2,
    },
    ...overrides,
  };
}

describe("startResumeParserWorker", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedWorker = null;
    mockOllamaResponse(JSON.stringify({ score: 8, notes: "Strong match" }));
  });

  it("constructs the worker against resumeParsingQueue with concurrency 2", () => {
    startResumeParserWorker();
    expect(capturedWorker!.opts).toMatchObject({ concurrency: 2 });
  });

  it("warns and skips when the application does not exist", async () => {
    (prisma.jobApplication.findUnique as jest.Mock).mockResolvedValue(null);
    startResumeParserWorker();

    await capturedWorker!.processor({ data: { applicationId: "app1" } });

    expect(logger.warn).toHaveBeenCalledWith(
      "[resumeParser] Application app1 not found",
    );
    expect(pdfParse).not.toHaveBeenCalled();
  });

  it("warns and skips when the application has no resume", async () => {
    (prisma.jobApplication.findUnique as jest.Mock).mockResolvedValue(
      makeApplication({ resume: null }),
    );
    startResumeParserWorker();

    await capturedWorker!.processor({ data: { applicationId: "app1" } });

    expect(logger.warn).toHaveBeenCalledWith(
      "[resumeParser] No resume for application app1",
    );
    expect(pdfParse).not.toHaveBeenCalled();
  });

  it("warns and skips when the application has no linked job opening", async () => {
    (prisma.jobApplication.findUnique as jest.Mock).mockResolvedValue(
      makeApplication({ jobOpening: null }),
    );
    startResumeParserWorker();

    await capturedWorker!.processor({ data: { applicationId: "app1" } });

    expect(logger.warn).toHaveBeenCalledWith(
      "[resumeParser] No job opening linked to application app1",
    );
    expect(pdfParse).not.toHaveBeenCalled();
  });

  it("warns and skips when the extracted PDF text is empty", async () => {
    (prisma.jobApplication.findUnique as jest.Mock).mockResolvedValue(
      makeApplication(),
    );
    (pdfParse as unknown as jest.Mock).mockResolvedValueOnce({ text: "   " });
    startResumeParserWorker();

    await capturedWorker!.processor({ data: { applicationId: "app1" } });

    expect(logger.warn).toHaveBeenCalledWith(
      "[resumeParser] Empty PDF text for application app1",
    );
    expect(prisma.jobApplication.update).not.toHaveBeenCalled();
  });

  it("scores the resume, marks it Applied when at/above the threshold, and saves score+notes", async () => {
    (prisma.jobApplication.findUnique as jest.Mock).mockResolvedValue(
      makeApplication(),
    );
    mockOllamaResponse(JSON.stringify({ score: 7, notes: "Meets bar" }));
    startResumeParserWorker();

    await capturedWorker!.processor({ data: { applicationId: "app1" } });

    expect(prisma.jobApplication.update).toHaveBeenCalledWith({
      where: { id: "app1" },
      data: { resumeScore: 7, aiNotes: "Meets bar", status: "Applied" },
    });
  });

  it("marks the application Rejected when the score is below the threshold", async () => {
    (prisma.jobApplication.findUnique as jest.Mock).mockResolvedValue(
      makeApplication(),
    );
    mockOllamaResponse(
      JSON.stringify({ score: 6, notes: "Not enough experience" }),
    );
    startResumeParserWorker();

    await capturedWorker!.processor({ data: { applicationId: "app1" } });

    expect(prisma.jobApplication.update).toHaveBeenCalledWith({
      where: { id: "app1" },
      data: {
        resumeScore: 6,
        aiNotes: "Not enough experience",
        status: "Rejected",
      },
    });
  });

  it("clamps an out-of-range score into 0-10", async () => {
    (prisma.jobApplication.findUnique as jest.Mock).mockResolvedValue(
      makeApplication(),
    );
    mockOllamaResponse(JSON.stringify({ score: 15, notes: "great" }));
    startResumeParserWorker();

    await capturedWorker!.processor({ data: { applicationId: "app1" } });

    expect(prisma.jobApplication.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ resumeScore: 10 }),
      }),
    );
  });

  it("treats a non-numeric score as 0", async () => {
    (prisma.jobApplication.findUnique as jest.Mock).mockResolvedValue(
      makeApplication(),
    );
    mockOllamaResponse(JSON.stringify({ score: "not-a-number", notes: "n/a" }));
    startResumeParserWorker();

    await capturedWorker!.processor({ data: { applicationId: "app1" } });

    expect(prisma.jobApplication.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ resumeScore: 0, status: "Rejected" }),
      }),
    );
  });

  it("strips markdown code fences from the LLM response before parsing", async () => {
    (prisma.jobApplication.findUnique as jest.Mock).mockResolvedValue(
      makeApplication(),
    );
    mockOllamaResponse('```json\n{"score": 9, "notes": "Excellent"}\n```');
    startResumeParserWorker();

    await capturedWorker!.processor({ data: { applicationId: "app1" } });

    expect(prisma.jobApplication.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ resumeScore: 9, aiNotes: "Excellent" }),
      }),
    );
  });

  it("throws when the Ollama request itself fails", async () => {
    (prisma.jobApplication.findUnique as jest.Mock).mockResolvedValue(
      makeApplication(),
    );
    mockOllamaResponse("", false);
    startResumeParserWorker();

    await expect(
      capturedWorker!.processor({ data: { applicationId: "app1" } }),
    ).rejects.toThrow("Ollama HTTP 500");
  });

  it("forwards a failed job to the dead-letter queue", async () => {
    startResumeParserWorker();
    const job = { id: "j1", data: { applicationId: "app1" } };

    capturedWorker!.handlers.failed(job, new Error("scoring crashed"));
    await new Promise((resolve) => setImmediate(resolve));

    expect(mockDlqAdd).toHaveBeenCalledWith(
      "failed-resume-parse",
      expect.objectContaining({
        originalQueue: "resumeParsingQueue",
        jobId: "j1",
        failedReason: "scoring crashed",
      }),
    );
  });

  it("logs (but does not throw) when the dead-letter enqueue itself fails", async () => {
    mockDlqAdd.mockRejectedValueOnce(new Error("redis down"));
    startResumeParserWorker();
    const job = { id: "j2", data: { applicationId: "app1" } };

    capturedWorker!.handlers.failed(job, new Error("scoring crashed"));
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    expect(logger.error).toHaveBeenCalledWith(
      "[resumeParser] DLQ enqueue failed:",
      {
        dlqErr: expect.any(Error),
      },
    );
  });

  it("does not forward to the DLQ when there is no job object", () => {
    startResumeParserWorker();
    capturedWorker!.handlers.failed(undefined, new Error("scoring crashed"));
    expect(mockDlqAdd).not.toHaveBeenCalled();
  });

  it("logs worker-level errors", () => {
    startResumeParserWorker();
    capturedWorker!.handlers.error(new Error("conn lost"));
    expect(logger.error).toHaveBeenCalledWith("[resumeParser] Worker error:", {
      err: expect.any(Error),
    });
  });
});
