import { BaseGrpcServer } from "@hrms/grpc-server";
import { recruitment, health } from "@hrms/proto";
import { healthCheck } from "@hrms/common";
import { handlers } from "./handlers";

export class RecruitmentServer extends BaseGrpcServer {
  constructor() {
    super();
    this.initializeServer();
  }

  private initializeServer() {
    this.addService(recruitment.RecruitmentServiceService, handlers);
    this.addService(health.HealthServiceService, { Check: healthCheck });
  }
}
