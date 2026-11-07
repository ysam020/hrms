import { EventEmitter } from "node:events";

const mockRelease = jest.fn();
const mockLeaseClient = jest.fn((_client: object) => mockRelease);
jest.mock("@hrms/db", () => ({ leaseClient: mockLeaseClient }));

import { leaseForRequest } from "../middleware/leaseForRequest";

describe("leaseForRequest", () => {
  beforeEach(() => jest.clearAllMocks());

  it("holds the tenant client until the response finishes", () => {
    const res: any = new EventEmitter();
    const client = { __client: true };
    leaseForRequest(res, client);

    expect(mockLeaseClient).toHaveBeenCalledWith(client);
    expect(mockRelease).not.toHaveBeenCalled();
    res.emit("finish");
    expect(mockRelease).toHaveBeenCalled();
  });

  it("also releases when the client disconnects before a response", () => {
    const res: any = new EventEmitter();
    leaseForRequest(res, {});
    res.emit("close");
    expect(mockRelease).toHaveBeenCalled();
  });

  it("does nothing for a request without a tenant client", () => {
    leaseForRequest(new EventEmitter() as any, null);
    expect(mockLeaseClient).not.toHaveBeenCalled();
  });
});
