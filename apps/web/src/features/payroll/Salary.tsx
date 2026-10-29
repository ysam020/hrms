import dayjs from "dayjs";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { AlertContext } from "@web/app/providers/AlertContext";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import {
  componentsArrayToValues,
  computeSalaryComponents,
  getMergedComponents,
  legacyFieldsToComponentValues,
  redistributeGross,
  type PtSlab,
  type SalaryComponentDef,
} from "@web/shared/utils/salaryCalc";
import { TransitionLink, useTransitionNavigate } from "@next/motion";
import {
  Avatar,
  Banner,
  Button,
  DataTable,
  Metric,
  Metrics,
  Page,
  Pagination,
  PrimaryCell,
  SearchField,
  Skeleton,
  TextInput,
  type Column,
  SectionsSkeleton,
} from "@next/ui";
import { apiClient, errorMessage, unwrap } from "@next/lib/api";
import { useGet } from "@next/lib/hooks";
import { searchParam, usePagedList } from "@next/lib/usePagedList";
import { fmtMoney, personName } from "@next/lib/format";
import s from "./salary.module.css";

// Salary management. The list is the employee directory (GET /view-all-kycs,
// as in Classic); each person's structure uses Classic's shared salaryCalc
// (tenant components, derived PF/ESI/PT, gross redistribution, attendance
// proration) and GET/POST salary endpoints. Only the load/save sequencing
// below mirrors Classic's EditSalaryStructure component.

export function SalaryManagementPage() {
  const navigate = useTransitionNavigate();
  const list = usePagedList(
    (p, l, q) => `${API_ENDPOINTS.VIEW_ALL_KYCS(p, l)}${searchParam(q)}`,
    { listKeys: ["kycs"] },
  );
  const columns: Column<any>[] = [
    {
      key: "who",
      header: "Employee",
      priority: "primary",
      render: (r) => (
        <PrimaryCell
          leading={<Avatar name={personName(r)} size={28} />}
          title={personName(r)}
          subtitle={r.username}
        />
      ),
    },
    {
      key: "dept",
      header: "Department",
      priority: "secondary",
      render: (r) => r.department || "—",
    },
    {
      key: "desig",
      header: "Designation",
      priority: "secondary",
      render: (r) => r.designation || "—",
    },
  ];
  return (
    <Page
      title="Salary Management"
      tabs={
        <SearchField
          label="Search employees"
          value={list.query}
          onChange={(e) => list.search(e.target.value)}
          toolbarWidth={280}
        />
      }
    >
      <DataTable
        label="Employees"
        columns={columns}
        rows={list.data}
        rowId={(r) => String(r.id ?? r.username)}
        loading={list.loading}
        onRowClick={(r) => navigate(`/payroll/salary-management/${r.id}`)}
        stickyOffset={52}
        empty={{ icon: "people", title: "No employees match" }}
        footer={<Pagination {...list.pageProps} />}
      />
    </Page>
  );
}

const sum = (
  components: SalaryComponentDef[],
  values: Record<string, number>,
) => {
  let earnings = 0;
  let deductions = 0;
  for (const c of components) {
    const amt = values[c.code] ?? 0;
    if (c.type === "earning") earnings += amt;
    else deductions += amt;
  }
  return {
    earnings: +earnings.toFixed(2),
    net: +(earnings - deductions).toFixed(2),
  };
};

