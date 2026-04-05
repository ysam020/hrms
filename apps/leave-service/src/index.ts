import { BaseGrpcServer } from "@hrms/grpc-server";
import { leave, health } from "@hrms/proto";
import { healthCheck } from "@hrms/common";
import { handlers } from "./handlers";

export class LeaveServer extends BaseGrpcServer {
  constructor() {
    super();
    this.initializeServer();
  }

  private initializeServer() {
    this.addService(leave.LeaveServiceService, handlers);
    this.addService(health.HealthServiceService, { Check: healthCheck });
  }
}
