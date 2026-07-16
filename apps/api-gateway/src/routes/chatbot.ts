import { Router } from "express";
import rateLimit from "express-rate-limit";
import { authenticate } from "../middleware/authenticate";
import * as h from "../handlers/chatbot";

const chatbotLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later" },
});

export const chatbotRouter: Router = Router();

chatbotRouter.post(
  "/chatbot/message",
  chatbotLimiter,
  authenticate,
  h.chatbotMessage,
);
