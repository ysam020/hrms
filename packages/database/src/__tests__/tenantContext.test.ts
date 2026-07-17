import {
  getTenantId,
  getTenantClient,
  getAuditActor,
  runWithTenant,
} from "../tenantContext";

describe("tenantContext", () => {
  it("returns undefined for all getters outside any runWithTenant call", () => {
    expect(getTenantId()).toBeUndefined();
    expect(getTenantClient()).toBeUndefined();
    expect(getAuditActor()).toBeUndefined();
  });

  it("exposes tenantId and tenantClient within the callback", () => {
    const fakeClient: any = { __client: true };
    runWithTenant("t1", fakeClient, () => {
      expect(getTenantId()).toBe("t1");
      expect(getTenantClient()).toBe(fakeClient);
    });
  });

  it("exposes the actor when provided", () => {
    const actor = {
      userId: "u1",
      username: "jdoe",
      ipAddress: "1.2.3.4",
      userAgent: "jest",
    };
    runWithTenant(
      "t1",
      null,
      () => {
        expect(getAuditActor()).toEqual(actor);
      },
      actor,
    );
  });

  it("leaves the actor undefined when not provided", () => {
    runWithTenant("t1", null, () => {
      expect(getAuditActor()).toBeUndefined();
    });
  });

  it("returns the callback's return value", () => {
    const result = runWithTenant("t1", null, () => 42);
    expect(result).toBe(42);
  });

  it("does not leak context across independent calls", () => {
    runWithTenant("t1", null, () => {
      expect(getTenantId()).toBe("t1");
    });
    expect(getTenantId()).toBeUndefined();
  });

  it("isolates nested runWithTenant calls (inner overrides, restores on exit)", () => {
    runWithTenant("outer", null, () => {
      expect(getTenantId()).toBe("outer");
      runWithTenant("inner", null, () => {
        expect(getTenantId()).toBe("inner");
      });
      expect(getTenantId()).toBe("outer");
    });
  });

  it("propagates context across an async callback (AsyncLocalStorage survives awaits)", async () => {
    await runWithTenant("t1", null, async () => {
      await new Promise((r) => setTimeout(r, 0));
      expect(getTenantId()).toBe("t1");
    });
  });
});
