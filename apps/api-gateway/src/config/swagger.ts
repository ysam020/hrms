import swaggerJSDoc from "swagger-jsdoc";
import path from "path";

const swaggerDefinition = {
  openapi: "3.0.0",
  info: {
    title: "Praesto API Documentation",
    version: "1.0.0",
    description: [
      "Praesto API Documentation. All HTTP traffic is served by the API gateway; the microservices behind it speak gRPC only.",
      "",
      "**Authentication** — the access JWT is accepted as `Authorization: Bearer <jwt>` or as the httpOnly `access_token` cookie (bearerAuth / cookieAuth). The refresh token lives in a cookie and is exchanged at `POST /api/v1/refresh-token`.",
      "",
      "**CSRF** — every POST/PUT/PATCH/DELETE under `/api/v1` (except the two Razorpay webhooks) needs `X-CSRF-Token` from `GET /api/v1/csrf-token`, together with the `csrf-token` cookie that call sets.",
      "",
      "**Access guards** — business routes run authenticate → requireTenant → requireActiveSubscription (402 when the subscription has ended). Each operation's description ends with an `Access:` line listing the guards that apply to it; handlers may apply further RBAC (self / team / organisation scopes) described in the operation text.",
      "",
      "**Idempotency** — mutations accept an optional `Idempotency-Key` header (see the IdempotencyKey parameter).",
      "",
      "**Envelope** — most JSON responses are `{ success, message?, data?, ... }`; middleware errors may carry only `message` and `code`.",
      "",
      "MCP / OAuth endpoints (`/mcp`, `/oauth/*`, `/.well-known/*`) and `/health` live outside `/api/v1`.",
    ].join("\n"),
  },
  servers: [
    {
      url:
        process.env.NODE_ENV === "production"
          ? "https://api.praesto.in"
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
