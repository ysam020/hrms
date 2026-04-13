import * as grpc from "@grpc/grpc-js";
import fs from "fs";
import { grpcApiRequestLogger, logger } from "@hrms/logger";
import { errorHandler } from "./error-handling";
import { validationMiddleware } from "./middleware/validation";

export class BaseGrpcServer {
  private server: grpc.Server;
  private middlewares: ((
    call: grpc.ServerUnaryCall<any, any>,
    next: () => Promise<any>,
  ) => Promise<any>)[];

  constructor() {
    this.server = new grpc.Server({
      "grpc.max_receive_message_length": 4 * 1024 * 1024,
      "grpc.max_send_message_length": 4 * 1024 * 1024,
      // Keepalive: send a ping every 30 s, expect a reply within 10 s,
      // allow pings even when there are no active RPCs.
      "grpc.keepalive_time_ms": 30_000,
      "grpc.keepalive_timeout_ms": 10_000,
      "grpc.keepalive_permit_without_calls": 1,
      "grpc.http2.min_ping_interval_without_data_ms": 10_000,
    });
    this.middlewares = [];
    this.addMiddleware(grpcApiRequestLogger);
  }

  protected addMiddleware(
    middleware: (
      call: grpc.ServerUnaryCall<any, any>,
      next: () => Promise<any>,
    ) => Promise<any>,
  ) {
    this.middlewares.push(middleware);
  }

  protected wrapHandler<Req, Res>(handler: grpc.handleUnaryCall<Req, Res>) {
    return async (
      call: grpc.ServerUnaryCall<Req, Res>,
      callback: grpc.sendUnaryData<Res>,
    ) => {
      try {
        const executeMiddlewareChain = async (index: number): Promise<Res> => {
          if (index === this.middlewares.length) {
            return new Promise<Res>((resolve, reject) => {
              try {
                handler(call, (error, response) => {
                  if (error) throw error;
                  resolve(response as Res);
                });
              } catch (error) {
                reject(error);
              }
            });
          }

          if (!this.middlewares[index]) return undefined as unknown as Res;
          return await this.middlewares[index](call, () =>
            executeMiddlewareChain(index + 1),
          );
        };

        const response = await executeMiddlewareChain(0);
        callback(null, response);
      } catch (error) {
        logger.error("Error in handler:", { error });
        const { code, message, metadata } = errorHandler(error);
        callback({ code, message, metadata }, null);
      }
    };
  }

  protected addService(
    service: grpc.ServiceDefinition,
    implementation: Record<string, grpc.handleUnaryCall<any, any>>,
  ) {
    const wrappedImpl: Record<string, ReturnType<typeof this.wrapHandler>> = {};
    for (const method in implementation) {
      const camelMethod = method.charAt(0).toLowerCase() + method.slice(1);
      wrappedImpl[camelMethod] = this.wrapHandler(implementation[method]);
    }
    this.server.addService(service, wrappedImpl);
  }

  protected wrapWithValidation(
    handler: (
      call: grpc.ServerUnaryCall<any, any>,
      callback: grpc.sendUnaryData<any>,
    ) => unknown,
    schema: import("zod").ZodSchema,
  ) {
    return async (
      call: grpc.ServerUnaryCall<any, any>,
      callback: grpc.sendUnaryData<any>,
    ) => {
      try {
        await validationMiddleware(schema)(call, async () => {
          return handler(call, callback);
        });
      } catch (error) {
        logger.error("Validation error:", { error });
        const { code, message, metadata } = errorHandler(error);
        return callback({ code, message, metadata }, null);
      }
    };
  }

  private buildServerCredentials(): grpc.ServerCredentials {
    const tlsEnabled = process.env.GRPC_TLS_ENABLED === "true";
    if (!tlsEnabled) {
      if (process.env.NODE_ENV === "production") {
        throw new Error(
          "gRPC TLS is required in production. Set GRPC_TLS_ENABLED=true with GRPC_SERVER_CERT and GRPC_SERVER_KEY.",
        );
      }
      return grpc.ServerCredentials.createInsecure();
    }

    const certPath = process.env.GRPC_SERVER_CERT;
    const keyPath = process.env.GRPC_SERVER_KEY;
    const caPath = process.env.GRPC_CA_CERT;
    if (!certPath || !keyPath) {
      throw new Error(
        "GRPC_TLS_ENABLED is true but GRPC_SERVER_CERT and GRPC_SERVER_KEY are not set",
      );
    }

    const cert = fs.readFileSync(certPath);
    const key = fs.readFileSync(keyPath);
    const ca = caPath ? fs.readFileSync(caPath) : undefined;

    return grpc.ServerCredentials.createSsl(
      ca ?? null,
      [{ cert_chain: cert, private_key: key }],
      // requireClientAuth (mTLS) — only when a CA is provided
      ca !== undefined,
    );
  }

  public start(address: string) {
    this.server.bindAsync(
      address,
      this.buildServerCredentials(),
      (error, _port) => {
        if (error) {
          logger.error(`Failed to start gRPC server: ${error}`);
          return;
        }
      },
    );
  }

  public stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.tryShutdown((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}
