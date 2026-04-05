import { BaseGrpcServer } from "@hrms/grpc-server";
import { employee, health } from "@hrms/proto";
import { healthCheck } from "@hrms/common";
import { handlers } from "./handlers";

export class EmployeeServer extends BaseGrpcServer {
  constructor() {
    super();
    this.initializeServer();
  }

  private initializeServer() {
    this.addService(employee.EmployeeServiceService, handlers);
    this.addService(health.HealthServiceService, { Check: healthCheck });
  }
}
