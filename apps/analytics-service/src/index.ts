import { BaseGrpcServer } from "@hrms/grpc-server";
import { analytics, health } from "@hrms/proto";
import { healthCheck } from "@hrms/common";
import { handlers } from "./handlers";

export class AnalyticsServer extends BaseGrpcServer {
  constructor() {
    super();
    this.initializeServer();
  }

  private initializeServer() {
    this.addService(analytics.AnalyticsServiceService, handlers);
    this.addService(health.HealthServiceService, { Check: healthCheck });
  }
}
