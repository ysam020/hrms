import { z } from "zod";
import { validate } from "../../middleware/validate";

function makeRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe("validate", () => {
  const schema = z.object({ name: z.string().min(1, "Name is required") });

  it("calls next() and replaces req.body with the parsed data on success", () => {
    const req: any = {
      body: { name: "Alice", extra: "stripped-by-nothing-here" },
    };
    const res = makeRes();
    const next = jest.fn();

    validate(schema)(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.body).toEqual({ name: "Alice" });
    expect(res.status).not.toHaveBeenCalled();
  });

  it("responds 400 with the first validation error message and does not call next()", () => {
    const req: any = { body: { name: "" } };
    const res = makeRes();
    const next = jest.fn();

    validate(schema)(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, message: "Name is required" }),
    );
  });

  it("defaults to validating req.body when no target is given", () => {
    const req: any = { body: { name: "Bob" }, query: { name: "" } };
    const res = makeRes();
    const next = jest.fn();

    validate(schema)(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it("validates req.query when target is 'query'", () => {
    const req: any = { query: { name: "Carol" } };
    const res = makeRes();
    const next = jest.fn();

    validate(schema, "query")(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.query).toEqual({ name: "Carol" });
  });

  it("validates req.params when target is 'params'", () => {
    const req: any = { params: { name: "" } };
    const res = makeRes();
    const next = jest.fn();

    validate(schema, "params")(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("falls back to a generic message when the schema error has none", () => {
    const emptySchema = z.never();
    const req: any = { body: { anything: true } };
    const res = makeRes();
    const next = jest.fn();

    validate(emptySchema)(req, res, next);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.any(String) }),
    );
  });
});
