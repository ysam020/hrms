import * as grpc from "@grpc/grpc-js";
import fs from "fs";
import path from "path";

export interface GrpcClientConfig {
  serviceName: string;
  address: string;
  credentials?: grpc.ChannelCredentials;
  options?: {
    timeout?: number;
    retries?: number;
    [key: string]: any;
  };
}

export class BaseGrpcClient {
  protected client: any;
  protected config: GrpcClientConfig;

  constructor(config: GrpcClientConfig) {
    this.config = config;
    this.setupClient();
  }

  private buildDefaultCredentials(): grpc.ChannelCredentials {
    const caFile =
      process.env.GRPC_TLS_CA_FILE ??
      path.resolve(__dirname, "../../certificates/rootCA.pem");
    // mTLS: present our own cert/key so the server can verify who's
    // calling, not just that we trust the server's cert. See
    // base-server.ts's buildServerCredentials, which now requires this.
    const certFile =
      process.env.GRPC_TLS_CRT_FILE ??
      path.resolve(__dirname, "../../certificates/cert.pem");
    const keyFile =
      process.env.GRPC_TLS_KEY_FILE ??
      path.resolve(__dirname, "../../certificates/key.pem");

    return grpc.credentials.createSsl(
      fs.readFileSync(caFile),
      fs.readFileSync(keyFile),
      fs.readFileSync(certFile),
      { checkServerIdentity: () => undefined },
    );
  }

  private setupClient() {
    const options = {
      "grpc.keepalive_time_ms": 120000,
      "grpc.http2.min_time_between_pings_ms": 120000,
      "grpc.keepalive_timeout_ms": 20000,
      "grpc.http2.max_pings_without_data": 0,
      "grpc.keepalive_permit_without_calls": 1,
    };

    this.client = new grpc.Client(
      this.config.address,
      this.config.credentials ?? this.buildDefaultCredentials(),
      {
        ...options,
        ...this.config.options,
      },
    );
  }

  async makeCall(method: string, request: any): Promise<any> {
    return new Promise((resolve, reject) => {
      this.client[method](request, (error: any, response: any) => {
        if (error) reject(error);
        else resolve(response);
      });
    });
  }
}
