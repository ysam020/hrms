import { useCallback, useContext, useEffect, useState } from "react";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import { isHrOrAbove } from "@web/shared/utils/permissions/navAccess";
import {
  EMPTY_CHECKLIST_FORM,
  EMPTY_POLICY_FORM,
  newQuestionId,
  type ExitChecklistItemDef,
  type ExitQuestion,
  type NoticePeriodPolicy,
} from "@web/features/settings/exit-policy/types";
import {
  EMPTY_COMPONENT_FORM,
  EMPTY_CYCLE_FORM,
  EMPTY_SLAB_FORM,
  EMPTY_TAX_SLAB_FORM,
  type IncomeTaxSlab,
  type PayCycle,
  type PtSlab,
  type SalaryComponent,
} from "@web/features/settings/payroll-components/types";
import { states } from "@web/assets/data/statesData";
import { StaggerItem, StaggerList } from "@next/motion";
import {
  Button,
  Field,
  FormGrid,
  IconButton,
  Page,
  SegmentedControl,
  Select,
  Skeleton,
  StatusBadge,
  Switch,
  TextInput,
  fieldSpan2,
  inlineCheckClass,
  TextSkeleton,
  TableSkeleton,
} from "@next/ui";
import { apiClient, asList, errorMessage } from "@next/lib/api";
import { fmtMoney } from "@next/lib/format";
import { CrudSection, useCanEditOrgSettings } from "./shared";

// Exit Policy and Payroll Setup (Classic's ExitPolicySettings and
// PayrollComponentsSettings). Types, empty forms, and the create/update/
// delete flow (useCrudDialog) are Classic's; only the presentation is new.

const num = (v: string) => (v === "" ? 0 : Number(v));

// ── Exit policy ─────────────────────────────────────────────────────────────

