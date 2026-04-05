import { BaseGrpcServer } from "@hrms/grpc-server";
import { salary, health } from "@hrms/proto";
import { healthCheck } from "@hrms/common";
import { handlers } from "./handlers";

export class SalaryServer extends BaseGrpcServer {
  constructor() {
    super();
    this.initializeServer();
  }

  private initializeServer() {
    this.addService(salary.SalaryServiceService, handlers);
    this.addService(health.HealthServiceService, { Check: healthCheck });
  }
}
