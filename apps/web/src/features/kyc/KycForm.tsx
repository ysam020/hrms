import {
  useContext,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useParams } from "react-router-dom";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import { kycSchema } from "@web/shared/schemas/kyc";
import { states } from "@web/assets/data/statesData";
import { TransitionLink } from "@next/motion";
import {
  Banner,
  Button,
  Card,
  EmptyState,
  Field,
  FileField,
  FileLink,
  FormGrid,
  FormSection,
  Page,
  ReviewSection,
  Select,
  StepHeader,
  Stepper,
  Switch,
  TextInput,
  WizardFooter,
  WizardLayout,
  fieldSpan2,
  focusFirstInvalid,
  inlineCheckClass,
  SectionsSkeleton,
  useWizard,
  type IconName,
  type WizardStep,
} from "@next/ui";
import { apiClient, errorMessage } from "@next/lib/api";
import { useGet } from "@next/lib/hooks";
import { fmtDate, personName } from "@next/lib/format";
import {
  ALL_KYC_FIELDS,
  BLOOD_GROUPS,
  KYC_GROUPS,
  UNEDITABLE,
  type KycField,
} from "./fields";

// Complete / edit KYC as a guided, five-step form. Same endpoints as Classic
// (POST /complete-kyc, PUT /edit-kyc), validated with Classic's kycSchema,
// documents uploaded through the same pipeline to the "employee_kyc" folder.
//
// Answers live only in this component's state: moving between steps keeps
// them, but nothing is written to browser storage (identity numbers and
// documents don't belong there) and the backend has no KYC draft, so
// leaving the page before submitting discards them.

type Values = Record<string, string | string[]>;

const blank = (): Values =>
  Object.fromEntries(
    ALL_KYC_FIELDS.map((f) => [f.key, f.kind === "files" ? [] : ""]),
  );

const GROUP = Object.fromEntries(KYC_GROUPS.map((g) => [g.title, g]));
const ADDRESS_PARTS = ["line_1", "line_2", "city", "state", "pincode"];

const GROUP_META: Record<string, { icon: IconName; description: string }> = {
  Personal: {
    icon: "person",
    description: "Your photo, date of birth, and how HR can reach you.",
  },
  "Permanent Address": {
    icon: "pin",
    description: "The address on your official documents.",
  },
  "Communication Address": {
    icon: "wfh",
    description: "Where you live now and where post should reach you.",
  },
  "Identity Documents": {
    icon: "idcard",
    description:
      "Numbers exactly as printed, with a clear photo of each side of the card.",
  },
  Bank: {
    icon: "bank",
    description: "The account your salary is paid into.",
  },
  "Education & Experience": {
    icon: "graduation",
    description: "Optional, but HR may ask for these during verification.",
  },
};

type Step = WizardStep & { groups: string[]; description: string };

const STEPS: Step[] = [
  {
    id: "personal",
    title: "Personal",
    summary: "Photo, contact, education",
    groups: ["Personal"],
    description: "Start with the basics HR uses on your employee record.",
  },
  {
    id: "address",
    title: "Address",
    summary: "Permanent and current",
    groups: ["Permanent Address", "Communication Address"],
    description:
      "If you live at your permanent address, turn on “Same as permanent address” to skip retyping it.",
  },
  {
    id: "identity",
    title: "Identity",
    summary: "Aadhaar and PAN",
    groups: ["Identity Documents"],
    description:
      "Used for statutory compliance and payroll. Only HR can see these.",
  },
  {
    id: "bank",
    title: "Bank & Records",
    summary: "Salary account, certificates",
    groups: ["Bank", "Education & Experience"],
    description: "Where your salary goes, plus any supporting documents.",
  },
  {
    id: "review",
    title: "Review",
    summary: "Check and submit",
    groups: [],
    description:
      "Check everything once before it goes to HR. Use Edit to change a section.",
  },
];
const REVIEW = STEPS.length - 1;

