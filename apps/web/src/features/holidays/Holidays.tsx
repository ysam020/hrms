import dayjs from "dayjs";
import { useContext, useMemo, useState, type FormEvent } from "react";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import hasPermission from "@web/shared/utils/permissions/hasPermission";
import { StaggerItem, StaggerList } from "@next/motion";
import {
  Button,
  Checkbox,
  ConfirmDialog,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  Page,
  PeriodStepper,
  Skeleton,
  StatTile,
  StatTiles,
  Tag,
  TextInput,
} from "@next/ui";
import { apiClient, asList, errorMessage } from "@next/lib/api";
import { useGet } from "@next/lib/hooks";
import s from "./holidays.module.css";

// Holidays: a year at a glance, grouped by month. Add/delete follow Classic's
// Holidays:add / Holidays:delete permissions and endpoints.

const MONTHS = Array.from({ length: 12 }, (_, i) =>
  dayjs().month(i).format("MMMM"),
);

export default function Holidays() {
  const { user } = useContext(UserContext);
  const { setAlert } = useContext(AlertContext);
  const [year, setYear] = useState(dayjs().year());
  const { data, loading, error, refetch } = useGet<any>(
    API_ENDPOINTS.GET_HOLIDAYS(year),
  );
  const canAdd = hasPermission(
    "Holidays",
    "add",
    "-",
    user?.isSuperUser,
    user?.permissions || [],
  );
  const canDelete = hasPermission(
    "Holidays",
    "delete",
    "-",
    user?.isSuperUser,
    user?.permissions || [],
  );
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  const holidays = useMemo(
    () =>
      asList<any>(data, "holidays")
        .slice()
        .sort((a, b) => dayjs(a.date).valueOf() - dayjs(b.date).valueOf()),
    [data],
  );
  const byMonthIndex = useMemo(() => {
    const m = new Map<number, any[]>();
    for (const h of holidays) {
      const k = dayjs(h.date).month();
      m.set(k, [...(m.get(k) || []), h]);
    }
    return m;
  }, [holidays]);
  const next = holidays.find((h) => !dayjs(h.date).isBefore(dayjs(), "day"));
  const upcoming = holidays.filter(
    (h) => !dayjs(h.date).isBefore(dayjs(), "day"),
  ).length;
  const key = (h: any) => dayjs(h.date).format("YYYY-MM-DD");

  const remove = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      if (confirm.length === 1)
        await apiClient.put(API_ENDPOINTS.DELETE_HOLIDAY, { date: confirm[0] });
      else
        await apiClient.put(API_ENDPOINTS.BULK_DELETE_HOLIDAYS, {
          dates: confirm,
        });
      setAlert({
        open: true,
        message:
          confirm.length === 1
            ? "Holiday removed."
            : `${confirm.length} holidays removed.`,
        severity: "success",
      });
      setSelected(new Set());
      setConfirm(null);
      refetch();
    } catch (err) {
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page
      title="Holidays"
      width="wide"
      description="Days the whole organisation is off. They show on everyone’s calendar and count in attendance."
      actions={
        <>
          {canDelete && selected.size > 0 && (
            <Button
              variant="tintedDanger"
              icon="trash"
              onClick={() => setConfirm([...selected])}
            >
              Delete {selected.size}
            </Button>
          )}
          {canAdd && (
            <Button
              data-tour="holidays-add"
              variant="primary"
              icon="plus"
              onClick={() => setAdding(true)}
            >
              Add Holiday
            </Button>
          )}
        </>
      }
      tabs={
        <PeriodStepper
          label={year}
          previousLabel="Previous year"
          nextLabel="Next year"
          onPrevious={() => setYear((y) => y - 1)}
          onNext={() => setYear((y) => y + 1)}
          onReset={
            year === dayjs().year() ? undefined : () => setYear(dayjs().year())
          }
          resetLabel="This Year"
        />
      }
    >
      {loading ? (
        <div style={{ display: "grid", gap: 12 }}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={40} />
          ))}
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : holidays.length === 0 ? (
        <EmptyState
          icon="flag"
          title={`No holidays for ${year}`}
          action={
            canAdd && (
              <Button onClick={() => setAdding(true)}>Add Holiday</Button>
            )
          }
        >
          Holidays you add appear on everyone’s calendar and attendance.
        </EmptyState>
      ) : (
        <>
          <StatTiles label={`${year} summary`} min={180}>
            <StatTile
              label="Holidays"
              icon="flag"
              tone="accent"
              value={holidays.length}
              note={`in ${year}`}
            />
            <StatTile
              label="Still to Come"
              icon="calendar"
              tone={upcoming ? "success" : "neutral"}
              value={upcoming}
              progress={
                holidays.length ? upcoming / holidays.length : undefined
              }
              note={
                year < dayjs().year()
                  ? "This year has passed"
                  : year > dayjs().year()
                    ? "All ahead"
                    : upcoming
                      ? `of ${holidays.length} after today`
                      : "None left this year"
              }
            />
            <StatTile
              label="Next Holiday"
              icon="sun"
              tone={next ? "warning" : "neutral"}
              value={
                <span className={s.nextValue}>
                  {next ? dayjs(next.date).format("D MMM") : "—"}
                </span>
              }
              note={
                next
                  ? `${next.name || next.title} · ${
                      dayjs(next.date).isSame(dayjs(), "day")
                        ? "today"
                        : dayjs(next.date).diff(
                              dayjs().startOf("day"),
                              "day",
                            ) === 1
                          ? "tomorrow"
                          : `in ${dayjs(next.date).diff(dayjs().startOf("day"), "day")} days`
                    }`
                  : "None scheduled"
              }
            />
          </StatTiles>
          <div className={s.months}>
            {MONTHS.map((month, mi) => {
              const items = byMonthIndex.get(mi) ?? [];
              const monthPast =
                year < dayjs().year() ||
                (year === dayjs().year() && mi < dayjs().month());
              return (
                <section
                  key={month}
                  aria-labelledby={`m-${month}`}
                  className={s.monthCard}
                  data-empty={items.length === 0 || undefined}
                  data-current={
                    (year === dayjs().year() && mi === dayjs().month()) ||
                    undefined
                  }
                  data-past={monthPast || undefined}
                >
                  <header className={s.monthHeader}>
                    <h2 id={`m-${month}`} className={s.month}>
                      {month}
                    </h2>
                    {items.length > 0 && (
                      <span className={s.count}>{items.length}</span>
                    )}
                  </header>
                  {items.length === 0 ? (
                    <p className={s.none}>No holidays</p>
                  ) : (
                    <StaggerList className={s.list}>
                      {items.map((h, i) => {
                        const d = dayjs(h.date);
                        const past = d.isBefore(dayjs(), "day");
                        const isNext = Boolean(next && key(next) === key(h));
                        const weekend = d.day() === 0 || d.day() === 6;
                        const inDays = d
                          .startOf("day")
                          .diff(dayjs().startOf("day"), "day");
                        return (
                          <StaggerItem
                            key={key(h)}
                            index={i}
                            className={s.item}
                            data-past={past || undefined}
                            data-next={isNext || undefined}
                          >
                            <span className={s.dateBadge} aria-hidden>
                              <span className={s.dateDay}>{d.format("D")}</span>
                              <span className={s.dateDow}>
                                {d.format("ddd")}
                              </span>
                            </span>
                            <span className={s.itemText}>
                              <span className={s.name}>
                                {h.name || h.title}
                              </span>
                              <span className={s.tags}>
                                <span className="px-sr-only">
                                  {d.format("dddd D MMMM")}.
                                </span>
                                {isNext && (
                                  <Tag tone="accent">
                                    {inDays === 0
                                      ? "Today"
                                      : inDays === 1
                                        ? "Tomorrow"
                                        : `Next · in ${inDays} days`}
                                  </Tag>
                                )}
                                {!past && !isNext && (
                                  <span className="px-meta">
                                    in {inDays} days
                                  </span>
                                )}
                                {weekend && <Tag tone="warning">Weekend</Tag>}
                                {past && <span className="px-meta">Past</span>}
                              </span>
                            </span>
                            {canDelete && (
                              <Checkbox
                                aria-label={`Select ${h.name || h.title}`}
                                checked={selected.has(key(h))}
                                onChange={() =>
                                  setSelected((sel) => {
                                    const n = new Set(sel);
                                    if (n.has(key(h))) n.delete(key(h));
                                    else n.add(key(h));
                                    return n;
                                  })
                                }
                              />
                            )}
                          </StaggerItem>
                        );
                      })}
                    </StaggerList>
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}
      <AddHoliday
        open={adding}
        onClose={() => setAdding(false)}
        onAdded={() => {
          setAdding(false);
          refetch();
        }}
      />
      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={remove}
        busy={busy}
        title={
          confirm && confirm.length > 1
            ? `Delete ${confirm.length} Holidays?`
            : "Delete Holiday?"
        }
        description="It will disappear from everyone’s calendar and attendance."
        confirmLabel="Delete"
      />
    </Page>
  );
}

function AddHoliday({
  open,
  onClose,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
}) {
  const { setAlert } = useContext(AlertContext);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [errors, setErrors] = useState<{ name?: string; date?: string }>({});
  const [saving, setSaving] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!name.trim()) next.name = "Enter a name.";
    if (!date) next.date = "Choose a date.";
    setErrors(next);
    if (next.name || next.date) return;
    setSaving(true);
    try {
      await apiClient.post(API_ENDPOINTS.ADD_HOLIDAY, {
        name: name.trim(),
        date: dayjs(date).format("YYYY-MM-DD"),
      });
      setAlert({ open: true, message: "Holiday added.", severity: "success" });
      setName("");
      setDate("");
      onAdded();
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
      title="Add Holiday"
      description="It’s added to everyone’s calendar and counted in attendance."
      icon={{ name: "flag", tone: "accent" }}
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            type="submit"
            form="holiday-form"
            busy={saving}
          >
            Add Holiday
          </Button>
        </>
      }
    >
      <form
        id="holiday-form"
        onSubmit={submit}
        noValidate
        style={{ display: "grid", gap: 16 }}
      >
        <Field label="Name" error={errors.name}>
          <TextInput
            data-autofocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Diwali"
          />
        </Field>
        <Field label="Date" error={errors.date}>
          <TextInput
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
      </form>
    </Dialog>
  );
}
