import { BaseGrpcServer } from "@hrms/grpc-server";
import { auth, health } from "@hrms/proto";
import { healthCheck } from "@hrms/common";
import { handlers } from "./handlers";

export class AuthServer extends BaseGrpcServer {
  constructor() {
    super();
    this.initializeServer();
  }

  private initializeServer() {
    this.addService(auth.AuthServiceService, handlers);
    this.addService(health.HealthServiceService, { Check: healthCheck });
  }
}
