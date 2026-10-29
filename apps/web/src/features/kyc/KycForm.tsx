import {
  useContext,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
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
  EmptyState,
  Field,
  FileField,
  FormGrid,
  Page,
  Select,
  Skeleton,
  Switch,
  TextInput,
  fieldSpan2,
  inlineCheckClass,
  SectionsSkeleton,
} from "@next/ui";
import { apiClient, errorMessage } from "@next/lib/api";
import { useGet } from "@next/lib/hooks";
import { personName } from "@next/lib/format";
import {
  ALL_KYC_FIELDS,
  BLOOD_GROUPS,
  KYC_GROUPS,
  UNEDITABLE,
  type KycField,
} from "./fields";

// Complete / edit KYC. Same endpoints as Classic (POST /complete-kyc,
// PUT /edit-kyc), validated with Classic's kycSchema, documents uploaded
// through Classic's upload pipeline to the same "employee_kyc" folder.

type Values = Record<string, string | string[]>;

const blank = (): Values =>
  Object.fromEntries(
    ALL_KYC_FIELDS.map((f) => [f.key, f.kind === "files" ? [] : ""]),
  );

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

  // Prefill from the stored record (as Classic does when editing).
  useEffect(() => {
    if (!record) return;
    setValues((v) => {
      const next = { ...v };
      for (const f of ALL_KYC_FIELDS) {
        const r = record[f.key];
        if (r != null)
          next[f.key] =
            f.kind === "files" ? (Array.isArray(r) ? r : []) : String(r);
      }
      return next;
    });
  }, [record]);

  // "Same as permanent" mirrors the address while it's on.
  useEffect(() => {
    if (!sameAddress) return;
    setValues((v) => {
      const next = { ...v };
      for (const part of ["line_1", "line_2", "city", "state", "pincode"]) {
        next[`communication_address_${part}`] = v[`permanent_address_${part}`];
      }
      return next;
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

  const set = (key: string, v: string | string[]) => {
    setValues((x) => ({ ...x, [key]: v }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: "" }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = kycSchema.safeParse(values);
    if (!parsed.success) {
      const n: Record<string, string> = {};
      for (const i of parsed.error.issues) n[String(i.path[0])] ??= i.message;
      setErrors(n);
      const first = Object.keys(n)[0];
      document
        .getElementById(`kyc-${first}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      setAlert({
        open: true,
        message: `${Object.keys(n).length} field(s) need attention.`,
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
    // Hidden inputs don't take an id via Field, so anchor scroll targets on a wrapper.
    return (
      <div
        key={f.key}
        id={`kyc-${f.key}`}
        className={wide ? fieldSpan2 : undefined}
        style={{ minWidth: 0 }}
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

  const flagged = useMemo(() => Object.keys(notes), [notes]);

  return (
    <Page
      title={title}
      width="reading"
      back={
        mode === "edit" && username
          ? { to: `/view-kyc/${encodeURIComponent(username)}`, label: "KYC" }
          : undefined
      }
      actions={
        !locked && (
          <Button
            variant="primary"
            icon="check"
            type="submit"
            form="kyc-form"
            busy={saving}
          >
            {mode === "edit" ? "Save Changes" : "Submit KYC"}
          </Button>
        )
      }
    >
      {person.loading && !record ? (
        <SectionsSkeleton sections={3} fields={6} toggles={0} />
      ) : locked ? (
        <EmptyState
          icon="lock"
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
      ) : (
        <form
          id="kyc-form"
          onSubmit={submit}
          noValidate
          style={{ display: "grid", gap: 36 }}
        >
          {status === "Revision Requested" && flagged.length > 0 && (
            <Banner tone="danger">
              HR asked for changes to {flagged.length} field(s). They’re marked
              below — update them and resubmit.
            </Banner>
          )}
          {KYC_GROUPS.map((g) => (
            <section key={g.title} style={{ display: "grid", gap: 14 }}>
              <h2 className="px-section">{g.title}</h2>
              {g.title === "Communication Address" && (
                <label className={inlineCheckClass}>
                  <Switch
                    checked={sameAddress}
                    onChange={setSameAddress}
                    label="Same as permanent address"
                  />
                  Same as permanent address
                </label>
              )}
              <FormGrid columns={2}>{g.fields.map(renderField)}</FormGrid>
            </section>
          ))}
          <div className="px-row" style={{ justifyContent: "flex-end" }}>
            <Button variant="primary" type="submit" busy={saving}>
              {mode === "edit" ? "Save Changes" : "Submit KYC"}
            </Button>
          </div>
        </form>
      )}
    </Page>
  );
}
