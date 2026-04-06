import { defineConfig } from "prisma/config";

export default defineConfig({
  datasourceUrl: process.env.MONGO_URI,
});
