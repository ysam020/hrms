import { useContext, useState } from "react";
import { AlertContext } from "@web/app/providers/AlertContext";
import { Collapse } from "@next/motion";
import {
  Button,
  DataTable,
  Dialog,
  Field,
  FormGrid,
  Select,
  Switch,
  TextInput,
  fieldSpan2,
  inlineCheckClass,
  type Column,
} from "@next/ui";
import {
  SettingsGroup,
  NumberInput,
  OrgSettingsPage,
  SettingRow,
  useOrgSettings,
  type Snapshot,
} from "./shared";
import s from "./settings.module.css";

// Organisation policy pages — each edits part of the same versioned
// /tenant-settings snapshot (Classic's OrgSettings sub-tabs).

// ── Leave ───────────────────────────────────────────────────────────────────

type LeavePolicy = {
  key: string;
  name: string;
  daysPerYear: number;
  isStatutory: boolean;
  requiresProof: boolean;
  accrualMethod: "lump_sum" | "monthly";
  prorateByJoinDate: boolean;
  carryForward: {
    enabled: boolean;
    maxDays: number | null;
    expiryMonths: number | null;
  };
  encashment: {
    enabled: boolean;
    ratePerDay: number | null;
    maxDaysPerYear: number | null;
  };
  isCompOff: boolean;
  compOffExpiryDays: number | null;
  onExhaustion: "reject" | "auto_lop" | "manager_override";
};
// Same defaults as Classic's EMPTY_LEAVE_POLICY.
const EMPTY_POLICY: LeavePolicy = {
  key: "",
  name: "",
  daysPerYear: 0,
  isStatutory: false,
  requiresProof: false,
  accrualMethod: "lump_sum",
  prorateByJoinDate: true,
  carryForward: { enabled: false, maxDays: null, expiryMonths: null },
  encashment: { enabled: false, ratePerDay: null, maxDaysPerYear: null },
  isCompOff: false,
  compOffExpiryDays: 90,
  onExhaustion: "manager_override",
};
const EXHAUSTION = {
  reject: "Reject the request",
  auto_lop: "Convert to loss of pay",
  manager_override: "Let the approver decide",
};

