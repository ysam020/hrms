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
          ? "https://api.praesto.cloud"
          : "https://localhost:9002",
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