export function ExitPolicyPage() {
  const { user } = useContext(UserContext);
  const { setAlert } = useContext(AlertContext);
  const canEdit =
    isHrOrAbove(user) ||
    Boolean(
      user?.permissions?.includes("Organisation:edit_organisation_settings"),
    );
  const [policies, setPolicies] = useState<NoticePeriodPolicy[]>([]);
  const [checklist, setChecklist] = useState<ExitChecklistItemDef[]>([]);
  const [questions, setQuestions] = useState<ExitQuestion[]>([]);
  const [qDirty, setQDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingQ, setSavingQ] = useState(false);
  const [view, setView] = useState("notice");

  const loadPolicies = useCallback(
    async () =>
      setPolicies(
        asList(
          (await apiClient.get(API_ENDPOINTS.LIST_NOTICE_PERIOD_POLICIES)).data
            ?.data,
        ),
      ),
    [],
  );
  const loadChecklist = useCallback(
    async () =>
      setChecklist(
        asList(
          (await apiClient.get(API_ENDPOINTS.LIST_EXIT_CHECKLIST_DEFS)).data
            ?.data,
        ),
      ),
    [],
  );
  useEffect(() => {
    Promise.allSettled([
      loadPolicies(),
      loadChecklist(),
      apiClient
        .get(API_ENDPOINTS.GET_EXIT_INTERVIEW_TEMPLATE)
        .then((r) => setQuestions(r.data?.data?.questions ?? [])),
    ]).finally(() => setLoading(false));
  }, [loadPolicies, loadChecklist]);

  const saveQuestions = async () => {
    setSavingQ(true);
    try {
      await apiClient.put(API_ENDPOINTS.UPDATE_EXIT_INTERVIEW_TEMPLATE, {
        questions: questions.filter((q) => q.label.trim()),
      });
      setAlert({
        open: true,
        message: "Exit interview saved.",
        severity: "success",
      });
      setQDirty(false);
    } catch (err) {
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    } finally {
      setSavingQ(false);
    }
  };
  const editQ = (i: number, patch: Partial<ExitQuestion>) => {
    setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, ...patch } : q)));
    setQDirty(true);
  };

  return (
    <Page
      title="Exit Policy"
      width="wide"
      tabs={
        <SegmentedControl
          label="Exit policy areas"
          value={view}
          onChange={setView}
          segments={[
            {
              value: "notice",
              label: "Notice Periods",
              count: policies.length,
            },
            {
              value: "checklist",
              label: "Exit Checklist",
              count: checklist.length,
            },
            {
              value: "interview",
              label: "Exit Interview",
              count: questions.length,
            },
          ]}
        />
      }
    >
      {loading ? (
        <div style={{ display: "grid", gap: 14 }}>
          <TextSkeleton lines={2} lastWidth="40%" />
          <TableSkeleton rows={4} columns={3} />
        </div>
      ) : view === "notice" ? (
        <CrudSection<NoticePeriodPolicy, typeof EMPTY_POLICY_FORM>
          title="Notice Periods"
          detail="The most specific matching rule (highest priority) applies; otherwise HR Policy’s default."
          noun="Rule"
          items={[...policies].sort((a, b) => b.priority - a.priority)}
          canEdit={canEdit}
          onRefetch={loadPolicies}
          columns={[
            {
              key: "who",
              header: "Applies To",
              priority: "primary",
              render: (p) => (
                <span className="px-headline">
                  {[p.designation, p.department].filter(Boolean).join(" · ") ||
                    (p.isProbationPolicy ? "People on probation" : "Everyone")}
                </span>
              ),
            },
            {
              key: "tenure",
              header: "Tenure",
              priority: "secondary",
              render: (p) =>
                `${p.minTenureMonths}–${p.maxTenureMonths ?? "∞"} months`,
            },
            {
              key: "days",
              header: "Notice",
              align: "right",
              priority: "secondary",
              stackLabel: "Notice",
              render: (p) => `${p.noticePeriodDays} days`,
            },
            {
              key: "prio",
              header: "Priority",
              align: "right",
              priority: "hidden",
              render: (p) => p.priority,
            },
          ]}
          crud={{
            emptyForm: EMPTY_POLICY_FORM,
            toForm: (p) => ({
              minTenureMonths: p.minTenureMonths,
              maxTenureMonths: p.maxTenureMonths ?? "",
              designation: p.designation ?? "",
              department: p.department ?? "",
              noticePeriodDays: p.noticePeriodDays,
              isProbationPolicy: p.isProbationPolicy,
              priority: p.priority,
            }),
            buildPayload: (f) => ({
              minTenureMonths: f.minTenureMonths,
              maxTenureMonths:
                f.maxTenureMonths === ""
                  ? undefined
                  : Number(f.maxTenureMonths),
              designation: f.designation || undefined,
              department: f.department || undefined,
              noticePeriodDays: f.noticePeriodDays,
              isProbationPolicy: f.isProbationPolicy,
              priority: f.priority,
            }),
            getId: (p) => p.id,
            create: (b) =>
              apiClient.post(API_ENDPOINTS.CREATE_NOTICE_PERIOD_POLICY, b),
            update: (id, b) =>
              apiClient.put(API_ENDPOINTS.UPDATE_NOTICE_PERIOD_POLICY(id), b),
            remove: (id) =>
              apiClient.delete(API_ENDPOINTS.DELETE_NOTICE_PERIOD_POLICY(id)),
          }}
          form={(f, set) => (
            <FormGrid columns={2}>
              <Field label="Designation" optional>
                <TextInput
                  data-autofocus
                  value={f.designation}
                  onChange={(e) => set({ designation: e.target.value })}
                />
              </Field>
              <Field label="Department" optional>
                <TextInput
                  value={f.department}
                  onChange={(e) => set({ department: e.target.value })}
                />
              </Field>
              <Field label="Min Tenure (Months)">
                <TextInput
                  type="number"
                  min={0}
                  value={f.minTenureMonths}
                  onChange={(e) =>
                    set({ minTenureMonths: num(e.target.value) })
                  }
                />
              </Field>
              <Field label="Max Tenure (Months)" optional>
                <TextInput
                  type="number"
                  min={0}
                  value={f.maxTenureMonths}
                  onChange={(e) =>
                    set({
                      maxTenureMonths:
                        e.target.value === "" ? "" : Number(e.target.value),
                    })
                  }
                />
              </Field>
              <Field label="Notice Period (Days)">
                <TextInput
                  type="number"
                  min={0}
                  value={f.noticePeriodDays}
                  onChange={(e) =>
                    set({ noticePeriodDays: num(e.target.value) })
                  }
                />
              </Field>
              <Field label="Priority" hint="Higher wins">
                <TextInput
                  type="number"
                  value={f.priority}
                  onChange={(e) => set({ priority: num(e.target.value) })}
                />
              </Field>
              <label className={`${inlineCheckClass} ${fieldSpan2}`}>
                <Switch
                  label="Probation rule"
                  checked={f.isProbationPolicy}
                  onChange={(v) => set({ isProbationPolicy: v })}
                />
                Applies to people still on probation
              </label>
            </FormGrid>
          )}
        />
      ) : view === "checklist" ? (
        <CrudSection<ExitChecklistItemDef, typeof EMPTY_CHECKLIST_FORM>
          title="Exit Checklist"
          detail="Tasks completed before someone’s last day"
          noun="Item"
          items={[...checklist].sort((a, b) => a.order - b.order)}
          canEdit={canEdit}
          onRefetch={loadChecklist}
          columns={[
            {
              key: "label",
              header: "Task",
              priority: "primary",
              render: (c) => <span className="px-headline">{c.label}</span>,
            },
            {
              key: "role",
              header: "Owner",
              priority: "secondary",
              render: (c) => c.owningRole,
            },
            {
              key: "req",
              header: "Required",
              priority: "hidden",
              render: (c) => (c.isRequired ? "Yes" : "Optional"),
            },
          ]}
          crud={{
            emptyForm: EMPTY_CHECKLIST_FORM,
            toForm: (c) => ({
              label: c.label,
              owningRole: c.owningRole,
              isRequired: c.isRequired,
              order: c.order,
            }),
            getId: (c) => c.id,
            create: (b) =>
              apiClient.post(API_ENDPOINTS.CREATE_EXIT_CHECKLIST_DEF, b),
            update: (id, b) =>
              apiClient.put(API_ENDPOINTS.UPDATE_EXIT_CHECKLIST_DEF(id), b),
            remove: (id) =>
              apiClient.delete(API_ENDPOINTS.DELETE_EXIT_CHECKLIST_DEF(id)),
          }}
          form={(f, set) => (
            <FormGrid columns={2}>
              <Field label="Task" className={fieldSpan2}>
                <TextInput
                  data-autofocus
                  value={f.label}
                  onChange={(e) => set({ label: e.target.value })}
                  placeholder="Return laptop"
                />
              </Field>
              <Field label="Owner">
                <Select
                  value={f.owningRole}
                  onChange={(e) => set({ owningRole: e.target.value })}
                >
                  {["IT", "Finance", "HR", "Admin", "Manager"].map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Order">
                <TextInput
                  type="number"
                  min={0}
                  value={f.order}
                  onChange={(e) => set({ order: num(e.target.value) })}
                />
              </Field>
              <label className={`${inlineCheckClass} ${fieldSpan2}`}>
                <Switch
                  label="Required"
                  checked={f.isRequired}
                  onChange={(v) => set({ isRequired: v })}
                />
                Required before the last day
              </label>
            </FormGrid>
          )}
        />
      ) : (
        <section style={{ display: "grid", gap: 12 }}>
          <header
            className="px-row"
            style={{ justifyContent: "space-between" }}
          >
            <h2 className="px-section">Exit Interview Questions</h2>
            {canEdit && (
              <span className="px-row">
                <Button
                  size="small"
                  icon="plus"
                  onClick={() => {
                    setQuestions((q) => [
                      ...q,
                      {
                        id: newQuestionId(),
                        label: "",
                        type: "rating",
                        required: false,
                      },
                    ]);
                    setQDirty(true);
                  }}
                >
                  Add Question
                </Button>
                <Button
                  size="small"
                  variant="primary"
                  disabled={!qDirty}
                  busy={savingQ}
                  onClick={saveQuestions}
                >
                  Save Questions
                </Button>
              </span>
            )}
          </header>
          <StaggerList as="ol" style={{ display: "grid", gap: 8 }}>
            {questions.map((q, i) => (
              <StaggerItem
                key={q.id}
                index={i}
                className="px-row"
                style={{ flexWrap: "nowrap", alignItems: "center" }}
              >
                <span className="px-meta px-num" style={{ width: 20 }}>
                  {i + 1}
                </span>
                <TextInput
                  aria-label={`Question ${i + 1}`}
                  value={q.label}
                  disabled={!canEdit}
                  onChange={(e) => editQ(i, { label: e.target.value })}
                  style={{ flex: 1 }}
                />
                <Select
                  aria-label="Answer type"
                  value={q.type}
                  disabled={!canEdit}
                  onChange={(e) =>
                    editQ(i, { type: e.target.value as ExitQuestion["type"] })
                  }
                  style={{ width: 120 }}
                >
                  <option value="rating">Rating</option>
                  <option value="boolean">Yes / No</option>
                  <option value="text">Text</option>
                </Select>
                <label className={inlineCheckClass}>
                  <Switch
                    label="Required"
                    checked={q.required}
                    disabled={!canEdit}
                    onChange={(v) => editQ(i, { required: v })}
                  />
                  <span className="px-meta">Required</span>
                </label>
                {canEdit && (
                  <IconButton
                    icon="trash"
                    label={`Remove question ${i + 1}`}
                    onClick={() => {
                      setQuestions((qs) => qs.filter((_, j) => j !== i));
                      setQDirty(true);
                    }}
                  />
                )}
              </StaggerItem>
            ))}
          </StaggerList>
          {questions.length === 0 && (
            <p className="px-tertiary px-callout">No questions yet.</p>
          )}
        </section>
      )}
    </Page>
  );
}

