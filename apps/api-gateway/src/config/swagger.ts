import swaggerJSDoc from "swagger-jsdoc";
import path from "path";

const swaggerDefinition = {
  openapi: "3.0.0",
  info: {
    title: "Praesto API Documentation",
    version: "1.0.0",
    description: "Praesto API Documentation",
  },
  servers: [
    {
      url:
        process.env.NODE_ENV === "production"
          ? "https://api.praesto.cloud/api/v1"
          : "https://localhost:9002/api/v1",
      description:
        process.env.NODE_ENV === "production" ? "Production" : "Local dev",
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },
  },
};

const options = {
  swaggerDefinition,
  apis: [path.join(__dirname, "../../docs/swagger/*.yml")],
};

const swaggerSpec = swaggerJSDoc(options);

export default swaggerSpec;
