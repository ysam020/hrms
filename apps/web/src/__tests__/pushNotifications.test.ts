import { pushErrorMessage } from "@web/shared/utils/pushNotifications/generateFcmToken";

// Brave ships with its push service off; every subscription then fails with
// "Registration failed - push service error" (reproduced 2026-11-02).
const pushServiceError = Object.assign(
  new Error("Registration failed - push service error"),
  { name: "AbortError" },
);

describe("pushErrorMessage", () => {
  afterEach(() => {
    delete (navigator as any).brave;
  });

  it("tells Brave users which setting turns push on", () => {
    (navigator as any).brave = { isBrave: async () => true };
    expect(pushErrorMessage(pushServiceError)).toMatch(
      /Use Google services for push messaging/,
    );
  });

  it("points other browsers at the connection or another browser", () => {
    expect(pushErrorMessage(pushServiceError)).toMatch(/push service/);
    expect(pushErrorMessage(pushServiceError)).not.toMatch(/Brave/);
  });

  it("names unsupported browsers and blocked permission", () => {
    expect(pushErrorMessage({ code: "messaging/unsupported-browser" })).toMatch(
      /doesn’t support/,
    );
    expect(pushErrorMessage({ code: "messaging/permission-blocked" })).toMatch(
      /blocked/,
    );
  });

  it("falls back to the general message", () => {
    expect(pushErrorMessage(new Error("boom"))).toBe(
      "Something went wrong enabling push notifications.",
    );
  });
});
