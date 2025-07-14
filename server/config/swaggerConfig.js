import swaggerJSDoc from "swagger-jsdoc";

const swaggerDefinition = {
  openapi: "3.0.0",
  info: {
    title: "Paymaster API Documentation",
    version: "1.0.0",
    description: "Paymaster API Documentation",
  },
  servers: [
    {
      url:
        process.env.NODE_ENV === "production"
          ? "http://sameer-yadav.online"
          : "http://localhost:9002",
    },
  ],
};

// Now you can pass `matchedFiles` to Swagger
const options = {
  swaggerDefinition,
  apis: [
    "./routes/*.mjs", // Include files in the `routes` folder
    "./routes/**/*.mjs", // Include subfolders in `routes`
    "./controllers/*.mjs", // Include files in the `controllers` folder
    "./controllers/**/*.mjs", // Include subfolders in `controllers`
  ],
};

const swaggerSpec = swaggerJSDoc(options);

export default swaggerSpec;
