import { useContext, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { AlertContext } from "@web/app/providers/AlertContext";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import { useTransitionNavigate } from "@next/motion";
import {
  Button,
  Field,
  FormGrid,
  Page,
  RichTextEditor,
  Select,
  Skeleton,
  TextInput,
  plainText,
  FormSkeleton,
} from "@next/ui";
import { apiClient, asList, errorMessage } from "@next/lib/api";
import { useGet } from "@next/lib/hooks";

// Write / edit a policy (Classic's CreatePolicy and edit dialog): POST /policies
// (upserts by type), PUT /policies/:id. Same types and validation rules.

export const POLICY_TYPES = [
  "POSH Policy",
  "Advance Salary Policy",
  "Code of Conduct",
  "Leave Policy",
  "Other",
];

export function NewPolicyPage() {
  return <PolicyEditor />;
}
export function EditPolicyPage() {
  const { id = "" } = useParams();
  return <PolicyEditor id={id} />;
}

function PolicyEditor({ id }: { id?: string }) {
  const { setAlert } = useContext(AlertContext);
  const navigate = useTransitionNavigate();
  // Policies are listed, not fetched individually, in Classic's API.
  const all = useGet<any>(id ? API_ENDPOINTS.GET_POLICIES(1, 100) : null);
  const [type, setType] = useState("");
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id || !all.data) return;
    const p = asList<any>(all.data, "policies").find(
      (x) => String(x.id) === id,
    );
    if (!p) return;
    const known = POLICY_TYPES.includes(p.category);
    setType(known ? p.category : "Other");
    setName(known ? "" : (p.title ?? p.category ?? ""));
    setContent(p.content ?? "");
  }, [id, all.data]);

  const save = async () => {
    const n: Record<string, string> = {};
    if (!type) n.type = "Choose a policy type.";
    if (type === "Other" && !name.trim()) n.name = "Name the policy.";
    if (plainText(content).length < 10)
      n.content = "Write at least a sentence.";
    setErrors(n);
    if (Object.keys(n).length) return;
    setSaving(true);
    try {
      const policyType = type === "Other" ? name.trim() : type;
      if (id) {
        await apiClient.put(API_ENDPOINTS.UPDATE_POLICY(id), {
          policyType: type,
          content,
          ...(type === "Other" ? { policyName: name.trim() } : {}),
        });
        setAlert({
          open: true,
          message: "Policy updated.",
          severity: "success",
        });
      } else {
        const res = await apiClient.post(API_ENDPOINTS.CREATE_POLICY, {
          policyType,
          content,
        });
        setAlert({
          open: true,
          message: res.data?.data?._upserted
            ? "Policy updated."
            : res.data?.message || "Policy published.",
          severity: "success",
        });
      }
      navigate("/policy");
    } catch (err) {
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Page
      title={id ? "Edit Policy" : "New Policy"}
      width="reading"
      back={{ to: "/policy", label: "Policies" }}
      actions={
        <Button variant="primary" icon="check" busy={saving} onClick={save}>
          {id ? "Save Changes" : "Publish"}
        </Button>
      }
    >
      {id && all.loading ? (
        <div style={{ display: "grid", gap: 20 }}>
          <FormSkeleton fields={2} columns={2} />
          <Skeleton height={280} radius={10} />
        </div>
      ) : (
        <div style={{ display: "grid", gap: 20 }}>
          <FormGrid columns={2}>
            <Field
              label="Policy"
              error={errors.type}
              hint={
                !id
                  ? "Publishing a type that already exists replaces it."
                  : undefined
              }
            >
              <Select
                data-autofocus
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                <option value="">Choose…</option>
                {POLICY_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </Select>
            </Field>
            {type === "Other" && (
              <Field label="Name" error={errors.name}>
                <TextInput
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Travel Policy"
                />
              </Field>
            )}
          </FormGrid>
          <Field label="Content" error={errors.content}>
            <RichTextEditor
              label="Policy content"
              value={content}
              onChange={setContent}
              invalid={Boolean(errors.content)}
            />
          </Field>
        </div>
      )}
    </Page>
  );
}
