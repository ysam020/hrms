import swaggerUi from "swagger-ui-express";
import { Express } from "express";
import swaggerSpec from "./swagger";

export const configureSwagger = (app: Express) => {
  app.use(
    "/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      explorer: true,
      swaggerOptions: {
        docExpansion: "none",
        tagsSorter: "alpha",
        operationsSorter: "alpha",
      },
    }),
  );
};
