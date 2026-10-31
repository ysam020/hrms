import { Router } from "express";
import * as h from "../handlers/walkthrough";

// Product walkthrough progress for the signed-in person. Mounted under
// /walkthrough with authenticate + requireTenant (routes/index.ts) but not
// the subscription check: it holds no business data, and a 402 from a
// background save would bounce the person to the Subscription page.
export const walkthroughRouter: Router = Router();

walkthroughRouter.get("/progress", h.getWalkthroughProgress);
walkthroughRouter.put("/progress", h.saveWalkthroughProgress);
walkthroughRouter.delete("/progress", h.resetWalkthroughProgress);
