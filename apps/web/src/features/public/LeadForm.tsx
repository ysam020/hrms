import { useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import {
  Banner,
  Button,
  Checkbox,
  Field,
  Select,
  TextArea,
  TextInput,
} from "@next/ui";
import { apiClient, errorMessage } from "@next/lib/api";
import { trackEvent } from "@next/app/analytics";
import { readAttribution } from "@next/app/attribution";
import s from "./public.module.css";

// The website's Book a Demo and Contact Sales forms (POST /public/leads).
//
// Everything typed here goes only to Praesto's own API. Analytics gets a
// single event after the server confirms the submission (demo_request or
// contact_submit, with form_type), never a field value.

type Kind = "demo" | "sales" | "custom";

/** The organisation-setup choices; the gateway accepts exactly these. */
const COMPANY_SIZES = ["1–25", "26–100", "More than 100"];
const TIMES = [
  ["morning", "Morning (9 am – 12 pm)"],
  ["afternoon", "Afternoon (12 – 4 pm)"],
  ["evening", "Evening (4 – 7 pm)"],
] as const;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Values = {
  name: string;
  email: string;
  phone: string;
  companyName: string;
  companySize: string;
  designation: string;
  message: string;
  preferredDate: string;
  preferredTime: string;
  consent: boolean;
  website: string; // honeypot
};
const EMPTY: Values = {
  name: "",
  email: "",
  phone: "",
  companyName: "",
  companySize: "",
  designation: "",
  message: "",
  preferredDate: "",
  preferredTime: "",
  consent: false,
  website: "",
};

/** Today in IST, for the earliest preferred demo date. */
const istToday = () =>
  new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);

export function validateLead(v: Values, kind: Kind) {
  const e: Partial<Record<keyof Values, string>> = {};
  if (v.name.trim().length < 2) e.name = "Enter your full name";
  if (!EMAIL.test(v.email.trim())) e.email = "Enter a valid work email address";
  const digits = v.phone.replace(/\D/g, "");
  if (v.phone.trim() && (digits.length < 8 || digits.length > 15))
    e.phone = "Enter a valid phone number, or leave it blank";
  if (v.companyName.trim().length < 2)
    e.companyName = "Enter your company name";
  if (!v.companySize) e.companySize = "Choose your company size";
  if (kind === "custom" && v.message.trim().length < 10)
    e.message = "Tell us briefly what you need";
  if (kind === "demo" && v.preferredDate && v.preferredDate < istToday())
    e.preferredDate = "Choose today or a later date";
  if (!v.consent) e.consent = "Please confirm so we can reply to you";
  return e;
}

const COPY: Record<Kind, { title: string; lead: string; submit: string }> = {
  demo: {
    title: "Book a Demo",
    lead: "See Praesto with someone from our team: attendance, leave, recruitment, payroll and approvals, around how your organisation works.",
    submit: "Request a Demo",
  },
  sales: {
    title: "Contact Sales",
    lead: "Questions about plans, rollout or moving from another system? Tell us a little about your organisation and we’ll get back to you.",
    submit: "Send Message",
  },
  custom: {
    title: "Get a Custom HRMS Solution",
    lead: "Need workflows, policies or integrations shaped around your organisation? Tell us what you need and we’ll get back to you.",
    submit: "Send Request",
  },
};

