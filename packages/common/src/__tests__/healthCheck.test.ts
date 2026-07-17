import { status } from "@grpc/grpc-js";
import { healthCheck } from "../healthCheck";

describe("healthCheck", () => {
  it("calls back with an OK status and a healthy message", async () => {
    const callback = jest.fn();
    await healthCheck({}, callback);

    expect(callback).toHaveBeenCalledWith(null, {
      status: status.OK,
      message: "Service is healthy",
    });
  });
});
