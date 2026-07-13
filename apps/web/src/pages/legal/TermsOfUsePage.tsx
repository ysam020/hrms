import LegalPageLayout from "./LegalPageLayout";

function TermsOfUsePage() {
  return (
    <LegalPageLayout title="Terms of Use" lastUpdated="13 July 2026">
      <p>
        These Terms of Use ("Terms") govern access to and use of the Praesto
        human resource management platform ("Service"), operated by Praesto
        ("we", "us", "our"). By creating an organisation, signing in, or
        otherwise using the Service, you agree to these Terms on behalf of
        yourself and, where applicable, the organisation you represent
        ("Tenant"). If you do not agree, do not use the Service.
      </p>

      <h2>1. The Service</h2>
      <p>
        Praesto provides HR management tools, including employee records,
        attendance, leave, WFH, KYC, recruitment, payroll, and related modules,
        made available to a Tenant's authorised users under a paid subscription.
      </p>

      <h2>2. Accounts &amp; Access</h2>
      <ul>
        <li>
          A Tenant is responsible for the accuracy of data it enters and for
          managing which users within its organisation have access, and to what
          data, via its own role and permission settings.
        </li>
        <li>
          Users are responsible for maintaining the confidentiality of their
          sign-in credentials/security keys and for all activity under their
          account.
        </li>
        <li>
          You must be authorised by your organisation to use the Service on its
          behalf.
        </li>
      </ul>

      <h2>3. Subscription &amp; Billing</h2>
      <ul>
        <li>
          Access to the Service requires an active paid subscription, billed
          monthly or annually as selected at checkout, and processed by our
          payment partner, Razorpay.
        </li>
        <li>
          Subscriptions renew automatically at the end of each billing cycle
          unless cancelled beforehand. Cancelling stops future billing — see our{" "}
          <a href="/refund-policy">Refund Policy</a> for details on what happens
          to access on cancellation.
        </li>
        <li>
          If a renewal payment fails, a short grace period may be applied before
          access to the Service is suspended, as indicated within the product.
        </li>
        <li>We may change subscription pricing with prior notice.</li>
      </ul>

      <h2>4. Acceptable Use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>
          Use the Service to store or process data you are not lawfully entitled
          to process (e.g. employee data without appropriate basis/consent under
          applicable law).
        </li>
        <li>
          Attempt to gain unauthorised access to another Tenant's data or to the
          Service's infrastructure.
        </li>
        <li>
          Reverse engineer, resell, or use the Service to build a competing
          product.
        </li>
        <li>
          Upload malicious code or interfere with the normal operation of the
          Service.
        </li>
      </ul>

      <h2>5. Data Ownership</h2>
      <p>
        As between Praesto and a Tenant, the Tenant retains ownership of the HR
        data it enters into the Service. We process that data solely to provide
        the Service, as described in our{" "}
        <a href="/privacy-policy">Privacy Policy</a>.
      </p>

      <h2>6. Intellectual Property</h2>
      <p>
        The Service, including its software, design, and branding, is owned by
        Praesto and protected by intellectual property laws. These Terms do not
        grant you any rights to our trademarks or branding.
      </p>

      <h2>7. Termination</h2>
      <p>
        We may suspend or terminate access to the Service for a Tenant that
        breaches these Terms, fails to pay applicable fees, or where required by
        law. A Tenant may stop using the Service at any time by cancelling its
        subscription.
      </p>

      <h2>8. Disclaimers &amp; Limitation of Liability</h2>
      <p>
        The Service is provided "as is" without warranties of any kind, express
        or implied. To the maximum extent permitted by law, Praesto is not
        liable for indirect, incidental, or consequential damages arising from
        use of the Service, and our aggregate liability for any claim is limited
        to the subscription fees paid in the 12 months preceding the claim.
      </p>

      <h2>9. Governing Law</h2>
      <p>
        These Terms are governed by the laws of India, without regard to
        conflict-of-law principles, and disputes are subject to the exclusive
        jurisdiction of the courts of India.
      </p>

      <h2>10. Changes to These Terms</h2>
      <p>
        We may update these Terms from time to time. Continued use of the
        Service after an update constitutes acceptance of the revised Terms.
      </p>

      <h2>11. Contact Us</h2>
      <p>
        Questions about these Terms can be sent to{" "}
        <a href="mailto:support@praesto.cloud">support@praesto.cloud</a>.
      </p>
    </LegalPageLayout>
  );
}

export default TermsOfUsePage;
