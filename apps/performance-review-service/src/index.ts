import { BaseGrpcServer } from "@hrms/grpc-server";
import { performanceReview, health } from "@hrms/proto";
import { healthCheck } from "@hrms/common";
import { handlers } from "./handlers";

export class PerformanceReviewServer extends BaseGrpcServer {
  constructor() {
    super();
    this.initializeServer();
  }

  private initializeServer() {
    this.addService(
      performanceReview.PerformanceReviewServiceService,
      handlers,
    );
    this.addService(health.HealthServiceService, { Check: healthCheck });
  }
}