// ── Payroll setup ───────────────────────────────────────────────────────────

export function PayrollSetupPage() {
  const canEdit = useCanEditOrgSettings();
  const [view, setView] = useState("components");
  const [data, setData] = useState<{
    components: SalaryComponent[];
    slabs: PtSlab[];
    cycles: PayCycle[];
    tax: IncomeTaxSlab[];
  } | null>(null);
  const load = useCallback(async () => {
    const [c, p, y, t] = await Promise.all([
      apiClient.get(API_ENDPOINTS.LIST_SALARY_COMPONENTS),
      apiClient.get(API_ENDPOINTS.LIST_PT_SLABS),
      apiClient.get(API_ENDPOINTS.LIST_PAY_CYCLES),
      apiClient.get(API_ENDPOINTS.LIST_TDS_SLABS),
    ]);
    setData({
      components: asList(c.data?.data),
      slabs: asList(p.data?.data),
      cycles: asList(y.data?.data),
      tax: asList(t.data?.data),
    });
  }, []);
  useEffect(() => {
    load().catch(() =>
      setData({ components: [], slabs: [], cycles: [], tax: [] }),
    );
  }, [load]);

  return (
    <Page
      title="Payroll Setup"
      width="wide"
      tabs={
        <SegmentedControl
          label="Payroll setup areas"
          value={view}
          onChange={setView}
          segments={[
            {
              value: "components",
              label: "Salary Components",
              count: data?.components.length,
            },
            {
              value: "pt",
              label: "Professional Tax",
              count: data?.slabs.length,
            },
            {
              value: "cycles",
              label: "Pay Cycles",
              count: data?.cycles.length,
            },
            { value: "tax", label: "Income Tax", count: data?.tax.length },
          ]}
        />
      }
    >
      {!data ? (
        <div style={{ display: "grid", gap: 14 }}>
          <TextSkeleton lines={2} lastWidth="40%" />
          <TableSkeleton rows={4} columns={3} />
        </div>
      ) : view === "components" ? (
        <CrudSection<SalaryComponent, typeof EMPTY_COMPONENT_FORM>
          title="Salary Components"
          detail="Earnings and deductions that make up a salary structure"
          noun="Component"
          items={[...data.components].sort(
            (a, b) => a.displayOrder - b.displayOrder,
          )}
          canEdit={canEdit}
          onRefetch={load}
          columns={[
            {
              key: "name",
              header: "Component",
              priority: "primary",
              render: (c) => (
                <span className="px-headline">
                  {c.name} <span className="px-meta">{c.code}</span>
                </span>
              ),
            },
            {
              key: "type",
              header: "Type",
              priority: "secondary",
              render: (c) => (
                <StatusBadge
                  tone={c.type === "earning" ? "success" : "warning"}
                  plain
                >
                  {c.type === "earning" ? "Earning" : "Deduction"}
                </StatusBadge>
              ),
            },
            {
              key: "calc",
              header: "Calculated As",
              priority: "secondary",
              render: (c) =>
                c.calcType === "percent_of_basic"
                  ? `${c.percentValue}% of Basic`
                  : c.calcType === "formula"
                    ? "Statutory formula"
                    : "Fixed amount",
            },
            {
              key: "tax",
              header: "Taxable",
              priority: "hidden",
              render: (c) => (c.isTaxable ? "Yes" : "No"),
            },
          ]}
          crud={{
            emptyForm: EMPTY_COMPONENT_FORM,
            toForm: (c) => ({
              name: c.name,
              code: c.code,
              type: c.type,
              isTaxable: c.isTaxable,
              calcType: c.calcType,
              percentValue: c.percentValue ?? 0,
              isRecurring: c.isRecurring ?? true,
              displayOrder: c.displayOrder,
            }),
            getId: (c) => c.id,
            create: (b) =>
              apiClient.post(API_ENDPOINTS.CREATE_SALARY_COMPONENT, b),
            update: (id, b) =>
              apiClient.put(API_ENDPOINTS.UPDATE_SALARY_COMPONENT(id), b),
            remove: (id) =>
              apiClient.delete(API_ENDPOINTS.DELETE_SALARY_COMPONENT(id)),
          }}
          form={(f, set) => (
            <FormGrid columns={2}>
              <Field label="Name">
                <TextInput
                  data-autofocus
                  value={f.name}
                  onChange={(e) => set({ name: e.target.value })}
                  placeholder="Special Allowance"
                />
              </Field>
              <Field label="Code">
                <TextInput
                  value={f.code}
                  onChange={(e) => set({ code: e.target.value.toUpperCase() })}
                  placeholder="SPECIAL"
                />
              </Field>
              <Field label="Type">
                <Select
                  value={f.type}
                  onChange={(e) =>
                    set({ type: e.target.value as "earning" | "deduction" })
                  }
                >
                  <option value="earning">Earning</option>
                  <option value="deduction">Deduction</option>
                </Select>
              </Field>
              <Field label="Calculated As">
                <Select
                  value={f.calcType}
                  onChange={(e) =>
                    set({ calcType: e.target.value as typeof f.calcType })
                  }
                >
                  <option value="fixed">Fixed amount</option>
                  <option value="percent_of_basic">Percent of Basic</option>
                </Select>
              </Field>
              {f.calcType === "percent_of_basic" && (
                <Field label="Percent of Basic">
                  <TextInput
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={f.percentValue}
                    onChange={(e) => set({ percentValue: num(e.target.value) })}
                  />
                </Field>
              )}
              <Field label="Display Order">
                <TextInput
                  type="number"
                  min={0}
                  value={f.displayOrder}
                  onChange={(e) => set({ displayOrder: num(e.target.value) })}
                />
              </Field>
              <label className={`${inlineCheckClass} ${fieldSpan2}`}>
                <Switch
                  label="Taxable"
                  checked={f.isTaxable}
                  onChange={(v) => set({ isTaxable: v })}
                />
                Taxable
              </label>
              <label className={`${inlineCheckClass} ${fieldSpan2}`}>
                <Switch
                  label="Recurring"
                  checked={f.isRecurring}
                  onChange={(v) => set({ isRecurring: v })}
                />
                Paid every month
              </label>
            </FormGrid>
          )}
        />
      ) : view === "pt" ? (
        <CrudSection<PtSlab, typeof EMPTY_SLAB_FORM>
          title="Professional Tax"
          detail="Monthly tax by state and gross salary"
          noun="Slab"
          items={data.slabs}
          canEdit={canEdit}
          onRefetch={load}
          columns={[
            {
              key: "state",
              header: "State",
              priority: "primary",
              render: (sl) => <span className="px-headline">{sl.state}</span>,
            },
            {
              key: "range",
              header: "Monthly Gross",
              priority: "secondary",
              render: (sl) =>
                `${fmtMoney(sl.minGross)} – ${sl.maxGross != null ? fmtMoney(sl.maxGross) : "and above"}`,
            },
            {
              key: "pt",
              header: "Tax",
              align: "right",
              priority: "trailing",
              render: (sl) => fmtMoney(sl.monthlyPT),
            },
          ]}
          crud={{
            emptyForm: EMPTY_SLAB_FORM,
            toForm: (sl) => ({
              state: sl.state,
              minGross: sl.minGross,
              maxGross: sl.maxGross ?? "",
              monthlyPT: sl.monthlyPT,
            }),
            buildPayload: (f) => ({
              state: f.state,
              minGross: f.minGross,
              maxGross: f.maxGross === "" ? undefined : Number(f.maxGross),
              monthlyPT: f.monthlyPT,
            }),
            getId: (sl) => sl.id,
            create: (b) => apiClient.post(API_ENDPOINTS.CREATE_PT_SLAB, b),
            update: (id, b) =>
              apiClient.put(API_ENDPOINTS.UPDATE_PT_SLAB(id), b),
            remove: (id) => apiClient.delete(API_ENDPOINTS.DELETE_PT_SLAB(id)),
          }}
          form={(f, set) => (
            <FormGrid columns={2}>
              <Field label="State" className={fieldSpan2}>
                <Select
                  data-autofocus
                  value={f.state}
                  onChange={(e) => set({ state: e.target.value })}
                >
                  <option value="">Choose…</option>
                  {states.map((st: string) => (
                    <option key={st}>{st}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Gross From (₹)">
                <TextInput
                  type="number"
                  min={0}
                  value={f.minGross}
                  onChange={(e) => set({ minGross: num(e.target.value) })}
                />
              </Field>
              <Field
                label="Gross To (₹)"
                optional
                hint="Blank means no upper limit"
              >
                <TextInput
                  type="number"
                  min={0}
                  value={f.maxGross}
                  onChange={(e) =>
                    set({
                      maxGross:
                        e.target.value === "" ? "" : Number(e.target.value),
                    })
                  }
                />
              </Field>
              <Field label="Monthly Tax (₹)">
                <TextInput
                  type="number"
                  min={0}
                  value={f.monthlyPT}
                  onChange={(e) => set({ monthlyPT: num(e.target.value) })}
                />
              </Field>
            </FormGrid>
          )}
        />
      ) : view === "cycles" ? (
        <CrudSection<PayCycle, typeof EMPTY_CYCLE_FORM>
          title="Pay Cycles"
          noun="Pay Cycle"
          items={data.cycles}
          canEdit={canEdit}
          onRefetch={load}
          columns={[
            {
              key: "name",
              header: "Cycle",
              priority: "primary",
              render: (c) => (
                <span className="px-headline">
                  {c.name}
                  {c.isDefault && <span className="px-meta"> · Default</span>}
                </span>
              ),
            },
            {
              key: "freq",
              header: "Frequency",
              priority: "secondary",
              render: (c) =>
                c.frequency[0].toUpperCase() + c.frequency.slice(1),
            },
            {
              key: "day",
              header: "Pay Day",
              align: "right",
              priority: "trailing",
              render: (c) => c.payDay,
            },
          ]}
          crud={{
            emptyForm: EMPTY_CYCLE_FORM,
            toForm: (c) => ({
              name: c.name,
              frequency: c.frequency,
              payDay: c.payDay,
              isDefault: c.isDefault,
            }),
            getId: (c) => c.id,
            create: (b) => apiClient.post(API_ENDPOINTS.CREATE_PAY_CYCLE, b),
            update: (id, b) =>
              apiClient.put(API_ENDPOINTS.UPDATE_PAY_CYCLE(id), b),
            remove: (id) =>
              apiClient.delete(API_ENDPOINTS.DELETE_PAY_CYCLE(id)),
          }}
          form={(f, set) => (
            <FormGrid columns={2}>
              <Field label="Name" className={fieldSpan2}>
                <TextInput
                  data-autofocus
                  value={f.name}
                  onChange={(e) => set({ name: e.target.value })}
                  placeholder="Monthly"
                />
              </Field>
              <Field label="Frequency">
                <Select
                  value={f.frequency}
                  onChange={(e) =>
                    set({ frequency: e.target.value as PayCycle["frequency"] })
                  }
                >
                  <option value="monthly">Monthly</option>
                  <option value="biweekly">Every two weeks</option>
                  <option value="weekly">Weekly</option>
                </Select>
              </Field>
              <Field label="Pay Day" hint="Day of the month (or week)">
                <TextInput
                  type="number"
                  min={1}
                  max={31}
                  value={f.payDay}
                  onChange={(e) => set({ payDay: num(e.target.value) })}
                />
              </Field>
              <label className={`${inlineCheckClass} ${fieldSpan2}`}>
                <Switch
                  label="Default cycle"
                  checked={f.isDefault}
                  onChange={(v) => set({ isDefault: v })}
                />
                Default for new employees
              </label>
            </FormGrid>
          )}
        />
      ) : (
        <CrudSection<IncomeTaxSlab, typeof EMPTY_TAX_SLAB_FORM>
          title="Income Tax Slabs"
          detail="Used to estimate monthly TDS"
          noun="Slab"
          items={[...data.tax].sort(
            (a, b) =>
              a.financialYear.localeCompare(b.financialYear) ||
              a.regime.localeCompare(b.regime) ||
              a.minIncome - b.minIncome,
          )}
          canEdit={canEdit}
          onRefetch={load}
          columns={[
            {
              key: "fy",
              header: "Year",
              priority: "primary",
              render: (t) => (
                <span className="px-headline">
                  FY {t.financialYear} · {t.regime === "new" ? "New" : "Old"}{" "}
                  regime
                </span>
              ),
            },
            {
              key: "range",
              header: "Annual Income",
              priority: "secondary",
              render: (t) =>
                `${fmtMoney(t.minIncome)} – ${t.maxIncome != null ? fmtMoney(t.maxIncome) : "and above"}`,
            },
            {
              key: "rate",
              header: "Rate",
              align: "right",
              priority: "trailing",
              render: (t) => `${t.ratePercent}%`,
            },
          ]}
          crud={{
            emptyForm: EMPTY_TAX_SLAB_FORM,
            toForm: (t) => ({
              financialYear: t.financialYear,
              regime: t.regime,
              minIncome: t.minIncome,
              maxIncome: t.maxIncome ?? "",
              ratePercent: t.ratePercent,
            }),
            buildPayload: (f) => ({
              financialYear: f.financialYear,
              regime: f.regime,
              minIncome: f.minIncome,
              maxIncome: f.maxIncome === "" ? undefined : Number(f.maxIncome),
              ratePercent: f.ratePercent,
            }),
            getId: (t) => t.id,
            create: (b) => apiClient.post(API_ENDPOINTS.CREATE_TDS_SLAB, b),
            update: (id, b) =>
              apiClient.put(API_ENDPOINTS.UPDATE_TDS_SLAB(id), b),
            remove: (id) => apiClient.delete(API_ENDPOINTS.DELETE_TDS_SLAB(id)),
          }}
          form={(f, set) => (
            <FormGrid columns={2}>
              <Field label="Financial Year" hint="e.g. 2026-27">
                <TextInput
                  data-autofocus
                  value={f.financialYear}
                  onChange={(e) => set({ financialYear: e.target.value })}
                />
              </Field>
              <Field label="Regime">
                <Select
                  value={f.regime}
                  onChange={(e) =>
                    set({ regime: e.target.value as "old" | "new" })
                  }
                >
                  <option value="new">New regime</option>
                  <option value="old">Old regime</option>
                </Select>
              </Field>
              <Field label="Income From (₹)">
                <TextInput
                  type="number"
                  min={0}
                  value={f.minIncome}
                  onChange={(e) => set({ minIncome: num(e.target.value) })}
                />
              </Field>
              <Field
                label="Income To (₹)"
                optional
                hint="Blank means no upper limit"
              >
                <TextInput
                  type="number"
                  min={0}
                  value={f.maxIncome}
                  onChange={(e) =>
                    set({
                      maxIncome:
                        e.target.value === "" ? "" : Number(e.target.value),
                    })
                  }
                />
              </Field>
              <Field label="Rate (%)">
                <TextInput
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={f.ratePercent}
                  onChange={(e) => set({ ratePercent: num(e.target.value) })}
                />
              </Field>
            </FormGrid>
          )}
        />
      )}
    </Page>
  );
}
