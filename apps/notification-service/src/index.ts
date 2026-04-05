import { BaseGrpcServer } from "@hrms/grpc-server";
import { notification, health } from "@hrms/proto";
import { healthCheck } from "@hrms/common";
import { handlers } from "./handlers";

export class NotificationServer extends BaseGrpcServer {
  constructor() {
    super();
    this.initializeServer();
  }

  private initializeServer() {
    this.addService(notification.NotificationServiceService, handlers);
    this.addService(health.HealthServiceService, { Check: healthCheck });
  }
}
