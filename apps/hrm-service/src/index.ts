import { BaseGrpcServer } from "@hrms/grpc-server";
import { hrm, health } from "@hrms/proto";
import { healthCheck } from "@hrms/common";
import { handlers } from "./handlers";

export class HrmServer extends BaseGrpcServer {
  constructor() {
    super();
    this.initializeServer();
  }

  private initializeServer() {
    this.addService(hrm.HrmServiceService, handlers);
    this.addService(health.HealthServiceService, { Check: healthCheck });
  }
}
