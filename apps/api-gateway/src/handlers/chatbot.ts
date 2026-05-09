import { Request, Response } from "express";
import { AuthRequest } from "../middleware/authenticate";
import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5-coder:14b";

const TOOLS = [
  {
    type: "function",
    function: {
      name: "get_user_profile",
      description:
        "Get the current user's profile: name, date of birth, email, department, designation, joining date, mobile.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_leave_balance",
      description:
        "Get the current user's leave balance showing available leaves by type (paid, sick, casual, etc.).",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_leave_applications",
      description:
        "Get the current user's recent leave applications with their status (Pending, Approved, Rejected).",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description:
              "Number of recent applications to fetch (default 5, max 10)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_attendance",
      description:
        "Get the current user's attendance records and summary for a specific month and year.",
      parameters: {
        type: "object",
        properties: {
          month: {
            type: "number",
            description: "Month number (1-12). Defaults to current month.",
          },
          year: {
            type: "number",
            description: "Year (e.g., 2024). Defaults to current year.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_salary_info",
      description:
        "Get the current user's salary information: basic pay, HRA, deductions, net payable, and latest payslip.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_policies",
      description:
        "Get company HR policies. Use a search term to find specific policies such as maternity leave, work from home, code of conduct, etc.",
      parameters: {
        type: "object",
        properties: {
          search: {
            type: "string",
            description:
              "Search term for policy type or name. Leave empty to get all active policies.",
          },
        },
        required: [],
      },
    },
  },
];

function parseTextToolCall(
  content: string,
): { name: string; arguments: any } | null {
  const cleaned = content
    .replace(/```(?:json)?\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed.name && typeof parsed.name === "string") {
      return {
        name: parsed.name,
        arguments: parsed.arguments ?? parsed.args ?? {},
      };
    }
    if (parsed.tool && typeof parsed.tool === "string") {
      return {
        name: parsed.tool,
        arguments: parsed.args ?? parsed.arguments ?? {},
      };
    }
  } catch {
    // not a JSON tool call
  }
  return null;
}

async function executeToolCall(
  toolName: string,
  args: Record<string, any>,
  userId: string,
  username: string,
): Promise<string> {
  try {
    switch (toolName) {
      case "get_user_profile": {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            first_name: true,
            middle_name: true,
            last_name: true,
            username: true,
            email: true,
            official_email: true,
            dob: true,
            blood_group: true,
            qualification: true,
            department: true,
            designation: true,
            joining_date: true,
            mobile: true,
            employeeStatus: true,
            wfh: true,
          },
        });
        return JSON.stringify(user ?? {});
      }

      case "get_leave_balance": {
        const balance = await prisma.leaveBalance.findUnique({
          where: { username },
        });
        return JSON.stringify(balance ?? { username, balances: {} });
      }

      case "get_leave_applications": {
        const limit = Math.min(Number(args.limit) || 5, 10);
        const leaves = await prisma.leaveApplication.findMany({
          where: { username },
          orderBy: { appliedOn: "desc" },
          take: limit,
          select: {
            id: true,
            from: true,
            to: true,
            leaveType: true,
            days: true,
            status: true,
            reason: true,
            appliedOn: true,
            approvedByUsername: true,
            approvedOn: true,
          },
        });
        return JSON.stringify(leaves);
      }

      case "get_attendance": {
        const now = new Date();
        const month = Number(args.month) || now.getMonth() + 1;
        const year = Number(args.year) || now.getFullYear();
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0, 23, 59, 59);
        const records = await prisma.attendanceRecord.findMany({
          where: { username, date: { gte: startDate, lte: endDate } },
          orderBy: { date: "asc" },
          select: {
            date: true,
            timeIn: true,
            timeOut: true,
            workingHours: true,
            status: true,
          },
        });
        return JSON.stringify({
          month,
          year,
          totalDays: records.length,
          present: records.filter((r: any) => r.status === "Present").length,
          absent: records.filter((r: any) => r.status === "Absent").length,
          late: records.filter((r: any) => r.status === "Late").length,
          records: records.slice(0, 15),
        });
      }

      case "get_salary_info": {
        const [user, latestSlip] = await Promise.all([
          prisma.user.findUnique({
            where: { id: userId },
            select: {
              salary: true,
              salaryBasicPay: true,
              salaryHra: true,
              salaryConveyance: true,
              salaryPf: true,
              salaryEsi: true,
              salaryPt: true,
            },
          }),
          prisma.salaryStructure.findFirst({
            where: { username },
            orderBy: [{ year: "desc" }, { month: "desc" }],
            select: {
              month: true,
              year: true,
              grossSalary: true,
              basicPay: true,
              hra: true,
              conveyance: true,
              pf: true,
              esi: true,
              pt: true,
              deductions: true,
              grossEarnings: true,
              netPayable: true,
            },
          }),
        ]);
        return JSON.stringify({
          salaryConfig: user,
          latestPayslip: latestSlip,
        });
      }

      case "get_policies": {
        const search = String(args.search ?? "").trim();
        const baseWhere = { status: { not: "deleted" } };
        const where: any = { ...baseWhere };
        if (search) {
          where.OR = [
            { policyName: { contains: search, mode: "insensitive" } },
            { policyType: { contains: search, mode: "insensitive" } },
            { content: { contains: search, mode: "insensitive" } },
          ];
        }
        let policies = await prisma.policy.findMany({
          where,
          select: {
            id: true,
            policyType: true,
            policyName: true,
            content: true,
          },
          take: 3,
        });
        // Search matched nothing — return all active policies so the LLM can
        // identify the relevant one (e.g. "POSH" → "Prevention of Sexual Harassment")
        if (search && policies.length === 0) {
          policies = await prisma.policy.findMany({
            where: baseWhere,
            select: {
              id: true,
              policyType: true,
              policyName: true,
              content: true,
            },
            take: 5,
          });
        }
        return JSON.stringify(policies);
      }

      default:
        return JSON.stringify({ error: "Unknown tool" });
    }
  } catch (error: any) {
    logger.error(`Chatbot tool call error [${toolName}]:`, { error });
    return JSON.stringify({ error: "Failed to fetch data" });
  }
}

export async function chatbotMessage(req: Request, res: Response) {
  const { user } = req as AuthRequest;

  // Validate before setting SSE headers so errors still return JSON
  const { message, history = [] } = req.body;

  if (!message || typeof message !== "string" || !message.trim()) {
    return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
      message: "Message is required",
    });
  }
  if (message.length > 1000) {
    return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
      message: "Message too long (max 1000 characters)",
    });
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user!.userId },
    select: {
      username: true,
      first_name: true,
      last_name: true,
      department: true,
      designation: true,
    },
  });

  if (!dbUser) {
    return apiResponse(res, RESPONSE_STATUS.UN_AUTHORIZED, {
      message: "User not found",
    });
  }

  // Switch to SSE after validation passes
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    const username = dbUser.username;
    const fullName =
      [dbUser.first_name, dbUser.last_name].filter(Boolean).join(" ") ||
      username;

    const systemPrompt = `You are an HRMS (Human Resource Management System) assistant. Help employees with HR-related matters only.

Current user: ${fullName} (username: ${username}), Department: ${dbUser.department || "N/A"}, Designation: ${dbUser.designation || "N/A"}

TOOL USAGE (MANDATORY — NEVER SKIP):
- Before answering ANY question about the user's personal data (DOB, blood group, salary, leaves, attendance, profile fields), you MUST call the appropriate tool first.
- NEVER answer data questions from memory, assumptions, or placeholders like "[insert value]" or "[actual DOB]".
- If a tool returns empty or no data, say so explicitly — never fabricate or guess values.
- Questions about "my DOB", "my salary", "my blood group", "my leaves", "my attendance" → always call get_user_profile, get_salary_info, get_leave_balance, or get_attendance BEFORE responding.

PRIVACY RULES (STRICTLY ENFORCED):
- You MUST freely answer questions about the current user's OWN data. Never refuse the current user's own information.
- You can ONLY provide data about the current user (${username}). NEVER reveal another employee's personal information.
- If asked about a DIFFERENT person's data, respond: "I cannot share other employees' personal information due to our privacy policy."
- "My blood group", "my salary", "my DOB" etc. always refer to the current user (${username}).

SCOPE RULES:
- Only answer HRMS-related questions: leaves, attendance, salary, company policies, HR processes, benefits, holidays, resignation, recruitment.
- For off-topic questions (general knowledge, coding help, math, politics, etc.), respond: "I'm your HRMS assistant and can only help with HR and workplace-related questions."
- Simple greetings, pleasantries, and thanks are fine to respond to naturally.

RESPONSE STYLE:
- Be concise, professional, and helpful.
- Present data in a clean, readable format.
- Always use real data from tools — never use placeholder text.`;

    const historyMessages = (Array.isArray(history) ? history : [])
      .slice(-10)
      .filter(
        (h: any) =>
          h &&
          (h.role === "user" || h.role === "assistant") &&
          typeof h.content === "string" &&
          h.content.trim(),
      )
      .map((h: any) => ({ role: h.role, content: h.content }));

    const messages: any[] = [
      { role: "system", content: systemPrompt },
      ...historyMessages,
      { role: "user", content: message.trim() },
    ];

    // ── Phase 1: non-streaming tool resolution ─────────────────────────────
    let ollamaRes = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages,
        tools: TOOLS,
        stream: false,
      }),
      signal: AbortSignal.timeout(90_000),
    });

    if (!ollamaRes.ok) throw new Error(`Ollama HTTP ${ollamaRes.status}`);

    let ollamaData: any = await ollamaRes.json();
    const fullMessages = [...messages];
    let iterations = 0;

    while (iterations++ < 5) {
      const officialCalls: any[] = ollamaData.message?.tool_calls ?? [];
      const textCall =
        officialCalls.length === 0
          ? parseTextToolCall(ollamaData.message?.content ?? "")
          : null;

      if (officialCalls.length === 0 && !textCall) break;

      if (officialCalls.length > 0) {
        fullMessages.push(ollamaData.message);
        for (const toolCall of officialCalls) {
          const result = await executeToolCall(
            toolCall.function.name,
            toolCall.function.arguments ?? {},
            user!.userId,
            username,
          );
          fullMessages.push({ role: "tool", content: result });
        }
      } else if (textCall) {
        const result = await executeToolCall(
          textCall.name,
          textCall.arguments,
          user!.userId,
          username,
        );
        fullMessages.push({
          role: "assistant",
          content: ollamaData.message.content,
        });
        fullMessages.push({
          role: "user",
          content: `Tool result for "${textCall.name}": ${result}\n\nNow please answer my original question using this data.`,
        });
      }

      ollamaRes = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          messages: fullMessages,
          stream: false,
        }),
        signal: AbortSignal.timeout(90_000),
      });

      if (!ollamaRes.ok) throw new Error(`Ollama HTTP ${ollamaRes.status}`);
      ollamaData = (await ollamaRes.json()) as any;
    }

    // ── Phase 2: streaming final answer ───────────────────────────────────
    // If we already have a plain-text answer (no tool calls were needed or
    // the last non-streaming call produced the final content), stream it
    // token-by-token directly from Ollama.
    const streamRes = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: fullMessages,
        stream: true,
      }),
      signal: AbortSignal.timeout(90_000),
    });

    if (!streamRes.ok || !streamRes.body) {
      throw new Error(`Ollama stream HTTP ${streamRes.status}`);
    }

    const reader = streamRes.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const chunk = JSON.parse(line);
          const token: string = chunk.message?.content ?? "";
          if (token) send({ token });
          if (chunk.done) {
            send({ done: true });
            res.end();
            return;
          }
        } catch {
          // malformed chunk — skip
        }
      }
    }

    send({ done: true });
    res.end();
  } catch (error: any) {
    const isTimeout =
      error.name === "TimeoutError" ||
      error.name === "AbortError" ||
      error.cause?.code === "UND_ERR_CONNECT_ERR";

    const msg = isTimeout
      ? "AI service is unavailable. Please ensure Ollama is running."
      : "Failed to process your request. Please try again.";

    logger.error("Chatbot handler error:", { error });
    send({ error: msg });
    res.end();
  }
}
