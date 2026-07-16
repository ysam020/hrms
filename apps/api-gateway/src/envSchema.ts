import { z } from "zod";

/**
 * Only the secrets the gateway dereferences with a non-null assertion
 * (e.g. `process.env.ACCESS_JWT_TOKEN!`) — today, a missing one crashes with
 * a bare TypeError the first time a request happens to hit that code path,
 * rather than at boot. gRPC service host/port vars are deliberately excluded
 * here: every one of them already has a working default (see
 * `grpc/clients.ts`), so requiring them would break existing default-based
 * setups rather than catch a real misconfiguration.
 */
export const envSchema = z.object({
  ACCESS_JWT_TOKEN: z.string().min(1, "required for JWT verification"),
  REFRESH_TOKEN: z.string().min(1, "required for refresh-token verification"),
  CSRF_SECRET: z.string().min(1, "required for CSRF protection"),
  RAZORPAY_KEY_ID: z.string().min(1, "required for Razorpay checkout"),
  RAZORPAY_KEY_SECRET: z.string().min(1, "required for Razorpay checkout"),
});
