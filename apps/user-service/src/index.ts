import { BaseGrpcServer } from "@hrms/grpc-server";
import { user, health } from "@hrms/proto";
import { healthCheck } from "@hrms/common";
import { handlers } from "./handlers";

export class UserServer extends BaseGrpcServer {
  constructor() {
    super();
    this.initializeServer();
  }

  private initializeServer() {
    this.addService(user.UserServiceService, handlers);
    this.addService(health.HealthServiceService, { Check: healthCheck });
  }
}
