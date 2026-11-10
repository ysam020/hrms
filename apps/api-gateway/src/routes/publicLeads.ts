import { Router } from "express";
import { validate } from "../middleware/validate";
import { publicLeadSchema } from "../schemas";
import { submitLead } from "../handlers/leads";

// The website's "Book a Demo" / "Contact Sales" form. Anonymous by design:
// mounted with no authenticate/tenant/subscription guard (routes/index.ts).
// Rate-limited per IP by leadWriteLimiter (config/rateLimiters.ts).
export const publicLeadsRouter: Router = Router();

publicLeadsRouter.post("/public/leads", validate(publicLeadSchema), submitLead);