export function LeavePolicyPage() {
  const org = useOrgSettings();
  const [editing, setEditing] = useState<{
    index: number | null;
    policy: LeavePolicy;
  } | null>(null);
  return (
    <OrgSettingsPage title="Leave Policy" org={org}>
      {(d, ro) => {
        const policies: LeavePolicy[] = d.leavePolicies ?? [];
        const columns: Column<LeavePolicy>[] = [
          {
            key: "name",
            header: "Leave Type",
            priority: "primary",
            render: (p) => (
              <span className="px-headline">{p.name || p.key}</span>
            ),
          },
          {
            key: "days",
            header: "Days / Year",
            align: "right",
            priority: "secondary",
            stackLabel: "Days",
            render: (p) => p.daysPerYear,
          },
          {
            key: "accrual",
            header: "Accrual",
            priority: "secondary",
            render: (p) =>
              p.accrualMethod === "monthly" ? "Monthly" : "Up front",
          },
          {
            key: "cf",
            header: "Carry Forward",
            priority: "hidden",
            render: (p) =>
              p.carryForward?.enabled
                ? `Up to ${p.carryForward.maxDays ?? "∞"}`
                : "No",
          },
          ...(!ro
            ? [
                {
                  key: "act",
                  header: <span className="px-sr-only">Actions</span>,
                  align: "right" as const,
                  priority: "trailing" as const,
                  render: (p: LeavePolicy) => {
                    const i = policies.indexOf(p);
                    return (
                      <span
                        className="px-row"
                        style={{
                          justifyContent: "flex-end",
                          flexWrap: "nowrap",
                        }}
                      >
                        <Button
                          size="small"
                          variant="plain"
                          onClick={() =>
                            setEditing({ index: i, policy: structuredClone(p) })
                          }
                        >
                          Edit
                        </Button>
                        {!p.isStatutory && (
                          <Button
                            size="small"
                            variant="plain"
                            onClick={() =>
                              org.change({
                                leavePolicies: policies.filter(
                                  (_, j) => j !== i,
                                ),
                              })
                            }
                          >
                            Remove
                          </Button>
                        )}
                      </span>
                    );
                  },
                },
              ]
            : []),
        ];
        return (
          <>
            <SettingsGroup title="Statutory Entitlement">
              <div>
                <SettingRow label="Paid leave" help="Days per year">
                  <NumberInput
                    label="Paid leave days"
                    min={0}
                    value={d.paidLeavesPerYear}
                    disabled={ro}
                    onChange={(v) => org.change({ paidLeavesPerYear: v })}
                    unit="days"
                  />
                </SettingRow>
                <SettingRow label="Sick leave" help="Days per year">
                  <NumberInput
                    label="Sick leave days"
                    min={0}
                    value={d.sickLeavesPerYear}
                    disabled={ro}
                    onChange={(v) => org.change({ sickLeavesPerYear: v })}
                    unit="days"
                  />
                </SettingRow>
                <SettingRow label="Casual leave" help="Days per year">
                  <NumberInput
                    label="Casual leave days"
                    min={0}
                    value={d.casualLeavesPerYear}
                    disabled={ro}
                    onChange={(v) => org.change({ casualLeavesPerYear: v })}
                    unit="days"
                  />
                </SettingRow>
                <SettingRow
                  label="Medical certificate for sick leave"
                  help="Require proof when sick leave is applied for"
                >
                  <Switch
                    label="Require medical certificate"
                    checked={d.medicalCertRequired}
                    disabled={ro}
                    onChange={(v) => org.change({ medicalCertRequired: v })}
                  />
                </SettingRow>
              </div>
            </SettingsGroup>
            <SettingsGroup
              title="Leave Types"
              detail="Accrual, carry forward, encashment, and comp off"
              action={
                !ro && (
                  <Button
                    size="small"
                    icon="plus"
                    onClick={() =>
                      setEditing({
                        index: null,
                        policy: structuredClone(EMPTY_POLICY),
                      })
                    }
                  >
                    Add Leave Type
                  </Button>
                )
              }
            >
              <DataTable
                label="Leave types"
                columns={columns}
                rows={policies}
                rowId={(p) => p.key || p.name}
                empty={{
                  icon: "leave",
                  title: "No custom leave types",
                  body: "Statutory paid, sick, and casual leave apply.",
                }}
              />
            </SettingsGroup>
            <LeaveTypeDialog
              value={editing?.policy ?? null}
              onClose={() => setEditing(null)}
              existingKeys={policies
                .filter((_, i) => i !== editing?.index)
                .map((p) => p.key)}
              onSave={(p) => {
                const next = [...policies];
                if (editing?.index == null) next.push(p);
                else next[editing.index] = p;
                org.change({ leavePolicies: next });
                setEditing(null);
              }}
            />
          </>
        );
      }}
    </OrgSettingsPage>
  );
}