function LeadForm({ initialKind }: { initialKind: Kind }) {
  const [kind, setKind] = useState<Kind>(initialKind);
  const [v, setV] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof Values, string>>>(
    {},
  );
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  // One submission in flight at a time, and one conversion per success.
  const inFlight = useRef(false);

  const set = (k: keyof Values) => (e: { target: { value: string } }) =>
    setV((cur) => ({ ...cur, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (inFlight.current || sent) return;
    const found = validateLead(v, kind);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    inFlight.current = true;
    setBusy(true);
    setFailure(null);
    try {
      const opt = (x: string) => (x.trim() ? x.trim() : undefined);
      await apiClient.post(API_ENDPOINTS.PUBLIC_LEADS, {
        kind,
        name: v.name.trim(),
        email: v.email.trim(),
        phone: opt(v.phone),
        companyName: v.companyName.trim(),
        companySize: v.companySize,
        designation: opt(v.designation),
        message: opt(v.message),
        ...(kind === "demo" && {
          preferredDate: opt(v.preferredDate),
          preferredTime: opt(v.preferredTime),
        }),
        consent: true,
        attribution: readAttribution(),
        ...(v.website && { website: v.website }),
      });
      setSent(true);
      trackEvent(kind === "demo" ? "demo_request" : "contact_submit", {
        form_type: kind,
      });
    } catch (err) {
      setFailure(errorMessage(err));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const copy = COPY[kind];
  return (
    <div className={s.publicPage}>
      <header className={s.publicBar}>
        <Link to="/" className={s.brand}>
          <span className={s.glyph}>P</span> Praesto
        </Link>
        <nav className={s.legalNav} aria-label="Site">
          <Link to="/">Home</Link>
          <a href="/#pricing">Pricing</a>
          <Link to="/login">Sign In</Link>
        </nav>
      </header>
      <main>
        <article className={s.legal}>
          {sent ? (
            <div className={s.leadDone} role="status">
              <h1 className="px-display">Thank you</h1>
              <p className={s.leadLede}>
                We’ve received your request. Someone from our team will be in
                touch at {v.email.trim()}. We’ve also sent a confirmation to
                that address.
              </p>
              <p>
                <Link to="/">Back to Praesto</Link>
              </p>
            </div>
          ) : (
            <>
              <h1 className="px-display">{copy.title}</h1>
              <p className={s.leadLede}>{copy.lead}</p>
              <form className={s.leadForm} onSubmit={submit} noValidate>
                {failure && (
                  <Banner tone="danger" title="Your request wasn’t sent">
                    {failure}
                  </Banner>
                )}
                {initialKind !== "demo" && (
                  <Field label="What can we help with?">
                    <Select
                      value={kind}
                      onChange={(e) => setKind(e.target.value as Kind)}
                    >
                      <option value="sales">Plans, pricing or rollout</option>
                      <option value="custom">A custom HRMS solution</option>
                    </Select>
                  </Field>
                )}
                <div className={s.leadRow}>
                  <Field label="Full name" error={errors.name}>
                    <TextInput
                      autoComplete="name"
                      maxLength={100}
                      value={v.name}
                      onChange={set("name")}
                    />
                  </Field>
                  <Field label="Work email" error={errors.email}>
                    <TextInput
                      type="email"
                      autoComplete="email"
                      inputMode="email"
                      maxLength={254}
                      value={v.email}
                      onChange={set("email")}
                    />
                  </Field>
                </div>
                <div className={s.leadRow}>
                  <Field label="Company" error={errors.companyName}>
                    <TextInput
                      autoComplete="organization"
                      maxLength={150}
                      value={v.companyName}
                      onChange={set("companyName")}
                    />
                  </Field>
                  <Field label="Company size" error={errors.companySize}>
                    <Select value={v.companySize} onChange={set("companySize")}>
                      <option value="" disabled>
                        Choose…
                      </option>
                      {COMPANY_SIZES.map((size) => (
                        <option key={size} value={size}>
                          {size} employees
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <div className={s.leadRow}>
                  <Field
                    label="Phone"
                    optional
                    hint="If you’d prefer a call."
                    error={errors.phone}
                  >
                    <TextInput
                      type="tel"
                      autoComplete="tel"
                      inputMode="tel"
                      maxLength={20}
                      value={v.phone}
                      onChange={set("phone")}
                    />
                  </Field>
                  <Field label="Designation" optional>
                    <TextInput
                      autoComplete="organization-title"
                      maxLength={100}
                      value={v.designation}
                      onChange={set("designation")}
                    />
                  </Field>
                </div>
                {kind === "demo" && (
                  <div className={s.leadRow}>
                    <Field
                      label="Preferred date"
                      optional
                      hint="We’ll confirm a time by email."
                      error={errors.preferredDate}
                    >
                      <TextInput
                        type="date"
                        min={istToday()}
                        value={v.preferredDate}
                        onChange={set("preferredDate")}
                      />
                    </Field>
                    <Field label="Preferred time (IST)" optional>
                      <Select
                        value={v.preferredTime}
                        onChange={set("preferredTime")}
                      >
                        <option value="">Any time</option>
                        {TIMES.map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                )}
                <Field
                  label={kind === "custom" ? "What do you need?" : "Message"}
                  optional={kind !== "custom"}
                  error={errors.message}
                >
                  <TextArea
                    rows={4}
                    maxLength={2000}
                    value={v.message}
                    onChange={set("message")}
                  />
                </Field>
                {/* Honeypot: hidden from people and screen readers. */}
                <div className={s.leadHp} aria-hidden="true">
                  <label>
                    Website
                    <input
                      tabIndex={-1}
                      autoComplete="off"
                      value={v.website}
                      onChange={set("website")}
                    />
                  </label>
                </div>
                <label className={s.leadConsent}>
                  <Checkbox
                    checked={v.consent}
                    onChange={(e) =>
                      setV((cur) => ({ ...cur, consent: e.target.checked }))
                    }
                    aria-invalid={errors.consent ? true : undefined}
                    aria-describedby={
                      errors.consent ? "lead-consent-err" : undefined
                    }
                  />
                  <span>
                    Praesto may use these details to reply to my request, as
                    described in the{" "}
                    <Link to="/privacy-policy">Privacy Policy</Link>.
                  </span>
                </label>
                {errors.consent && (
                  <p id="lead-consent-err" className={s.leadError} role="alert">
                    {errors.consent}
                  </p>
                )}
                <div>
                  <Button type="submit" variant="primary" busy={busy} block>
                    {copy.submit}
                  </Button>
                </div>
                <p className="px-meta">
                  Prefer email? Write to{" "}
                  <a href="mailto:hello@praesto.in">hello@praesto.in</a>.
                </p>
              </form>
            </>
          )}
        </article>
      </main>
      <footer className={s.legalFooter}>
        <nav aria-label="Policies">
          <Link to="/privacy-policy">Privacy Policy</Link>
          <Link to="/terms-of-use">Terms of Use</Link>
          <Link to="/refund-policy">Refund Policy</Link>
        </nav>
      </footer>
    </div>
  );
}

export function BookDemoPage() {
  return <LeadForm initialKind="demo" />;
}

export function ContactPage() {
  const [params] = useSearchParams();
  return (
    <LeadForm
      initialKind={params.get("topic") === "custom" ? "custom" : "sales"}
    />
  );
}
