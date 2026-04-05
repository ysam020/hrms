import { BaseGrpcServer } from "@hrms/grpc-server";
import { attendance, health } from "@hrms/proto";
import { healthCheck } from "@hrms/common";
import { handlers } from "./handlers";

export class AttendanceServer extends BaseGrpcServer {
  constructor() {
    super();
    this.initializeServer();
  }

  private initializeServer() {
    this.addService(attendance.AttendanceServiceService, handlers);
    this.addService(health.HealthServiceService, { Check: healthCheck });
  }
}
