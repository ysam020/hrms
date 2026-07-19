import { Worker, Job } from "bullmq";
import { getBullMQConnection, getDeadLetterQueue } from "@hrms/queue";
import type { ResumeParsingJobData } from "@hrms/queue";
import { prisma } from "@hrms/db";
import { logger, requestIdStorage } from "@hrms/logger";
import pdfParse from "pdf-parse";

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5-coder:14b";
const SCORE_THRESHOLD = 7;

async function extractTextFromBase64Pdf(base64: string): Promise<string> {
  const raw = base64.includes(",") ? base64.split(",")[1] : base64;
  const buffer = Buffer.from(raw, "base64");
  const result = await pdfParse(buffer);
  return result.text.trim();
}

async function scoreResumeWithLlm(
  resumeText: string,
  jobTitle: string,
  requiredSkills: string,
  jobDescription: string,
  experienceRequired: number,
): Promise<{ score: number; notes: string }> {
  const prompt = `You are an HR recruiter evaluating a job application.

Job Title: ${jobTitle}
Required Skills: ${requiredSkills}
Job Description: ${jobDescription}
Minimum Experience Required: ${experienceRequired} year(s)

Candidate Resume:
${resumeText.slice(0, 4000)}

Score the candidate out of 10 based on: skill match, relevant experience, education, and overall fit for the role.

Respond with ONLY valid JSON in this exact format (no other text):
{"score": <number 0-10>, "notes": "<brief reason in 1-2 sentences>"}`;

  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages: [{ role: "user", content: prompt }],
      stream: false,
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);

  const data: any = await res.json();
  const content: string = data.message?.content ?? "";

  // Strip markdown code fences if present
  const cleaned = content
    .replace(/```(?:json)?\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();
  const parsed = JSON.parse(cleaned);

  const score = Math.min(10, Math.max(0, Number(parsed.score) || 0));
  const notes = String(parsed.notes || "");
  return { score, notes };
}

async function processJob(job: Job<ResumeParsingJobData>) {
  const { applicationId } = job.data;

  const application = await prisma.jobApplication.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      resume: true,
      jobTitleId: true,
      jobOpening: {
        select: {
          jobTitle: true,
          requiredSkills: true,
          jobDescription: true,
          experience: true,
        },
      },
    },
  });

  if (!application) {
    logger.warn(`[resumeParser] Application ${applicationId} not found`);
    return;
  }
  if (!application.resume) {
    logger.warn(`[resumeParser] No resume for application ${applicationId}`);
    return;
  }

  const job_ = application.jobOpening;
  if (!job_) {
    logger.warn(
      `[resumeParser] No job opening linked to application ${applicationId}`,
    );
    return;
  }

  logger.info(`[resumeParser] Scoring application ${applicationId}`);

  const resumeText = await extractTextFromBase64Pdf(application.resume);
  if (!resumeText) {
    logger.warn(
      `[resumeParser] Empty PDF text for application ${applicationId}`,
    );
    return;
  }

  const { score, notes } = await scoreResumeWithLlm(
    resumeText,
    job_.jobTitle,
    job_.requiredSkills,
    job_.jobDescription,
    job_.experience,
  );

  const newStatus = score < SCORE_THRESHOLD ? "Rejected" : "Applied";

  await prisma.jobApplication.update({
    where: { id: applicationId },
    data: { resumeScore: score, aiNotes: notes, status: newStatus },
  });

  logger.info(
    `[resumeParser] Application ${applicationId} scored ${score}/10 → ${newStatus}`,
  );
}

export function startResumeParserWorker(): Worker {
  const worker = new Worker<ResumeParsingJobData>(
    "resumeParsingQueue",
    (job) =>
      job.data.requestId
        ? requestIdStorage.run(job.data.requestId, () => processJob(job))
        : processJob(job),
    {
      connection: getBullMQConnection(),
      concurrency: 2,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
    },
  );

  worker.on("failed", (job, err) => {
    logger.error(`[resumeParser] Job ${job?.id} failed:`, { err });
    if (job) {
      getDeadLetterQueue()
        .add("failed-resume-parse", {
          originalQueue: "resumeParsingQueue",
          jobId: job.id,
          data: job.data,
          failedReason: err.message,
          failedAt: new Date().toISOString(),
        })
        .catch((dlqErr) =>
          logger.error("[resumeParser] DLQ enqueue failed:", { dlqErr }),
        );
    }
  });

  worker.on("error", (err) => {
    logger.error("[resumeParser] Worker error:", { err });
  });

  return worker;
}