const stepOfKey: Record<string, number> = Object.fromEntries(
  STEPS.flatMap((st, i) =>
    st.groups.flatMap((g) => GROUP[g].fields.map((f) => [f.key, i])),
  ),
);
const stepOfGroup = (title: string) =>
  STEPS.findIndex((st) => st.groups.includes(title));

/** Every schema problem, keyed by field (first message per field). */
function validate(values: Values): Record<string, string> {
  const parsed = kycSchema.safeParse(values);
  const out: Record<string, string> = {};
  if (!parsed.success)
    for (const i of parsed.error.issues) out[String(i.path[0])] ??= i.message;
  return out;
}

const isEmpty = (v: string | string[] | undefined) =>
  Array.isArray(v) ? v.length === 0 : !String(v ?? "").trim();

const masked = (v: string) =>
  v.length > 4 ? `•••• ${v.slice(-4)}` : v ? "••••" : "";

export function CompleteKycPage() {
  const { user } = useContext(UserContext);
  return <KycFormPage username={user?.username} mode="complete" />;
}

export function EditKycPage() {
  const { username = "" } = useParams();
  return <KycFormPage username={username} mode="edit" />;
}

function KycFormPage({
  username,
  mode,
}: {
  username?: string;
  mode: "complete" | "edit";
}) {
  const { user } = useContext(UserContext);
  const { setAlert } = useContext(AlertContext);
  const person = useGet<any>(
    username ? `/get-user-data/${encodeURIComponent(username)}` : null,
  );
  const record = person.data && !person.data.message ? person.data : null;
  const [values, setValues] = useState<Values>(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sameAddress, setSameAddress] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const wizard = useWizard(STEPS.length);
  const { reachAll } = wizard;

  // Prefill from the stored record (as Classic does when editing). A
  // record with answers already has every step "visited", so any step can
  // be opened directly.
  useEffect(() => {
    if (!record) return;
    let any = false;
    const next = blank();
    for (const f of ALL_KYC_FIELDS) {
      const r = record[f.key];
      if (r != null && r !== "") {
        any = true;
        next[f.key] =
          f.kind === "files" ? (Array.isArray(r) ? r : []) : String(r);
      }
    }
    setValues(next);
    const same = ADDRESS_PARTS.every(
      (p) =>
        next[`permanent_address_${p}`] &&
        next[`permanent_address_${p}`] === next[`communication_address_${p}`],
    );
    setSameAddress(same);
    if (any) reachAll();
  }, [record, reachAll]);

  // "Same as permanent" mirrors the address while it's on.
  useEffect(() => {
    if (!sameAddress) return;
    setValues((v) => {
      const next = { ...v };
      for (const part of ADDRESS_PARTS)
        next[`communication_address_${part}`] = v[`permanent_address_${part}`];
      return next;
    });
    setErrors((e) => {
      const n = { ...e };
      for (const part of ADDRESS_PARTS)
        delete n[`communication_address_${part}`];
      return n;
    });
  }, [
    sameAddress,
    values.permanent_address_line_1,
    values.permanent_address_line_2,
    values.permanent_address_city,
    values.permanent_address_state,
    values.permanent_address_pincode,
  ]);

  const notes: Record<string, string> = record?.kyc_revision_notes ?? {};
  const status: string | undefined = record?.kyc_approval;
  const locked = mode === "edit" && UNEDITABLE.includes(status ?? "");
  const isSelf = user?.username === username;
  const title =
    mode === "edit" && !isSelf
      ? `Edit KYC — ${record ? personName(record) : username}`
      : mode === "edit"
        ? "Edit My KYC"
        : "Complete My KYC";
  const finishLabel = mode === "edit" ? "Save Changes" : "Submit KYC";

  const problems = useMemo(() => validate(values), [values]);
  // Steps to mark in the rail: shown errors, or fields HR flagged.
  const flagged = useMemo(() => {
    const out = new Set<number>();
    for (const k of Object.keys(errors))
      if (errors[k] && stepOfKey[k] != null) out.add(stepOfKey[k]);
    if (status === "Revision Requested")
      for (const k of Object.keys(notes))
        if (stepOfKey[k] != null) out.add(stepOfKey[k]);
    return [...out];
  }, [errors, notes, status]);

  const complete = useMemo(
    () =>
      STEPS.map((st, i) => i).filter((i) =>
        i === REVIEW
          ? false
          : STEPS[i].groups.every((g) =>
              GROUP[g].fields.every((f) => !problems[f.key]),
            ),
      ),
    [problems],
  );

  const set = (key: string, v: string | string[]) => {
    setValues((x) => ({ ...x, [key]: v }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: "" }));
  };

  /** Show this step's problems; true when it can be left forwards. */
  const checkStep = (i: number) => {
    const keys = STEPS[i].groups.flatMap((g) =>
      GROUP[g].fields.map((f) => f.key),
    );
    const found = Object.fromEntries(
      keys.filter((k) => problems[k]).map((k) => [k, problems[k]]),
    );
    setErrors((e) => {
      const n = { ...e };
      for (const k of keys) delete n[k];
      return { ...n, ...found };
    });
    if (Object.keys(found).length) {
      focusFirstInvalid();
      return false;
    }
    return true;
  };

  const onContinue = () => {
    if (checkStep(wizard.current)) wizard.next();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (wizard.current !== REVIEW) return onContinue();
    if (Object.keys(problems).length) {
      setErrors(problems);
      setAlert({
        open: true,
        message: `${Object.keys(problems).length} field(s) need attention.`,
        severity: "error",
      });
      return;
    }
    setSaving(true);
    try {
      const res =
        mode === "edit"
          ? await apiClient.put(API_ENDPOINTS.EDIT_KYC, { ...values, username })
          : await apiClient.post(API_ENDPOINTS.COMPLETE_KYC, {
              ...values,
              username,
            });
      setAlert({
        open: true,
        message: res.data?.message || "KYC submitted.",
        severity: "success",
      });
      setSubmitted(true);
      person.refetch();
    } catch (err) {
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    } finally {
      setSaving(false);
    }
  };

  const renderField = (f: KycField) => {
    const v = values[f.key];
    const error = errors[f.key] || null;
    const note = notes[f.key];
    const wide =
      f.kind === "file" || f.kind === "files" || f.key.includes("line_");
    const commonHint = note ? `HR asked: ${note}` : f.hint;
    const disabled = sameAddress && f.key.startsWith("communication_address");
    let control;
    if (f.kind === "file" || f.kind === "files") {
      control = (
        <FileField
          value={v}
          multiple={f.kind === "files"}
          onChange={(nv) => set(f.key, nv)}
          folder="employee_kyc"
          label={f.kind === "files" ? "Add Files" : "Upload"}
        />
      );
    } else if (f.kind === "state") {
      control = (
        <Select
          value={String(v)}
          onChange={(e) => set(f.key, e.target.value)}
          disabled={disabled}
        >
          <option value="">Choose…</option>
          {states.map((st: string) => (
            <option key={st}>{st}</option>
          ))}
        </Select>
      );
    } else if (f.kind === "blood") {
      control = (
        <Select value={String(v)} onChange={(e) => set(f.key, e.target.value)}>
          <option value="">Choose…</option>
          {BLOOD_GROUPS.map((b) => (
            <option key={b}>{b}</option>
          ))}
        </Select>
      );
    } else {
      control = (
        <TextInput
          type={
            f.kind === "date"
              ? "date"
              : f.kind === "email"
                ? "email"
                : f.kind === "tel"
                  ? "tel"
                  : "text"
          }
          inputMode={
            f.key.endsWith("pincode") ||
            f.key === "aadhar_no" ||
            f.key === "bank_account_no"
              ? "numeric"
              : undefined
          }
          autoComplete={
            f.key === "mobile"
              ? "tel-national"
              : f.key === "email"
                ? "email"
                : f.key.endsWith("pincode")
                  ? "postal-code"
                  : undefined
          }
          autoCapitalize={
            f.key === "pan_no" || f.key === "ifsc_code"
              ? "characters"
              : undefined
          }
          value={String(v ?? "")}
          disabled={disabled}
          onChange={(e) =>
            set(
              f.key,
              f.key === "pan_no" || f.key === "ifsc_code"
                ? e.target.value.toUpperCase()
                : e.target.value,
            )
          }
        />
      );
    }
    // File pickers don't take Field's id, so the wrapper carries the
    // invalid marker that focusFirstInvalid looks for.
    return (
      <div
        key={f.key}
        id={`kyc-${f.key}`}
        className={wide ? fieldSpan2 : undefined}
        style={{ minWidth: 0 }}
        data-invalid={
          error && (f.kind === "file" || f.kind === "files")
            ? "true"
            : undefined
        }
        tabIndex={
          error && (f.kind === "file" || f.kind === "files") ? -1 : undefined
        }
      >
        <Field
          label={f.label}
          optional={f.optional}
          hint={commonHint}
          error={error}
        >
          {control}
        </Field>
      </div>
    );
  };

  const renderGroup = (title: string) => {
    const g = GROUP[title];
    const meta = GROUP_META[title];
    const isCommunication = title === "Communication Address";
    return (
      <FormSection
        key={title}
        id={`kyc-group-${stepOfGroup(title)}-${title.replace(/\W+/g, "-")}`}
        icon={meta.icon}
        title={title}
        description={meta.description}
      >
        {isCommunication && (
          <label className={inlineCheckClass}>
            <Switch
              checked={sameAddress}
              onChange={setSameAddress}
              label="Same as permanent address"
            />
            Same as permanent address
          </label>
        )}
        {isCommunication && sameAddress ? (
          <p className="px-secondary">
            We’ll use your permanent address:{" "}
            <b style={{ color: "var(--px-text-1)" }}>
              {ADDRESS_PARTS.map((p) => values[`permanent_address_${p}`])
                .filter(Boolean)
                .join(", ") || "not entered yet"}
            </b>
          </p>
        ) : (
          <FormGrid columns={2}>{g.fields.map(renderField)}</FormGrid>
        )}
      </FormSection>
    );
  };

  const displayValue = (f: KycField): ReactNode => {
    const v = values[f.key];
    if (f.kind === "files") {
      const list = Array.isArray(v) ? v : [];
      return list.length ? (
        <span style={{ display: "grid", gap: 4 }}>
          {list.map((u) => (
            <FileLink key={u} url={u} />
          ))}
        </span>
      ) : (
        ""
      );
    }
    const str = String(v ?? "");
    if (!str) return "";
    if (f.kind === "file") return <FileLink url={str} />;
    if (f.kind === "date") return fmtDate(str);
    if (f.mask) return <span className="px-num">{masked(str)}</span>;
    return str;
  };

  const review = (
    <div style={{ display: "grid", gap: 16 }}>
      {Object.keys(problems).length > 0 ? (
        <Banner
          tone="warning"
          title={`${Object.keys(problems).length} required answer${Object.keys(problems).length === 1 ? " is" : "s are"} missing or invalid`}
        >
          They’re listed in the sections below. Use Edit to fix each one.
        </Banner>
      ) : (
        <Banner tone="success" title="Everything required is filled in">
          {mode === "edit"
            ? "Save to update the record."
            : "Submit to send it to HR for verification. You’ll be notified when it’s reviewed."}
        </Banner>
      )}
      {STEPS.flatMap((st) => st.groups.map((title) => GROUP[title])).map(
        (g) => {
          const step = stepOfGroup(g.title);
          const communicationSame =
            g.title === "Communication Address" && sameAddress;
          return (
            <ReviewSection
              key={g.title}
              title={g.title}
              icon={GROUP_META[g.title].icon}
              onEdit={() => wizard.go(step)}
              issues={g.fields
                .filter((f) => problems[f.key])
                .map((f) =>
                  isEmpty(values[f.key])
                    ? `${f.label} is required`
                    : `${f.label}: ${problems[f.key]}`,
                )}
              items={
                communicationSame
                  ? [["Address", "Same as permanent address"]]
                  : g.fields.map((f) => [
                      <>
                        {f.label}
                        {f.optional && (
                          <span className="px-tertiary"> · Optional</span>
                        )}
                      </>,
                      displayValue(f),
                    ])
              }
            />
          );
        },
      )}
    </div>
  );

  const step = STEPS[wizard.current];

  return (
    <Page
      title={title}
      width="wide"
      description={
        !locked && !submitted
          ? "Your KYC verifies your identity and sets up salary payments. It takes about five minutes; have your Aadhaar, PAN and bank details ready."
          : undefined
      }
      back={
        mode === "edit" && username
          ? { to: `/view-kyc/${encodeURIComponent(username)}`, label: "KYC" }
          : undefined
      }
    >
      {person.loading && !record ? (
        <SectionsSkeleton sections={3} fields={6} toggles={0} />
      ) : locked ? (
        <EmptyState
          icon="lock"
          tone="neutral"
          title={
            status === "Edit Requested"
              ? "Edit request pending"
              : "This KYC is finalised"
          }
          action={
            <TransitionLink
              to={`/view-kyc/${encodeURIComponent(username ?? "")}`}
            >
              <Button>View KYC</Button>
            </TransitionLink>
          }
        >
          {status === "Edit Requested"
            ? "HR needs to approve the edit request before changes can be made."
            : "It can’t be edited directly. Request an update from the KYC page."}
        </EmptyState>
      ) : submitted ? (
        <Card>
          <EmptyState
            icon="checkCircle"
            tone="success"
            title={mode === "edit" ? "KYC updated" : "KYC submitted for review"}
            action={
              <div className="px-row" style={{ justifyContent: "center" }}>
                <Button
                  onClick={() => {
                    setSubmitted(false);
                    wizard.go(REVIEW);
                  }}
                >
                  Review Answers
                </Button>
                <TransitionLink
                  to={`/view-kyc/${encodeURIComponent(username ?? "")}`}
                >
                  <Button variant="primary">View KYC</Button>
                </TransitionLink>
              </div>
            }
          >
            {mode === "edit"
              ? "The changes are saved."
              : "HR will verify your details. You’ll get a notification when it’s approved or if anything needs changing."}
          </EmptyState>
        </Card>
      ) : (
        <form id="kyc-form" onSubmit={submit} noValidate>
          <WizardLayout
            stepper={
              <Stepper
                label="KYC steps"
                steps={STEPS}
                current={wizard.current}
                reached={wizard.reached}
                onSelect={wizard.go}
                flagged={flagged}
                complete={complete}
              />
            }
          >
            {status === "Revision Requested" &&
              Object.keys(notes).length > 0 && (
                <Banner
                  tone="danger"
                  title={`HR asked for changes to ${Object.keys(notes).length} field(s)`}
                >
                  Steps with requested changes are marked in the list. Each
                  field shows what HR asked for.
                </Banner>
              )}
            <StepHeader
              index={wizard.current}
              count={STEPS.length}
              title={step.title}
              description={step.description}
            />
            {wizard.current === REVIEW ? review : step.groups.map(renderGroup)}
            <WizardFooter
              isFirst={wizard.isFirst}
              isLast={wizard.isLast}
              onBack={wizard.back}
              onContinue={onContinue}
              continueLabel={
                wizard.current === REVIEW - 1 ? "Review" : "Continue"
              }
              finishLabel={finishLabel}
              formId="kyc-form"
              busy={saving}
              leading={
                <span className="px-meta">
                  Fields are required unless marked Optional.
                </span>
              }
            />
          </WizardLayout>
        </form>
      )}
    </Page>
  );
}
