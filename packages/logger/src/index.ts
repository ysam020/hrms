import winston from "winston";

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : "";
          return `${timestamp} [${level}]: ${message} ${metaStr}`;
        }),
      ),
    }),
  ],
});

export const apiRequestLogger = (req: any, res: any, next: any) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    logger.info("HTTP Request", {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
    });
  });
  next();
};

export const grpcApiRequestLogger = async (
  call: any,
  next: () => Promise<any>,
) => {
  const start = Date.now();
  logger.info("gRPC Request", {
    method: call.getPath ? call.getPath() : "unknown",
    request: call.request,
  });
  const result = await next();
  const duration = Date.now() - start;
  logger.info("gRPC Response", {
    duration: `${duration}ms`,
  });
  return result;
};