function LeaveTypeDialog({
  value,
  onClose,
  onSave,
  existingKeys,
}: {
  value: LeavePolicy | null;
  onClose: () => void;
  onSave: (p: LeavePolicy) => void;
  existingKeys: string[];
}) {
  const { setAlert } = useContext(AlertContext);
  const [p, setP] = useState<LeavePolicy>(EMPTY_POLICY);
  const [shown, setShown] = useState<LeavePolicy | null>(null);
  if (value !== shown) {
    setShown(value);
    if (value) setP(value);
  }
  const set = (patch: Partial<LeavePolicy>) =>
    setP((x) => ({ ...x, ...patch }));
  const save = () => {
    const key = (p.key || p.name)
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_");
    if (!p.name.trim())
      return setAlert({
        open: true,
        message: "Name the leave type.",
        severity: "warning",
      });
    if (existingKeys.includes(key))
      return setAlert({
        open: true,
        message: "A leave type with this code already exists.",
        severity: "warning",
      });
    onSave({ ...p, name: p.name.trim(), key });
  };
  return (
    <Dialog
      open={Boolean(value)}
      onClose={onClose}
      size="lg"
      title={value?.key ? `Edit ${value.name}` : "Add Leave Type"}
      description="Applies once you save the leave policy."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save}>
            Done
          </Button>
        </>
      }
    >
      <FormGrid columns={2}>
        <Field label="Name">
          <TextInput
            data-autofocus
            value={p.name}
            disabled={p.isStatutory}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="Marriage Leave"
          />
        </Field>
        <Field
          label="Code"
          hint="Shown on applications. Generated from the name if blank."
        >
          <TextInput
            value={p.key}
            disabled={Boolean(value?.key)}
            onChange={(e) => set({ key: e.target.value.toUpperCase() })}
            placeholder="ML"
          />
        </Field>
        <Field label="Days per Year">
          <TextInput
            type="number"
            min={0}
            inputMode="numeric"
            value={p.daysPerYear}
            onChange={(e) => set({ daysPerYear: Number(e.target.value) || 0 })}
          />
        </Field>
        <Field label="Accrual">
          <Select
            value={p.accrualMethod}
            onChange={(e) =>
              set({
                accrualMethod: e.target.value as LeavePolicy["accrualMethod"],
              })
            }
          >
            <option value="lump_sum">All at the start of the year</option>
            <option value="monthly">Monthly</option>
          </Select>
        </Field>
        <Field label="When the balance runs out" className={fieldSpan2}>
          <Select
            value={p.onExhaustion}
            onChange={(e) =>
              set({
                onExhaustion: e.target.value as LeavePolicy["onExhaustion"],
              })
            }
          >
            {Object.entries(EXHAUSTION).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <label className={`${inlineCheckClass} ${fieldSpan2}`}>
          <Switch
            label="Prorate by joining date"
            checked={p.prorateByJoinDate}
            onChange={(v) => set({ prorateByJoinDate: v })}
          />
          Prorate for people who join mid-year
        </label>
        <label className={`${inlineCheckClass} ${fieldSpan2}`}>
          <Switch
            label="Requires proof"
            checked={p.requiresProof}
            onChange={(v) => set({ requiresProof: v })}
          />
          Requires a supporting document
        </label>
        <label className={`${inlineCheckClass} ${fieldSpan2}`}>
          <Switch
            label="Carry forward"
            checked={p.carryForward.enabled}
            onChange={(v) =>
              set({ carryForward: { ...p.carryForward, enabled: v } })
            }
          />
          Unused days carry forward
        </label>
        <div className={fieldSpan2}>
          <Collapse open={p.carryForward.enabled}>
            <FormGrid columns={2}>
              <Field label="Maximum Days" optional>
                <TextInput
                  type="number"
                  min={0}
                  value={p.carryForward.maxDays ?? ""}
                  onChange={(e) =>
                    set({
                      carryForward: {
                        ...p.carryForward,
                        maxDays:
                          e.target.value === "" ? null : Number(e.target.value),
                      },
                    })
                  }
                />
              </Field>
              <Field label="Expire After (Months)" optional>
                <TextInput
                  type="number"
                  min={0}
                  value={p.carryForward.expiryMonths ?? ""}
                  onChange={(e) =>
                    set({
                      carryForward: {
                        ...p.carryForward,
                        expiryMonths:
                          e.target.value === "" ? null : Number(e.target.value),
                      },
                    })
                  }
                />
              </Field>
            </FormGrid>
          </Collapse>
        </div>
        <label className={`${inlineCheckClass} ${fieldSpan2}`}>
          <Switch
            label="Encashment"
            checked={p.encashment.enabled}
            onChange={(v) =>
              set({ encashment: { ...p.encashment, enabled: v } })
            }
          />
          Unused days can be encashed
        </label>
        <div className={fieldSpan2}>
          <Collapse open={p.encashment.enabled}>
            <FormGrid columns={2}>
              <Field
                label="Rate per Day (₹)"
                optional
                hint="Blank uses daily salary"
              >
                <TextInput
                  type="number"
                  min={0}
                  value={p.encashment.ratePerDay ?? ""}
                  onChange={(e) =>
                    set({
                      encashment: {
                        ...p.encashment,
                        ratePerDay:
                          e.target.value === "" ? null : Number(e.target.value),
                      },
                    })
                  }
                />
              </Field>
              <Field label="Max Days per Year" optional>
                <TextInput
                  type="number"
                  min={0}
                  value={p.encashment.maxDaysPerYear ?? ""}
                  onChange={(e) =>
                    set({
                      encashment: {
                        ...p.encashment,
                        maxDaysPerYear:
                          e.target.value === "" ? null : Number(e.target.value),
                      },
                    })
                  }
                />
              </Field>
            </FormGrid>
          </Collapse>
        </div>
        <label className={`${inlineCheckClass} ${fieldSpan2}`}>
          <Switch
            label="Comp off"
            checked={p.isCompOff}
            onChange={(v) => set({ isCompOff: v })}
          />
          Earned as compensatory off (for extra days worked)
        </label>
        <div className={fieldSpan2}>
          <Collapse open={p.isCompOff}>
            <Field label="Expires After (Days)">
              <TextInput
                type="number"
                min={1}
                value={p.compOffExpiryDays ?? ""}
                onChange={(e) =>
                  set({
                    compOffExpiryDays:
                      e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </Field>
          </Collapse>
        </div>
      </FormGrid>
    </Dialog>
  );
}

// ── Attendance ──────────────────────────────────────────────────────────────

export function AttendanceRulesPage() {
  const org = useOrgSettings();
  const { setAlert } = useContext(AlertContext);
  const locate = () =>
    navigator.geolocation.getCurrentPosition(
      (p) =>
        org.change({
          officeLatitude: +p.coords.latitude.toFixed(6),
          officeLongitude: +p.coords.longitude.toFixed(6),
        }),
      () =>
        setAlert({
          open: true,
          message: "Location access was denied.",
          severity: "error",
        }),
      { timeout: 10000 },
    );
  return (
    <OrgSettingsPage title="Attendance Rules" org={org}>
      {(d: Snapshot, ro) => {
        const lateAfter =
          d.workStartHour * 60 + d.workStartMinute + d.lateGracePeriodMinutes;
        return (
          <>
            <SettingsGroup title="Working Day">
              <div>
                <SettingRow
                  label="Workday starts"
                  help={`Late after ${String(Math.floor(lateAfter / 60) % 24).padStart(2, "0")}:${String(lateAfter % 60).padStart(2, "0")}`}
                >
                  <TextInput
                    type="time"
                    aria-label="Workday start"
                    disabled={ro}
                    value={`${String(d.workStartHour).padStart(2, "0")}:${String(d.workStartMinute).padStart(2, "0")}`}
                    onChange={(e) => {
                      const [h, m] = e.target.value.split(":").map(Number);
                      if (!Number.isNaN(h))
                        org.change({
                          workStartHour: h,
                          workStartMinute: m || 0,
                        });
                    }}
                    style={{ width: 120 }}
                  />
                </SettingRow>
                <SettingRow label="Late grace period">
                  <NumberInput
                    label="Grace period"
                    min={0}
                    value={d.lateGracePeriodMinutes}
                    disabled={ro}
                    onChange={(v) => org.change({ lateGracePeriodMinutes: v })}
                    unit="min"
                  />
                </SettingRow>
                <SettingRow label="Full day" help="Minimum hours worked">
                  <NumberInput
                    label="Full day hours"
                    min={0.5}
                    step={0.5}
                    value={d.fullDayMinHours}
                    disabled={ro}
                    onChange={(v) => org.change({ fullDayMinHours: v })}
                    unit="hours"
                  />
                </SettingRow>
                <SettingRow label="Half day" help="Minimum hours worked">
                  <NumberInput
                    label="Half day hours"
                    min={0.5}
                    step={0.5}
                    value={d.halfDayMinHours}
                    disabled={ro}
                    onChange={(v) => org.change({ halfDayMinHours: v })}
                    unit="hours"
                  />
                </SettingRow>
                <SettingRow
                  label="Corrections window"
                  help="How far back people can ask to correct attendance"
                >
                  <NumberInput
                    label="Corrections window"
                    min={0}
                    value={d.regularizationBackdateWindowDays}
                    disabled={ro}
                    onChange={(v) =>
                      org.change({ regularizationBackdateWindowDays: v })
                    }
                    unit="days"
                  />
                </SettingRow>
                <SettingRow label="Overtime needs approval first">
                  <Switch
                    label="Overtime pre-approval"
                    checked={d.overtimePreApprovalRequired}
                    disabled={ro}
                    onChange={(v) =>
                      org.change({ overtimePreApprovalRequired: v })
                    }
                  />
                </SettingRow>
              </div>
            </SettingsGroup>
            <SettingsGroup title="Work From Home">
              <SettingRow
                label="Allow work-from-home requests"
                help="Turning this off hides WFH for everyone"
              >
                <Switch
                  label="WFH enabled"
                  checked={d.wfhEnabled}
                  disabled={ro}
                  onChange={(v) => org.change({ wfhEnabled: v })}
                />
              </SettingRow>
            </SettingsGroup>
            <SettingsGroup
              title="Geofencing"
              detail="Only accept punches made near the office"
            >
              <SettingRow label="Require punching in at the office">
                <Switch
                  label="Geofencing"
                  checked={d.geofencingEnabled}
                  disabled={ro}
                  onChange={(v) => org.change({ geofencingEnabled: v })}
                />
              </SettingRow>
              <Collapse open={d.geofencingEnabled}>
                <FormGrid columns={2}>
                  <Field label="Office Name" className={fieldSpan2}>
                    <TextInput
                      value={d.officeName ?? ""}
                      disabled={ro}
                      onChange={(e) =>
                        org.change({ officeName: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Latitude">
                    <TextInput
                      type="number"
                      step="any"
                      value={d.officeLatitude ?? ""}
                      disabled={ro}
                      onChange={(e) =>
                        org.change({
                          officeLatitude:
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                        })
                      }
                    />
                  </Field>
                  <Field label="Longitude">
                    <TextInput
                      type="number"
                      step="any"
                      value={d.officeLongitude ?? ""}
                      disabled={ro}
                      onChange={(e) =>
                        org.change({
                          officeLongitude:
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                        })
                      }
                    />
                  </Field>
                  <Field label="Radius" hint="Minimum 50 m">
                    <NumberInput
                      label="Radius"
                      min={50}
                      value={d.geofenceRadiusMeters}
                      disabled={ro}
                      onChange={(v) => org.change({ geofenceRadiusMeters: v })}
                      unit="metres"
                    />
                  </Field>
                  <div className="px-row" style={{ alignSelf: "end" }}>
                    {!ro && (
                      <Button icon="pin" onClick={locate}>
                        Use My Location
                      </Button>
                    )}
                    {d.officeLatitude != null && d.officeLongitude != null && (
                      <a
                        href={`https://maps.apple.com/?ll=${d.officeLatitude},${d.officeLongitude}&q=${encodeURIComponent(d.officeName ?? "Office")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Open in Maps
                      </a>
                    )}
                  </div>
                </FormGrid>
              </Collapse>
            </SettingsGroup>
          </>
        );
      }}
    </OrgSettingsPage>
  );
}

// ── HR policy ───────────────────────────────────────────────────────────────

export function HrPolicyPage() {
  const org = useOrgSettings();
  return (
    <OrgSettingsPage title="HR Policy" org={org}>
      {(d, ro) => (
        <SettingsGroup title="Employment">
          <div>
            <SettingRow label="Probation period">
              <NumberInput
                label="Probation days"
                min={0}
                value={d.probationPeriodDays}
                disabled={ro}
                onChange={(v) => org.change({ probationPeriodDays: v })}
                unit="days"
              />
            </SettingRow>
            <SettingRow
              label="Notice period"
              help="Default; Exit Policy can vary it by tenure or role"
            >
              <NumberInput
                label="Notice days"
                min={0}
                value={d.noticePeriodDays}
                disabled={ro}
                onChange={(v) => org.change({ noticePeriodDays: v })}
                unit="days"
              />
            </SettingRow>
            <SettingRow label="Interview rounds" help="Maximum per candidate">
              <NumberInput
                label="Max interview rounds"
                min={1}
                max={20}
                value={d.maxInterviewRounds}
                disabled={ro}
                onChange={(v) => org.change({ maxInterviewRounds: v })}
                unit="rounds"
              />
            </SettingRow>
          </div>
        </SettingsGroup>
      )}
    </OrgSettingsPage>
  );
}

// ── Work week ───────────────────────────────────────────────────────────────

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function WorkWeekPage() {
  const org = useOrgSettings();
  return (
    <OrgSettingsPage title="Work Week" org={org}>
      {(d, ro) => {
        const ww = d.workWeekPattern ?? {
          type: "mon_fri",
          workingDays: [1, 2, 3, 4, 5],
        };
        const setType = (type: string) =>
          org.change({
            workWeekPattern: {
              type,
              workingDays:
                type === "mon_sat"
                  ? [1, 2, 3, 4, 5, 6]
                  : type === "mon_fri"
                    ? [1, 2, 3, 4, 5]
                    : ww.workingDays,
            },
          });
        const toggle = (i: number) =>
          org.change({
            workWeekPattern: {
              type: "custom",
              workingDays: ww.workingDays.includes(i)
                ? ww.workingDays.filter((x: number) => x !== i)
                : [...ww.workingDays, i].sort(),
            },
          });
        return (
          <SettingsGroup
            title="Working Days"
            detail="Days off count as week offs in attendance and leave"
          >
            <div style={{ display: "grid", gap: 16 }}>
              <Field label="Pattern">
                <Select
                  style={{ maxWidth: 280 }}
                  value={ww.type}
                  disabled={ro}
                  onChange={(e) => setType(e.target.value)}
                >
                  <option value="mon_fri">Monday to Friday</option>
                  <option value="mon_sat">Monday to Saturday</option>
                  <option value="custom">Custom</option>
                </Select>
              </Field>
              <div className={s.days} role="group" aria-label="Working days">
                {DAYS.map((name, i) => (
                  <button
                    key={name}
                    type="button"
                    className={s.day}
                    aria-pressed={ww.workingDays.includes(i)}
                    aria-label={name}
                    disabled={ro}
                    onClick={() => toggle(i)}
                  >
                    {name[0]}
                  </button>
                ))}
              </div>
              <p className="px-meta" aria-live="polite">
                {ww.workingDays.length === 0
                  ? "No working days selected"
                  : `${ww.workingDays.length} working ${ww.workingDays.length === 1 ? "day" : "days"} a week · ${
                      DAYS.filter((_, i) => !ww.workingDays.includes(i))
                        .join(", ")
                        .replace(/, ([^,]*)$/, " and $1") || "no days"
                    } off`}
              </p>
            </div>
          </SettingsGroup>
        );
      }}
    </OrgSettingsPage>
  );
}