export function SalaryStructurePage() {
  const { userId = "" } = useParams();
  const { setAlert } = useContext(AlertContext);
  const person = useGet<any>(`/get-user-data/${encodeURIComponent(userId)}`);
  // Default to last month (the most recent month that can be paid).
  const [month, setMonth] = useState(() =>
    dayjs().subtract(1, "month").format("YYYY-MM"),
  );
  const [defs, setDefs] = useState<SalaryComponentDef[]>([]);
  const [ptSlabs, setPtSlabs] = useState<PtSlab[]>([]);
  const [values, setValues] = useState<Record<string, number> | null>(null);
  const [source, setSource] = useState<"saved" | "prorated" | "none">("none");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<{
    gross: number;
    components: Record<string, number>;
  }>({ gross: 0, components: {} });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const u = person.data && !person.data.message ? person.data : null;
  const baseGross = parseFloat(u?.salary) || 0;
  const workState = u?.workState ?? null;
  const merged = useMemo(() => getMergedComponents(defs), [defs]);

  useEffect(() => {
    Promise.all([
      apiClient.get(API_ENDPOINTS.LIST_SALARY_COMPONENTS),
      apiClient.get(API_ENDPOINTS.LIST_PT_SLABS),
    ])
      .then(([c, p]) => {
        setDefs(c.data?.data ?? []);
        setPtSlabs(p.data?.data ?? []);
      })
      .catch(() =>
        setAlert({
          open: true,
          message: "Salary components couldn’t be loaded.",
          severity: "error",
        }),
      );
  }, [setAlert]);

  // Saved structure for the month if there is one, else a proration of the
  // employee's gross by paid days (same formula as Classic).
  const loadMonth = useCallback(async (): Promise<{
    values: Record<string, number> | null;
    source: "saved" | "prorated" | "none";
  }> => {
    const [y, m] = month.split("-").map(Number);
    try {
      const saved = unwrap<any>(
        await apiClient.get(API_ENDPOINTS.GET_USER_SALARY(userId, y, m)),
      );
      if (saved && (saved.basicPay !== undefined || saved.salaryStructure)) {
        const raw = saved.salaryStructure || saved;
        return {
          values: raw.components?.length
            ? componentsArrayToValues(raw.components)
            : legacyFieldsToComponentValues(raw),
          source: "saved",
        };
      }
    } catch {
      /* no saved structure for this month */
    }
    if (!baseGross) return { values: null, source: "none" };
    try {
      const a =
        unwrap<any>(
          await apiClient.get(
            API_ENDPOINTS.GET_ATTENDANCE_SUMMARY(userId, y, m),
          ),
        ) || {};
      const days = new Date(y, m, 0).getDate();
      const paid =
        (a.presents || 0) +
        (a.late || 0) +
        0.5 * (a.halfDays || 0) +
        (a.holidays || 0) +
        (a.weekOffs || 0) +
        (a.wfh || 0) +
        (a.paidLeaves || 0);
      const gross = +((baseGross / days) * paid).toFixed(2);
      const basic = +(gross * 0.5).toFixed(2);
      const { values: derived } = computeSalaryComponents({
        basicPay: basic,
        grossSalary: gross,
        components: merged,
        ptSlabs,
        workState,
      });
      return {
        values: { BASIC: basic, HRA: 0, CONVEYANCE: 0, ...derived },
        source: "prorated",
      };
    } catch {
      return { values: null, source: "none" };
    }
  }, [month, userId, baseGross, merged, ptSlabs, workState]);

  useEffect(() => {
    if (!u || defs.length === 0) return;
    let live = true;
    setLoading(true);
    setEditing(false);
    loadMonth().then((r) => {
      if (!live) return;
      setValues(r.values);
      setSource(r.source);
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [loadMonth, u, defs.length]);

  const { locked } = computeSalaryComponents({
    basicPay: draft.components.BASIC ?? 0,
    grossSalary: draft.gross,
    components: merged,
    ptSlabs,
    workState,
  });

  // While editing, PF/ESI/PT (and percent-of-basic components) follow Basic.
  useEffect(() => {
    if (!editing) return;
    const { values: derived } = computeSalaryComponents({
      basicPay: draft.components.BASIC ?? 0,
      grossSalary: draft.gross,
      components: merged,
      ptSlabs,
      workState,
    });
    if (Object.entries(derived).some(([k, v]) => draft.components[k] !== v)) {
      setDraft((d) => ({ ...d, components: { ...d.components, ...derived } }));
    }
  }, [editing, draft.components, draft.gross, merged, ptSlabs, workState]);

  const startEdit = () => {
    const v = values ?? {};
    setDraft({ gross: sum(merged, v).earnings, components: { ...v } });
    setEditing(true);
  };
  const setGross = (g: number) =>
    setDraft((d) => ({
      gross: g,
      components: redistributeGross(g, merged, d.components, locked),
    }));
  const setAmount = (code: string, amount: number) =>
    setDraft((d) => ({
      ...d,
      components: { ...d.components, [code]: amount },
    }));

  const save = async () => {
    const [year, mo] = month.split("-");
    const components = merged.map((c) => ({
      code: c.code,
      name: c.name,
      type: c.type,
      amount: draft.components[c.code] ?? 0,
    }));
    setSaving(true);
    try {
      const res = await apiClient.post(API_ENDPOINTS.UPDATE_SALARY, {
        userId,
        year,
        month: mo,
        salaryStructure: { components },
      });
      setAlert({
        open: true,
        message: res.data?.message || "Salary saved.",
        severity: "success",
      });
      setValues(componentsArrayToValues(components));
      setSource("saved");
      setEditing(false);
    } catch (err) {
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    } finally {
      setSaving(false);
    }
  };

  const shown = editing ? draft.components : (values ?? {});
  const totals = sum(merged, shown);
  const earnings = merged.filter((c) => c.type === "earning");
  const deductions = merged.filter((c) => c.type !== "earning");
  const row = (c: SalaryComponentDef) => (
    <li key={c.code} className={s.row}>
      <span>
        {c.name}
        {editing && locked.has(c.code) && (
          <span className="px-meta"> · calculated</span>
        )}
      </span>
      {editing && !locked.has(c.code) ? (
        <TextInput
          type="number"
          inputMode="decimal"
          min={0}
          aria-label={c.name}
          className={s.amount}
          value={draft.components[c.code] ?? 0}
          onChange={(e) => setAmount(c.code, Number(e.target.value) || 0)}
        />
      ) : (
        <span className="px-num">{fmtMoney(shown[c.code] ?? 0)}</span>
      )}
    </li>
  );

  return (
    <Page
      title={u ? personName(u) : "Salary Structure"}
      subtitle="Salary structure"
      back={{ to: "/payroll/salary-management", label: "Salary Management" }}
      width="wide"
      actions={
        editing ? (
          <>
            <Button
              icon="x"
              onClick={() => setEditing(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button variant="primary" icon="check" onClick={save} busy={saving}>
              Save Structure
            </Button>
          </>
        ) : (
          <Button icon="edit" onClick={startEdit} disabled={loading || !u}>
            Edit
          </Button>
        )
      }
      tabs={
        <TextInput
          type="month"
          aria-label="Month"
          value={month}
          max={dayjs().subtract(1, "month").format("YYYY-MM")}
          onChange={(e) => setMonth(e.target.value)}
          disabled={editing}
          style={{ width: 180 }}
        />
      }
    >
      {person.loading || (loading && !values) ? (
        <SectionsSkeleton sections={2} fields={4} toggles={0} />
      ) : (
        <div style={{ display: "grid", gap: 28 }}>
          {source === "prorated" && !editing && (
            <Banner tone="accent">
              No structure is saved for {dayjs(month).format("MMMM YYYY")}.
              These amounts are prorated from attendance — edit and save to
              confirm them.
            </Banner>
          )}
          {source === "none" && !editing && (
            <Banner tone="warning">
              No salary is set for this employee yet. Edit to create a
              structure.
            </Banner>
          )}
          <Metrics label="Totals">
            {editing ? (
              <Metric
                label="Monthly Gross"
                value={
                  <TextInput
                    type="number"
                    inputMode="decimal"
                    min={0}
                    aria-label="Monthly gross"
                    value={draft.gross}
                    onChange={(e) => setGross(Number(e.target.value) || 0)}
                    style={{ width: 160, font: "var(--px-type-metric-sm)" }}
                  />
                }
              />
            ) : (
              <Metric
                label="Gross Earnings"
                value={fmtMoney(totals.earnings)}
              />
            )}
            <Metric
              label="Deductions"
              value={fmtMoney(totals.earnings - totals.net)}
            />
            <Metric label="Net Pay" value={fmtMoney(totals.net)} />
          </Metrics>
          <div className={s.columns}>
            <section>
              <h2 className="px-section">Earnings</h2>
              <ul className={s.list}>{earnings.map(row)}</ul>
            </section>
            <section>
              <h2 className="px-section">Deductions</h2>
              <ul className={s.list}>{deductions.map(row)}</ul>
            </section>
          </div>
          {editing && (
            <p className="px-meta">
              Changing the gross rescales earnings in proportion. PF, ESI, and
              professional tax follow Basic automatically ({" "}
              <TransitionLink to="/settings/payroll">
                Payroll Setup
              </TransitionLink>{" "}
              defines the components).
            </p>
          )}
        </div>
      )}
    </Page>
  );
}
