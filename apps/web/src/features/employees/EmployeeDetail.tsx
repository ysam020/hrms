import type { ReactNode } from "react";
import { useContext, useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import { employeeManagementSchema } from "@web/shared/schemas/employeeManagement";
import hasPermission from "@web/shared/utils/permissions/hasPermission";
import {
  isHrOrAbove,
  isOwnerOrAdmin,
} from "@web/shared/utils/permissions/navAccess";
import { Collapse, sharedName, vtName } from "@next/motion";
import {
  Icon,
  FormSection,
  Button,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  FormGrid,
  KeyValues,
  Page,
  Section,
  Select,
  Skeleton,
  TextArea,
  TextInput,
  fieldSpan2,
} from "@next/ui";
import { apiClient, asList, errorMessage } from "@next/lib/api";
import { useGet } from "@next/lib/hooks";
import { fmtDate, fmtMoney, personName, readableCase } from "@next/lib/format";
import { EmployeeIdentity } from "./EmployeeIdentity";
import s from "./employees.module.css";

// Full employee record: GET /get-employee-details/:username (server scopes
// fields for non-owners/non-HR, exactly as in Classic) plus assigned assets.
// Editing employment details reuses Classic's employeeManagementSchema and
// PUT /edit-employee-details, gated by the same permission check.

export default function EmployeeDetail() {
  const { username = "" } = useParams();
  const { user } = useContext(UserContext);
  const { data, loading, error, refetch } = useGet<any>(
    `/get-employee-details/${encodeURIComponent(username)}`,
  );
  const assets = useGet<any>(
    data?.id
      ? `/assets?page=1&limit=50&userId=${data.id}&status=assigned`
      : null,
  );
  const [editing, setEditing] = useState(false);
  const canEdit =
    isOwnerOrAdmin(user) ||
    hasPermission(
      "EmployeeManagement",
      "edit",
      "-",
      user?.isSuperUser,
      user?.permissions || [],
    );
  const person = data && !data.message ? data : null;

  return (
    <Page
      title={person ? personName(person) : "Employee"}
      back={
        isHrOrAbove(user)
          ? { to: "/employee-management", label: "Employees" }
          : undefined
      }
      largeTitle
      width="wide"
      actions={
        canEdit && person ? (
          <Button icon="edit" onClick={() => setEditing(true)}>
            Edit Employment
          </Button>
        ) : undefined
      }
    >
      {loading && !person ? (
        <div
          style={{
            display: "flex",
            gap: 16,
            alignItems: "center",
            padding: "8px 0 24px",
          }}
        >
          <Skeleton width={64} height={64} radius={32} />
          <div style={{ display: "grid", gap: 8 }}>
            <Skeleton width={220} height={28} />
            <Skeleton width={160} />
          </div>
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : !person ? (
        <EmptyState icon="person" title="This person couldn’t be found">
          They may have been removed, or the link is out of date.
        </EmptyState>
      ) : (
        <>
          <div className={s.hero}>
            <EmployeeIdentity
              person={person}
              style={sharedName(vtName("employee", username))}
            />
          </div>
          <div className={s.columns}>
            <div className={s.stack}>
              <FormSection
                icon="briefcase"
                title="Work"
                description="Role and reporting details"
              >
                <KeyValues
                  items={[
                    ["Username", person.username],
                    ["Work Email", person.official_email],
                    ["Department", readableCase(person.department) || null],
                    ["Designation", readableCase(person.designation) || null],
                    [
                      "Joined",
                      fmtDate(person.joiningDate ?? person.joining_date),
                    ],
                    ...(person.employeeStatus === "Terminated"
                      ? ([
                          ["Terminated On", fmtDate(person.dateOfTermination)],
                          ["Reason", person.reasonForTermination],
                        ] as [string, string][])
                      : []),
                    ...(person.employeeStatus === "Absconded"
                      ? ([["Absconded On", fmtDate(person.dateOfAbscond)]] as [
                          string,
                          string,
                        ][])
                      : []),
                  ]}
                />
              </FormSection>
              <FormSection
                icon="shield"
                tone="warning"
                title="Statutory & Pay"
                description="Used for payroll and compliance filings"
              >
                <KeyValues
                  items={[
                    ["PF Number", person.pf_no],
                    ["UAN", person.uan_no],
                    ["ESIC Number", person.esic_no],
                    ...(person.salary != null
                      ? ([
                          [
                            "Salary",
                            <b className="px-num">
                              {fmtMoney(person.salary?.gross ?? person.salary)}
                            </b>,
                          ],
                        ] as [string, ReactNode][])
                      : []),
                  ]}
                />
              </FormSection>
            </div>
            <div className={s.stack}>
              <FormSection
                icon="person"
                tone="success"
                title="Personal"
                description="Contact details from their KYC"
              >
                <KeyValues
                  items={[
                    ["Personal Email", person.email],
                    ["Phone", person.mobile],
                    ["Date of Birth", fmtDate(person.dob)],
                    ["Blood Group", person.blood_group],
                    [
                      "Address",
                      [
                        person.communication_address_line_1,
                        person.communication_address_city,
                        person.communication_address_state,
                      ]
                        .filter(Boolean)
                        .join(", ") || null,
                    ],
                  ]}
                />
              </FormSection>
              <FormSection icon="laptop" tone="neutral" title="Assigned Assets">
                {assets.loading ? (
                  <Skeleton height={40} />
                ) : asList(assets.data, "assets").length === 0 ? (
                  <p className={s.none}>
                    <Icon name="laptop" size={16} />
                    No assets assigned.
                  </p>
                ) : (
                  <ul className={s.assetList}>
                    {asList(assets.data, "assets").map((a: any) => (
                      <li key={a._id || a.id || a.assetCode}>
                        <span className={s.assetName}>
                          <span className={s.assetIcon} aria-hidden>
                            <Icon name="laptop" size={16} />
                          </span>
                          {a.name}
                        </span>
                        <span className="px-meta px-num">{a.assetCode}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </FormSection>
            </div>
          </div>
          {canEdit && (
            <EditEmployment
              open={editing}
              onClose={() => setEditing(false)}
              person={person}
              username={username}
              onSaved={() => {
                setEditing(false);
                refetch();
              }}
            />
          )}
        </>
      )}
    </Page>
  );
}

type Values = {
  employeeStatus: "Active" | "Terminated" | "Absconded";
  pf_no: string;
  uan_no: string;
  esic_no: string;
  reasonForTermination: string;
  dateOfTermination: string;
  dateOfAbscond: string;
};

function EditEmployment({
  open,
  onClose,
  person,
  username,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  person: any;
  username: string;
  onSaved: () => void;
}) {
  const { setAlert } = useContext(AlertContext);
  const initial = (): Values => ({
    employeeStatus:
      person?.employeeStatus === "Terminated" ||
      person?.employeeStatus === "Absconded"
        ? person.employeeStatus
        : "Active",
    pf_no: person?.pf_no || "",
    uan_no: person?.uan_no || "",
    esic_no: person?.esic_no || "",
    reasonForTermination: person?.reasonForTermination || "",
    dateOfTermination: (person?.dateOfTermination || "").slice(0, 10),
    dateOfAbscond: (person?.dateOfAbscond || "").slice(0, 10),
  });
  const [values, setValues] = useState<Values>(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof Values, string>>>(
    {},
  );
  const [saving, setSaving] = useState(false);
  // Start from the current record each time the dialog opens.
  useEffect(() => {
    if (open) {
      setValues(initial());
      setErrors({});
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: keyof Values) => (e: { target: { value: string } }) => {
    setValues((v) => ({ ...v, [k]: e.target.value }));
    if (errors[k]) setErrors((x) => ({ ...x, [k]: undefined }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = employeeManagementSchema.safeParse(values);
    if (!parsed.success) {
      const next: typeof errors = {};
      for (const issue of parsed.error.issues)
        next[issue.path[0] as keyof Values] ??= issue.message;
      setErrors(next);
      return;
    }
    setSaving(true);
    try {
      const res = await apiClient.put(API_ENDPOINTS.EDIT_EMPLOYEE_DETAILS, {
        ...values,
        username,
      });
      setAlert({
        open: true,
        message: res.data?.message || "Employment details saved.",
        severity: "success",
      });
      onSaved();
    } catch (err) {
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      busy={saving}
      title="Edit Employment Details"
      description={personName(person)}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="employment-form"
            busy={saving}
          >
            Save Changes
          </Button>
        </>
      }
    >
      <form id="employment-form" onSubmit={submit} noValidate>
        <FormGrid columns={2}>
          <Field label="Employment Status" className={fieldSpan2}>
            <Select
              value={values.employeeStatus}
              onChange={set("employeeStatus")}
              data-autofocus
            >
              <option value="Active">Active</option>
              <option value="Terminated">Terminated</option>
              <option value="Absconded">Absconded</option>
            </Select>
          </Field>
        </FormGrid>
        {/* Fields that only apply to the chosen status are revealed in place. */}
        <Collapse open={values.employeeStatus === "Terminated"}>
          <div style={{ paddingTop: 16 }}>
            <FormGrid columns={2}>
              <Field
                label="Date of Termination"
                error={errors.dateOfTermination}
              >
                <TextInput
                  type="date"
                  value={values.dateOfTermination}
                  onChange={set("dateOfTermination")}
                />
              </Field>
              <Field
                label="Reason"
                error={errors.reasonForTermination}
                className={fieldSpan2}
              >
                <TextArea
                  value={values.reasonForTermination}
                  onChange={set("reasonForTermination")}
                  rows={2}
                />
              </Field>
            </FormGrid>
          </div>
        </Collapse>
        <Collapse open={values.employeeStatus === "Absconded"}>
          <div style={{ paddingTop: 16 }}>
            <Field label="Date of Abscond" error={errors.dateOfAbscond}>
              <TextInput
                type="date"
                value={values.dateOfAbscond}
                onChange={set("dateOfAbscond")}
              />
            </Field>
          </div>
        </Collapse>
        <div style={{ paddingTop: 16 }}>
          <FormGrid columns={2}>
            <Field label="PF Number" optional>
              <TextInput value={values.pf_no} onChange={set("pf_no")} />
            </Field>
            <Field label="UAN" optional>
              <TextInput
                value={values.uan_no}
                onChange={set("uan_no")}
                inputMode="numeric"
              />
            </Field>
            <Field label="ESIC Number" optional>
              <TextInput value={values.esic_no} onChange={set("esic_no")} />
            </Field>
          </FormGrid>
        </div>
      </form>
    </Dialog>
  );
}
