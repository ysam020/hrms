import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import * as h from "../handlers/chat";
import { startConversationSchema } from "../schemas";

export const chatRouter: Router = Router();

chatRouter.get("/chat/conversations", authenticate, h.getConversations);
chatRouter.post(
  "/chat/conversations/start",
  authenticate,
  validate(startConversationSchema),
  h.startConversation,
);
chatRouter.get(
  "/chat/conversations/:roomId/messages",
  authenticate,
  h.getMessages,
);
chatRouter.post(
  "/chat/conversations/:roomId/read",
  authenticate,
  h.markMessagesRead,
);
chatRouter.get("/chat/unread-counts", authenticate, h.getUnreadCounts);
chatRouter.delete("/chat/messages/:messageId", authenticate, h.deleteMessage);
chatRouter.delete(
  "/chat/conversations/:roomId",
  authenticate,
  h.deleteConversation,
);
chatRouter.get("/og-preview", authenticate, h.ogPreview);
