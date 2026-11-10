import LegalPageLayout from "@next/features/public/LegalLayout";

function PrivacyPolicyPage() {
  return (
    <LegalPageLayout title="Privacy Policy" lastUpdated="10 November 2026">
      <p>
        Praesto ("Praesto", "we", "us", or "our") provides a human resource
        management platform ("Service") that organisations ("Tenants") use to
        manage employee records, attendance, leave, payroll, and related HR
        functions. This Privacy Policy explains what personal data we collect,
        how it is used, and the choices available to you.
      </p>
      <p>
        This policy applies to visitors of our website and to individuals whose
        data is processed within the Service by a Tenant (their employer). If
        you are an employee using the Service, your employer (the Tenant)
        controls how your HR data is used — contact your HR department for
        employer-specific data requests. For anything specific to Praesto as the
        platform operator, contact us using the details at the end of this page.
      </p>

      <h2>1. Information We Collect</h2>
      <ul>
        <li>
          <strong>Account &amp; profile data</strong> — name, email address,
          phone number, employment details, and authentication identifiers (e.g.
          Google OAuth or security-key/biometric credentials) provided when a
          Tenant creates or manages a user account.
        </li>
        <li>
          <strong>Google Calendar data (optional)</strong> — if you choose to
          connect your Google Calendar, we access only the ability to create
          calendar events on your behalf, for the sole purpose of scheduling
          interviews and generating a Google Meet link. See Section 10 for
          details.
        </li>
        <li>
          <strong>HR operational data</strong> — attendance records, leave and
          WFH requests, KYC documents, salary structures, payroll runs,
          performance and resignation records, entered by Tenants and their
          employees to operate the Service.
        </li>
        <li>
          <strong>Billing data</strong> — subscription plan, billing cycle, and
          payment status. Card, UPI, and bank details are collected and
          processed directly by our payment processor, Razorpay; we do not store
          full payment card numbers on our servers.
        </li>
        <li>
          <strong>Usage &amp; device data</strong> — log data, IP address,
          browser/device type, and in-app activity, collected automatically to
          secure and improve the Service.
        </li>
        <li>
          <strong>Sales enquiries</strong> — if you request a demo or contact
          our sales team through our website, the name, work email, company name
          and size you provide, and optionally your phone number, designation,
          message and preferred demo time. We also record the page you first
          arrived on, the website that referred you and any campaign tags in the
          link (such as utm_source), so we know which channels bring enquiries.
          These details are stored in Praesto’s own systems and are not sent to
          analytics providers.
        </li>
        <li>
          <strong>Website analytics</strong> — usage statistics from our public
          website, described in Section 7.
        </li>
      </ul>

      <h2>2. How We Use Information</h2>
      <ul>
        <li>To provide, operate, and maintain the Service.</li>
        <li>
          To authenticate users and protect accounts against unauthorised
          access.
        </li>
        <li>
          To process subscription payments and communicate billing status.
        </li>
        <li>
          To send Service-related notifications (e.g. approvals, payroll
          disbursement, security alerts).
        </li>
        <li>To provide customer support and respond to enquiries.</li>
        <li>
          To respond to demo requests and sales enquiries, including a
          confirmation email and follow-up from our team.
        </li>
        <li>
          To understand, in aggregate, how visitors use our public website and
          which pages and campaigns lead to enquiries.
        </li>
        <li>
          To detect, investigate, and prevent fraud, abuse, and security
          incidents.
        </li>
        <li>To comply with applicable legal and regulatory obligations.</li>
      </ul>

      <h2>3. Sharing of Information</h2>
      <p>We do not sell personal data. We share data only with:</p>
      <ul>
        <li>
          <strong>Your Tenant/employer</strong>, who controls the HR data
          entered into their organisation's workspace.
        </li>
        <li>
          <strong>Service providers</strong> who process data on our behalf
          under contract, including cloud hosting, Razorpay (payments), Google
          (OAuth sign-in, website analytics through Google Analytics and Google
          Tag Manager, and, for users who connect it, Calendar event creation),
          and transactional email/notification providers.
        </li>
        <li>
          <strong>Legal &amp; compliance</strong> — where required by law,
          regulation, or a valid legal process.
        </li>
      </ul>

      <h2>4. Data Security</h2>
      <p>
        We apply role-based access controls, encryption in transit, and
        tenant-scoped data isolation to protect information stored in the
        Service. No method of transmission or storage is 100% secure; we
        continuously work to improve our safeguards.
      </p>

      <h2>5. Data Retention</h2>
      <p>
        We retain personal data for as long as a Tenant's account remains active
        and as needed to comply with legal, tax, and accounting requirements. A
        Tenant may request deletion of their organisation's data by contacting
        us; some records may be retained where required by law. Sales enquiries
        are deleted automatically 24 months after the last activity on them (a
        new submission or follow-up), or sooner on request.
      </p>

      <h2>6. Your Rights</h2>
      <p>
        Depending on your jurisdiction, you may have the right to access,
        correct, or request deletion of your personal data, and to object to or
        restrict certain processing. Requests relating to HR data collected by
        your employer should first be directed to your employer; requests
        relating to Praesto's own processing (e.g. our website or billing
        records) can be sent to the contact below.
      </p>

      <h2>7. Cookies and Website Analytics</h2>
      <p>
        We use essential cookies/local storage to keep you signed in and
        remember preferences such as theme. We do not use third-party
        advertising cookies.
      </p>
      <p>
        On our public website — the home page, these policy pages, the sign-in
        page, the demo and contact forms and organisation setup — we use Google
        Analytics, loaded through Google Tag Manager, to understand how the site
        is used. Google Analytics sets first-party cookies (named _ga and
        _ga_&lt;ID&gt;) to tell visits apart, and receives the pages you view
        (the address without any query details other than campaign tags), the
        referring website, your browser and device type, an approximate location
        that Google derives from your IP address, and interactions such as
        button clicks, a completed demo request or a completed sign-up. It does
        not receive what you type into our forms, your name, email address or
        phone number. Analytics collects nothing inside the signed-in Praesto
        workspace, and advertising storage and personalisation are switched off.
      </p>
      <p>
        If your browser sends a Global Privacy Control or Do Not Track signal,
        Google Analytics is not loaded at all. Analytics cookies are not set for
        visitors from the European Economic Area, the United Kingdom or
        Switzerland. You can also block or delete cookies in your browser
        settings. Google’s own use of this data is described in Google’s privacy
        policy.
      </p>

      <h2>8. Changes to This Policy</h2>
      <p>
        We may update this Privacy Policy from time to time. Material changes
        will be reflected by updating the "Last updated" date above.
      </p>

      <h2>9. Google Calendar Integration</h2>
      <p>
        Interview scheduling in the Service can optionally create a Google
        Calendar event with a Google Meet link, on the calendar of the specific
        user (typically an HR team member or recruiter) who chooses to connect
        their account. Connecting is entirely optional and can be revoked at any
        time from your Google Account's{" "}
        <a
          href="https://myaccount.google.com/permissions"
          target="_blank"
          rel="noopener noreferrer"
        >
          third-party access settings
        </a>
        .
      </p>
      <ul>
        <li>
          <strong>Scope requested:</strong>{" "}
          <code>https://www.googleapis.com/auth/calendar.events</code> —
          permission to create and manage calendar events. We do not request
          read access to your existing calendar or any other Google data.
        </li>
        <li>
          <strong>What we do with it:</strong> when you schedule an interview,
          we create a single calendar event (with a Google Meet link) on your
          calendar and send an invite to the candidate. We do not read, browse,
          or export any other events on your calendar.
        </li>
        <li>
          <strong>Storage:</strong> we store an encrypted authorization token
          that lets us create events on your behalf until you disconnect.
        </li>
      </ul>
      <p>
        Praesto's use and transfer of information received from Google APIs to
        any other app will adhere to the{" "}
        <a
          href="https://developers.google.com/terms/api-services-user-data-policy"
          target="_blank"
          rel="noopener noreferrer"
        >
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements.
      </p>

      <h2>10. Contact Us</h2>
      <p>
        Questions about this Privacy Policy can be sent to{" "}
        <a href="mailto:support@praesto.in">support@praesto.in</a>.
      </p>
    </LegalPageLayout>
  );
}

export default PrivacyPolicyPage;
