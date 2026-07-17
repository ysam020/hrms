process.env.NODE_ENV = "test";

import {
  logger,
  apiRequestLogger,
  grpcApiRequestLogger,
  httpRequestDuration,
  httpRequestsTotal,
  grpcRequestDuration,
  grpcRequestsTotal,
} from "../index";

describe("apiRequestLogger", () => {
  it("records duration/count metrics and logs once the response finishes", () => {
    const observeSpy = jest
      .spyOn(httpRequestDuration, "observe")
      .mockImplementation();
    const incSpy = jest.spyOn(httpRequestsTotal, "inc").mockImplementation();
    const infoSpy = jest.spyOn(logger, "info").mockImplementation();

    let finishCb: () => void = () => {};
    const req: any = {
      method: "GET",
      url: "/api/v1/leaves",
      path: "/api/v1/leaves",
    };
    const res: any = {
      statusCode: 200,
      on: jest.fn((event: string, cb: () => void) => {
        if (event === "finish") finishCb = cb;
      }),
    };
    const next = jest.fn();

    apiRequestLogger(req, res, next);
    expect(next).toHaveBeenCalled();
    // Handler hasn't recorded anything yet — only on "finish".
    expect(observeSpy).not.toHaveBeenCalled();

    finishCb();

    expect(observeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "GET",
        route: "/api/v1/leaves",
        status: "200",
      }),
      expect.any(Number),
    );
    expect(incSpy).toHaveBeenCalledWith(
      expect.objectContaining({ method: "GET", status: "200" }),
    );
    expect(infoSpy).toHaveBeenCalledWith(
      "HTTP Request",
      expect.objectContaining({ method: "GET", status: 200 }),
    );

    observeSpy.mockRestore();
    incSpy.mockRestore();
    infoSpy.mockRestore();
  });

  it("falls back to req.route.path, then req.path, then req.url, then 'unknown' for the route label", () => {
    const observeSpy = jest
      .spyOn(httpRequestDuration, "observe")
      .mockImplementation();
    jest.spyOn(httpRequestsTotal, "inc").mockImplementation();
    jest.spyOn(logger, "info").mockImplementation();

    let finishCb: () => void = () => {};
    const res: any = {
      statusCode: 200,
      on: (_e: string, cb: any) => (finishCb = cb),
    };
    apiRequestLogger({ method: "GET" } as any, res, jest.fn());
    finishCb();

    expect(observeSpy).toHaveBeenCalledWith(
      expect.objectContaining({ route: "unknown" }),
      expect.any(Number),
    );
    observeSpy.mockRestore();
    (httpRequestsTotal.inc as any).mockRestore?.();
    (logger.info as any).mockRestore?.();
  });
});

