import { defineConfig } from "prisma/config";

export default defineConfig({
  datasourceUrl: process.env.DEV_MONGODB_URI,
});
