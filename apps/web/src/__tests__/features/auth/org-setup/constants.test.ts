import { loadRazorpayScript } from "@web/features/auth/org-setup/constants";

describe("loadRazorpayScript", () => {
  afterEach(() => {
    document.getElementById("razorpay-script")?.remove();
  });

  it("resolves true immediately when the script tag already exists", async () => {
    const existing = document.createElement("script");
    existing.id = "razorpay-script";
    document.body.appendChild(existing);

    await expect(loadRazorpayScript()).resolves.toBe(true);
  });

  it("appends a script tag pointing at the Razorpay checkout script and resolves true on load", async () => {
    const promise = loadRazorpayScript();
    const script = document.getElementById(
      "razorpay-script",
    ) as HTMLScriptElement;
    expect(script).toBeInTheDocument();
    expect(script.src).toBe("https://checkout.razorpay.com/v1/checkout.js");

    script.onload?.(new Event("load"));

    await expect(promise).resolves.toBe(true);
  });

  it("resolves false when the script fails to load", async () => {
    const promise = loadRazorpayScript();
    const script = document.getElementById(
      "razorpay-script",
    ) as HTMLScriptElement;

    script.onerror?.(new Event("error"));

    await expect(promise).resolves.toBe(false);
  });
});
