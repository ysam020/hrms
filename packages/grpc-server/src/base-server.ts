import * as grpc from "@grpc/grpc-js";
import fs from "fs";
import path from "path";
import { logger, grpcApiRequestLogger } from "@hrms/logger";
import { errorHandler } from "./error-handling";
import { validationMiddleware } from "./middleware/validation";
import { runWithTenant, getClientForDb } from "@hrms/db";

// Middleware that reads x-tenant-id and x-tenant-db-name gRPC metadata headers
// (set by the API gateway) and stores them in AsyncLocalStorage so that
// prismaWithTenant automatically routes queries to the correct tenant database.
// Also reads the x-actor-* headers (who's making the call) so this service's
// own audit-logging Prisma middleware can attribute a mutation to a person,
// even though authentication itself happened in api-gateway's process.
const tenantContextMiddleware = async (
  call: any,
  next: () => Promise<any>,
): Promise<any> => {
  const getHeader = (key: string): string | undefined =>
    (call.metadata?.get(key) ?? [])[0];

  const tenantId = getHeader("x-tenant-id");
  const dbName = getHeader("x-tenant-db-name");
  if (tenantId) {
    const tenantClient = dbName ? getClientForDb(dbName) : null;
    const userId = getHeader("x-actor-user-id");
    const username = getHeader("x-actor-username");
    const actor = userId
      ? {
          userId,
          username: username ?? null,
          ipAddress: getHeader("x-actor-ip") ?? "",
          userAgent: getHeader("x-actor-user-agent") ?? "",
        }
      : undefined;
    return runWithTenant(tenantId, tenantClient, () => next(), actor);
  }
  return next();
};

export class BaseGrpcServer {
  private server: grpc.Server;
  private middlewares: ((
    call: any,
    next: () => Promise<any>,
  ) => Promise<any>)[];

  constructor() {
    this.server = new grpc.Server({
      "grpc.max_receive_message_length": 100 * 1024 * 1024,
    });
    this.middlewares = [];
    this.addMiddleware(grpcApiRequestLogger);
    this.addMiddleware(tenantContextMiddleware);
  }

  protected addMiddleware(
    middleware: (call: any, next: () => Promise<any>) => Promise<any>,
  ) {
    this.middlewares.push(middleware);
  }

  protected wrapHandler(handler: grpc.handleUnaryCall<any, any>) {
    return async (call: any, callback: grpc.sendUnaryData<any>) => {
      try {
        const executeMiddlewareChain = async (index: number): Promise<any> => {
          if (index === this.middlewares.length) {
            return new Promise((resolve, reject) => {
              try {
                handler(call, (error: any, response: any) => {
                  if (error) throw error;
                  resolve(response);
                });
              } catch (error) {
                reject(error);
              }
            });
          }

          if (!this.middlewares[index]) return;
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

  protected addService(service: grpc.ServiceDefinition, implementation: any) {
    const wrappedImpl: Record<string, any> = {};
    for (const method in implementation) {
      const camelMethod = method.charAt(0).toLowerCase() + method.slice(1);
      wrappedImpl[camelMethod] = this.wrapHandler(implementation[method]);
    }
    this.server.addService(service, wrappedImpl);
  }

  protected wrapWithValidation(handler: Function, schema: any) {
    return async (call: any, callback: any) => {
      try {
        await validationMiddleware(schema)(call, async () => {
          return handler(call, callback);
        });
      } catch (error) {
        logger.error("Validation error:", { error });
        return callback(null, error);
      }
    };
  }

  private buildServerCredentials(): grpc.ServerCredentials {
    const certFile =
      process.env.GRPC_TLS_CRT_FILE ??
      path.resolve(__dirname, "../../certificates/cert.pem");
    const keyFile =
      process.env.GRPC_TLS_KEY_FILE ??
      path.resolve(__dirname, "../../certificates/key.pem");

    return grpc.ServerCredentials.createSsl(null, [
      {
        cert_chain: fs.readFileSync(certFile),
        private_key: fs.readFileSync(keyFile),
      },
    ]);
  }

  public start(address: string, credentials?: grpc.ServerCredentials): void {
    this.server.bindAsync(
      address,
      credentials ?? this.buildServerCredentials(),
      (error) => {
        if (error) {
          logger.error(`Failed to start gRPC server: ${error}`);
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
