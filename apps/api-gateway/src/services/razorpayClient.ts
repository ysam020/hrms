import Razorpay from "razorpay";

// The Razorpay API client. Lives in services/ so services (billingLedger,
// subscriptionReconciler) don't depend on the HTTP handler module, which
// itself depends on them; handlers/payment.ts re-exports it.
export function getRazorpay() {
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID!,
    key_secret: process.env.RAZORPAY_KEY_SECRET!,
  });
}
