import { BaseGrpcServer } from "@hrms/grpc-server";
import { auth, health } from "@hrms/proto";
import { healthCheck } from "@hrms/common";
import { handlers } from "./handlers";

// Methods that run without a tenant (tenant optional: when the gateway does
// send one, it is still validated). Each was traced before being listed:
// it reads or writes only master-database records (users, tenant
// memberships, tenants) and Redis — never a tenant database — and it
// authenticates the caller itself. GetProfile is deliberately absent: the
// gateway never calls it, so it keeps the default (tenant required).
export const TENANT_OPTIONAL_AUTH_METHODS = [
  // Called before any tenant is known — always without one:
  "/auth.AuthService/RefreshToken", // signed refresh token, rotated in Redis
  "/auth.AuthService/WebAuthnAuthenticationOptions", // passkey login, step 1: challenge in Redis
  "/auth.AuthService/WebAuthnAuthenticationVerify", // passkey login, step 2: verifies the signed challenge
  "/auth.AuthService/GoogleOAuthCallback", // Google login: exchanges Google's authorization code
  // Behind the gateway's authenticate; without a tenant only for a user
  // whose organisation isn't set up yet (a pending-setup token):
  "/auth.AuthService/Logout", // revokes the caller's refresh token in Redis
  "/auth.AuthService/WebAuthnRegistrationOptions", // the caller's own passkey registration
  "/auth.AuthService/WebAuthnRegistrationVerify",
] as const;

export class AuthServer extends BaseGrpcServer {
  constructor() {
    super();
    this.allowWithoutTenant(...TENANT_OPTIONAL_AUTH_METHODS);
    this.initializeServer();
  }

  private initializeServer() {
    this.addService(auth.AuthServiceService, handlers);
    this.addService(health.HealthServiceService, { Check: healthCheck });
  }
}
