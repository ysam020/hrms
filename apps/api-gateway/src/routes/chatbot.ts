import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import * as h from "../handlers/chatbot";

export const chatbotRouter: Router = Router();

chatbotRouter.post("/chatbot/message", authenticate, h.chatbotMessage);
