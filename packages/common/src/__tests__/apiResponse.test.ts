import { apiResponse, RESPONSE_STATUS } from "../response";

function makeRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe("apiResponse", () => {
  it("sets success: true for a 2xx status code and merges the data payload", () => {
    const res = makeRes();
    apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "ok",
      data: { id: 1 },
    });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "ok",
      data: { id: 1 },
    });
  });

  it("sets success: true for 201 Created", () => {
    const res = makeRes();
    apiResponse(res, RESPONSE_STATUS.CREATED, {});
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true }),
    );
  });

  it("sets success: false for a 4xx status code", () => {
    const res = makeRes();
    apiResponse(res, RESPONSE_STATUS.NOT_FOUND, { message: "not found" });

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "not found",
    });
  });

  it("sets success: false for a 5xx status code", () => {
    const res = makeRes();
    apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {});
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false }),
    );
  });
});
