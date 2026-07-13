import LegalPageLayout from "./LegalPageLayout";

function RefundPolicyPage() {
  return (
    <LegalPageLayout
      title="Refund & Cancellation Policy"
      lastUpdated="13 July 2026"
    >
      <p>
        This policy describes how subscription payments, cancellations, and
        refunds are handled for the Praesto human resource management platform
        ("Service"). It should be read together with our{" "}
        <a href="/terms-of-use">Terms of Use</a>.
      </p>

      <h2>1. Subscription Billing</h2>
      <p>
        Subscriptions are billed in advance on a monthly or annual cycle, as
        selected at checkout, and renew automatically until cancelled. Payments
        are processed securely by our payment partner, Razorpay.
      </p>

      <h2>2. No Refunds</h2>
      <p>
        Fees paid for a subscription period are non-refundable, including for
        partially used billing periods, downgrades, or unused features. By
        subscribing, you acknowledge that payments made to Praesto are final.
      </p>

      <h2>3. Cancelling Your Subscription</h2>
      <p>
        You can cancel auto-renewal at any time from the Subscription page in
        the app. Cancelling immediately stops the subscription with our payment
        partner — no further charges will be made, and no prorated refund is
        issued for the remaining portion of the current billing period.
      </p>

      <h2>4. Failed Renewal Payments</h2>
      <p>
        If a scheduled renewal payment fails, the Service applies a short grace
        period (shown within the product) during which the subscription can be
        brought current before access is suspended. This grace period is
        separate from, and does not extend, the no-refund policy above.
      </p>

      <h2>5. Exceptions</h2>
      <p>
        Where a payment was made in error (e.g. a duplicate charge or a verified
        billing-system fault on our part), contact us and we will review the
        issue on its individual merits. Refunds outside of this policy are
        issued solely at Praesto's discretion.
      </p>

      <h2>6. Contact Us</h2>
      <p>
        For billing questions or to report a payment issue, contact{" "}
        <a href="mailto:support@praesto.cloud">support@praesto.cloud</a>.
      </p>
    </LegalPageLayout>
  );
}

export default RefundPolicyPage;
