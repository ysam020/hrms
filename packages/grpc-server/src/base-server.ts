import * as grpc from "@grpc/grpc-js";
import { grpcApiRequestLogger, logger } from "@hrms/logger";
import { errorHandler } from "./error-handling";
import { validationMiddleware } from "./middleware/validation";

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

  public start(address: string) {
    this.server.bindAsync(
      address,
      grpc.ServerCredentials.createInsecure(),
      (error, port) => {
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
