import { PrismaClient } from "@prisma/client";

declare global {
  var prisma: PrismaClient | undefined;
}

export const prisma =
  global.prisma ||
  new PrismaClient({
    datasourceUrl: process.env.DEV_MONGODB_URI,
    log: [
      { emit: "stdout", level: "error" },
      { emit: "stdout", level: "warn" },
    ],
  });

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}
