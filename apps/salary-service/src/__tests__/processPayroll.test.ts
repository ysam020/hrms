import { status } from "@grpc/grpc-js";
import { processPayroll } from "../handlers/processPayroll";

it("is retired and touches no data", async () => {
  const cb = jest.fn();
  await processPayroll({ request: {} } as any, cb);
  expect(cb).toHaveBeenCalledWith(
    null,
    expect.objectContaining({ status: status.UNIMPLEMENTED }),
  );
});
