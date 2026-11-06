import { Request, Response, NextFunction, RequestHandler } from "express";
import { markHandlerStart, recordStage } from "@hrms/db";

/**
 * Wraps a middleware so its wall time (entry until it calls next) is added
 * to the request's timing scope under `name`. A middleware that ends the
 * response itself (401, 402, 429…) isn't recorded; the request is over.
 */
export function timed(name: string, mw: RequestHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const started = performance.now();
    return mw(req, res, (err?: unknown) => {
      recordStage(name, performance.now() - started);
      next(err as any);
    });
  };
}

/** Marks the end of a guard chain: everything after it is route work. */
export const guardsDone: RequestHandler = (_req, _res, next) => {
  markHandlerStart();
  next();
};
