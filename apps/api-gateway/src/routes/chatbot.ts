import { Router } from "express";
import rateLimit from "express-rate-limit";
import { authenticate } from "../middleware/authenticate";
import * as h from "../handlers/chatbot";
import { redisStore } from "../config/rateLimiters";

// Redis-backed — this guards an LLM-backed endpoint where an in-process
// counter would let real usage scale to max × replica-count instead of the
// intended per-window ceiling, straight into API cost.
const chatbotLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later" },
  store: redisStore("rl:chatbot:"),
});

export const chatbotRouter: Router = Router();

chatbotRouter.post(
  "/chatbot/message",
  chatbotLimiter,
  authenticate,
  h.chatbotMessage,
);