describe("grpcApiRequestLogger", () => {
  it("logs the request/response and records gRPC metrics", async () => {
    const observeSpy = jest
      .spyOn(grpcRequestDuration, "observe")
      .mockImplementation();
    const incSpy = jest.spyOn(grpcRequestsTotal, "inc").mockImplementation();
    const infoSpy = jest.spyOn(logger, "info").mockImplementation();

    const call = {
      getPath: () => "/leave.LeaveService/GetLeaves",
      request: { id: "1" },
    };
    const next = jest.fn().mockResolvedValue({ ok: true });

    const result = await grpcApiRequestLogger(call, next);

    expect(result).toEqual({ ok: true });
    expect(infoSpy).toHaveBeenCalledWith(
      "gRPC Request",
      expect.objectContaining({ method: "/leave.LeaveService/GetLeaves" }),
    );
    expect(infoSpy).toHaveBeenCalledWith(
      "gRPC Response",
      expect.objectContaining({ duration: expect.any(String) }),
    );
    expect(observeSpy).toHaveBeenCalledWith(
      { method: "/leave.LeaveService/GetLeaves", service: expect.any(String) },
      expect.any(Number),
    );
    expect(incSpy).toHaveBeenCalled();

    observeSpy.mockRestore();
    incSpy.mockRestore();
    infoSpy.mockRestore();
  });

  it("uses 'unknown' as the method when the call has no getPath()", async () => {
    jest.spyOn(grpcRequestDuration, "observe").mockImplementation();
    jest.spyOn(grpcRequestsTotal, "inc").mockImplementation();
    const infoSpy = jest.spyOn(logger, "info").mockImplementation();

    await grpcApiRequestLogger(
      { request: {} },
      jest.fn().mockResolvedValue({}),
    );

    expect(infoSpy).toHaveBeenCalledWith(
      "gRPC Request",
      expect.objectContaining({ method: "unknown" }),
    );

    (grpcRequestDuration.observe as any).mockRestore();
    (grpcRequestsTotal.inc as any).mockRestore();
    infoSpy.mockRestore();
  });

  describe("request redaction (security-sensitive)", () => {
    let infoSpy: jest.SpyInstance;

    beforeEach(() => {
      jest.spyOn(grpcRequestDuration, "observe").mockImplementation();
      jest.spyOn(grpcRequestsTotal, "inc").mockImplementation();
      infoSpy = jest.spyOn(logger, "info").mockImplementation();
    });

    afterEach(() => {
      (grpcRequestDuration.observe as any).mockRestore();
      (grpcRequestsTotal.inc as any).mockRestore();
      infoSpy.mockRestore();
    });

    it("redacts top-level sensitive fields by key-name substring match", async () => {
      const call = {
        getPath: () => "/auth.AuthService/Login",
        request: {
          username: "jdoe",
          password: "hunter2",
          refreshToken: "tok-123",
          otp: "123456",
        },
      };
      await grpcApiRequestLogger(call, jest.fn().mockResolvedValue({}));

      const loggedRequest = infoSpy.mock.calls.find(
        (c) => c[0] === "gRPC Request",
      )![1].request;
      expect(loggedRequest.username).toBe("jdoe");
      expect(loggedRequest.password).toBe("[REDACTED]");
      expect(loggedRequest.refreshToken).toBe("[REDACTED]");
      expect(loggedRequest.otp).toBe("[REDACTED]");
    });

    it("redacts nested sensitive fields (PAN, bank account, IFSC, DOB) inside objects", async () => {
      const call = {
        getPath: () => "/employee.EmployeeService/SubmitKyc",
        request: {
          userId: "u1",
          kyc: {
            panNumber: "ABCDE1234F",
            bankAccountNo: "123456789",
            ifscCode: "HDFC0001",
            dob: "1990-01-01",
          },
        },
      };
      await grpcApiRequestLogger(call, jest.fn().mockResolvedValue({}));

      const loggedRequest = infoSpy.mock.calls.find(
        (c) => c[0] === "gRPC Request",
      )![1].request;
      expect(loggedRequest.kyc.panNumber).toBe("[REDACTED]");
      expect(loggedRequest.kyc.bankAccountNo).toBe("[REDACTED]");
      expect(loggedRequest.kyc.ifscCode).toBe("[REDACTED]");
      expect(loggedRequest.kyc.dob).toBe("[REDACTED]");
      expect(loggedRequest.userId).toBe("u1");
    });

    it("redacts sensitive fields inside array elements", async () => {
      const call = {
        getPath: () => "/x/y",
        request: { items: [{ salary: 100000 }, { ctc: 200000 }] },
      };
      await grpcApiRequestLogger(call, jest.fn().mockResolvedValue({}));

      const loggedRequest = infoSpy.mock.calls.find(
        (c) => c[0] === "gRPC Request",
      )![1].request;
      expect(loggedRequest.items[0].salary).toBe("[REDACTED]");
      expect(loggedRequest.items[1].ctc).toBe("[REDACTED]");
    });

    it("redacts Buffer/Uint8Array values outright regardless of key name", async () => {
      const call = {
        getPath: () => "/x/y",
        request: { fileBytes: Buffer.from("secret-file-content") },
      };
      await grpcApiRequestLogger(call, jest.fn().mockResolvedValue({}));

      const loggedRequest = infoSpy.mock.calls.find(
        (c) => c[0] === "gRPC Request",
      )![1].request;
      expect(loggedRequest.fileBytes).toBe("[REDACTED]");
    });

    it("leaves non-sensitive business fields untouched", async () => {
      const call = {
        getPath: () => "/x/y",
        request: { leaveType: "PL", days: 2, reason: "Family function" },
      };
      await grpcApiRequestLogger(call, jest.fn().mockResolvedValue({}));

      const loggedRequest = infoSpy.mock.calls.find(
        (c) => c[0] === "gRPC Request",
      )![1].request;
      expect(loggedRequest).toEqual({
        leaveType: "PL",
        days: 2,
        reason: "Family function",
      });
    });
  });
});
