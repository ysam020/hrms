import dayjs from "dayjs";
import {
  useContext,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import { addEventSchema } from "@web/shared/schemas/addEvent";
import { StaggerItem, StaggerList, Swap } from "@next/motion";
import {
  Tag,
  Icon,
  DateTile,
  Button,
  ConfirmDialog,
  Dialog,
  Field,
  FormGrid,
  IconButton,
  Page,
  Section,
  TextArea,
  TextInput,
  fieldSpan2,
} from "@next/ui";
import { apiClient, asList, errorMessage } from "@next/lib/api";
import { useGet } from "@next/lib/hooks";
import s from "./calendar.module.css";

// Calendar: month grid + the selected day's agenda. Events from
// GET /get-calendar-events, holidays from GET /get-holidays/:year. New events
// use Classic's addEventSchema and POST /add-event; people can delete events
// they created (the server enforces ownership).

export default function CalendarPage() {
  const { user } = useContext(UserContext);
  const { setAlert } = useContext(AlertContext);
  const [month, setMonth] = useState(() => dayjs().startOf("month"));
  const [day, setDay] = useState(() => dayjs());
  const events = useGet<any>("/get-calendar-events");
  const holidays = useGet<any>(API_ENDPOINTS.GET_HOLIDAYS(month.year()));
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);

  const byDate = useMemo(() => {
    const m = new Map<
      string,
      { kind: "event" | "holiday"; title: string; item: any }[]
    >();
    const push = (
      date: string,
      v: { kind: "event" | "holiday"; title: string; item: any },
    ) => m.set(date, [...(m.get(date) || []), v]);
    for (const e of asList<any>(events.data))
      push(dayjs(e.date).format("YYYY-MM-DD"), {
        kind: "event",
        title: e.title,
        item: e,
      });
    for (const h of asList<any>(holidays.data, "holidays"))
      push(dayjs(h.date).format("YYYY-MM-DD"), {
        kind: "holiday",
        title: h.name || h.title,
        item: h,
      });
    for (const [, v] of m)
      v.sort((a, b) =>
        (a.item.startTime || "").localeCompare(b.item.startTime || ""),
      );
    return m;
  }, [events.data, holidays.data]);
  // The next few things after the selected day, from the same data.
  const upcoming = useMemo(() => {
    const from = day.format("YYYY-MM-DD");
    return [...byDate.entries()]
      .filter(([d]) => d > from)
      .sort(([a], [b]) => a.localeCompare(b))
      .flatMap(([d, items]) => items.map((it) => [d, it] as const))
      .slice(0, 5);
  }, [byDate, day]);

  const cells = useMemo(() => {
    const start = month.startOf("week");
    const end = month.endOf("month").endOf("week");
    const out: dayjs.Dayjs[] = [];
    for (let d = start; !d.isAfter(end, "day"); d = d.add(1, "day"))
      out.push(d);
    return out;
  }, [month]);

  const dayItems = byDate.get(day.format("YYYY-MM-DD")) || [];
  const remove = async () => {
    setBusy(true);
    try {
      await apiClient.delete(
        API_ENDPOINTS.DELETE_CALENDAR_EVENT(deleting._id || deleting.id),
      );
      setAlert({ open: true, message: "Event deleted.", severity: "success" });
      setDeleting(null);
      events.refetch();
    } catch (err) {
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    } finally {
      setBusy(false);
    }
  };

  const onGridKey = (e: React.KeyboardEvent) => {
    const delta = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 7, ArrowUp: -7 }[
      e.key
    ];
    if (!delta) return;
    e.preventDefault();
    const next = day.add(delta, "day");
    setDay(next);
    if (!next.isSame(month, "month")) setMonth(next.startOf("month"));
    requestAnimationFrame(() =>
      document.getElementById(`cal-${next.format("YYYY-MM-DD")}`)?.focus(),
    );
  };

  return (
    <Page
      title="Calendar"
      actions={
        <Button
          variant="primary"
          icon="plus"
          onClick={() => setAdding(true)}
          data-tour="calendar-new"
        >
          New Event
        </Button>
      }
    >
      <div className={s.layout}>
        <div>
          <div className={s.head}>
            <h2 className={s.monthName} aria-live="polite">
              {month.format("MMMM YYYY")}
            </h2>
            <IconButton
              icon="chevronLeft"
              label="Previous month"
              onClick={() => setMonth((m) => m.subtract(1, "month"))}
            />
            <Button
              size="small"
              onClick={() => {
                setMonth(dayjs().startOf("month"));
                setDay(dayjs());
              }}
            >
              Today
            </Button>
            <IconButton
              icon="chevronRight"
              label="Next month"
              onClick={() => setMonth((m) => m.add(1, "month"))}
            />
          </div>
          <Swap id={month.format("YYYY-MM")}>
            <div
              className={s.grid}
              data-tour="calendar-month"
              role="grid"
              aria-label={month.format("MMMM YYYY")}
              onKeyDown={onGridKey}
            >
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d} className={s.dow} role="columnheader">
                  {d}
                </div>
              ))}
              {cells.map((d) => {
                const k = d.format("YYYY-MM-DD");
                const items = byDate.get(k) || [];
                const selected = d.isSame(day, "day");
                return (
                  <button
                    key={k}
                    id={`cal-${k}`}
                    type="button"
                    role="gridcell"
                    className={s.cell}
                    aria-selected={selected}
                    tabIndex={selected ? 0 : -1}
                    aria-label={`${d.format("dddd D MMMM")}${items.length ? `, ${items.length} item${items.length > 1 ? "s" : ""}` : ""}`}
                    data-outside={!d.isSame(month, "month") || undefined}
                    data-today={d.isSame(dayjs(), "day") || undefined}
                    onClick={() => setDay(d)}
                  >
                    <span className={s.num}>{d.date()}</span>
                    {items.slice(0, 2).map((it, i) => (
                      <span
                        key={i}
                        className={s.chip}
                        data-kind={it.kind}
                        title={`${it.kind === "holiday" ? "Holiday" : "Event"}: ${it.title}`}
                      >
                        {it.kind === "holiday" && (
                          <Icon name="flag" size={10} />
                        )}
                        {it.title}
                      </span>
                    ))}
                    {items.length > 2 && (
                      <span className={s.more}>+{items.length - 2} more</span>
                    )}
                    {items.length > 0 && (
                      <span className={s.dots} aria-hidden>
                        {items.slice(0, 3).map((_, i) => (
                          <i key={i} />
                        ))}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </Swap>
        </div>
        <Section
          title={
            day.isSame(dayjs(), "day") ? "Today" : day.format("dddd, D MMMM")
          }
        >
          <Swap id={day.format("YYYY-MM-DD")}>
            {dayItems.length === 0 ? (
              <div className={s.empty}>
                <Icon name="calendar" size={20} />
                <span>Nothing scheduled</span>
                <Button
                  size="small"
                  icon="plus"
                  onClick={() => setAdding(true)}
                >
                  Add Event
                </Button>
              </div>
            ) : (
              <StaggerList className={s.day}>
                {dayItems.map((it, i) => (
                  <StaggerItem
                    key={i}
                    index={i}
                    className={s.dayItem}
                    data-kind={it.kind}
                  >
                    <span className={s.dayWhen}>
                      <Tag tone={it.kind === "holiday" ? "warning" : "accent"}>
                        {it.kind === "holiday" ? "Holiday" : "Event"}
                      </Tag>
                      <span className="px-meta px-num">
                        {it.kind === "holiday"
                          ? "All day"
                          : it.item.startTime
                            ? [it.item.startTime, it.item.endTime]
                                .filter(Boolean)
                                .join("–")
                            : "All day"}
                      </span>
                    </span>
                    <span className="px-headline">{it.title}</span>
                    {it.item.description && (
                      <span className="px-callout px-secondary">
                        {it.item.description}
                      </span>
                    )}
                    {it.kind === "event" &&
                      (it.item.createdBy === user?.id ||
                        it.item.userId === user?.id ||
                        it.item.username === user?.username) && (
                        <span>
                          <Button
                            size="small"
                            variant="plainDanger"
                            icon="trash"
                            onClick={() => setDeleting(it.item)}
                          >
                            Delete Event
                          </Button>
                        </span>
                      )}
                  </StaggerItem>
                ))}
              </StaggerList>
            )}
          </Swap>
          {upcoming.length > 0 && (
            <div className={s.upcoming}>
              <h3 className={s.upTitle}>Upcoming</h3>
              <ul>
                {upcoming.map(([date, it], i) => (
                  <li key={i}>
                    <button
                      type="button"
                      className={s.upItem}
                      onClick={() => {
                        const d = dayjs(date);
                        setDay(d);
                        setMonth(d.startOf("month"));
                      }}
                    >
                      <DateTile
                        date={date}
                        size="small"
                        tone={it.kind === "holiday" ? "warning" : "accent"}
                      />
                      <span className={s.upText}>
                        <span className="px-truncate">{it.title}</span>
                        <span className="px-meta">
                          {it.kind === "holiday" ? "Holiday" : "Event"} ·{" "}
                          {dayjs(date).format("ddd D MMM")}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Section>
      </div>
      <NewEvent
        open={adding}
        initialDate={day}
        onClose={() => setAdding(false)}
        onAdded={() => {
          setAdding(false);
          events.refetch();
        }}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        busy={busy}
        title="Delete Event?"
        description={deleting?.title}
        confirmLabel="Delete"
      />
    </Page>
  );
}

function NewEvent({
  open,
  initialDate,
  onClose,
  onAdded,
}: {
  open: boolean;
  initialDate: dayjs.Dayjs;
  onClose: () => void;
  onAdded: () => void;
}) {
  const { setAlert } = useContext(AlertContext);
  const blank = () => ({
    title: "",
    date: initialDate.isBefore(dayjs(), "day")
      ? dayjs().format("YYYY-MM-DD")
      : initialDate.format("YYYY-MM-DD"),
    startTime: "10:00",
    endTime: "11:00",
    description: "",
  });
  const [v, setV] = useState(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) {
      setV(blank());
      setErrors({});
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const set =
    (k: keyof ReturnType<typeof blank>) => (e: { target: { value: string } }) =>
      setV((x) => ({ ...x, [k]: e.target.value }));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = addEventSchema.safeParse(v);
    if (!parsed.success) {
      const n: Record<string, string> = {};
      for (const i of parsed.error.issues)
        n[String(i.path[0] ?? "endTime")] ??= i.message;
      setErrors(n);
      return;
    }
    setSaving(true);
    try {
      await apiClient.post(API_ENDPOINTS.ADD_EVENT, v);
      setAlert({ open: true, message: "Event added.", severity: "success" });
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
      title="New Event"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            type="submit"
            form="event-form"
            busy={saving}
          >
            Add Event
          </Button>
        </>
      }
    >
      <form id="event-form" onSubmit={submit} noValidate>
        <FormGrid columns={2}>
          <Field label="Title" error={errors.title} className={fieldSpan2}>
            <TextInput data-autofocus value={v.title} onChange={set("title")} />
          </Field>
          <Field label="Date" error={errors.date} className={fieldSpan2}>
            <TextInput
              type="date"
              min={dayjs().format("YYYY-MM-DD")}
              value={v.date}
              onChange={set("date")}
            />
          </Field>
          <Field label="Starts" error={errors.startTime}>
            <TextInput
              type="time"
              value={v.startTime}
              onChange={set("startTime")}
            />
          </Field>
          <Field label="Ends" error={errors.endTime}>
            <TextInput
              type="time"
              value={v.endTime}
              onChange={set("endTime")}
            />
          </Field>
          <Field label="Notes" optional className={fieldSpan2}>
            <TextArea
              rows={3}
              value={v.description}
              onChange={set("description")}
            />
          </Field>
        </FormGrid>
      </form>
    </Dialog>
  );
}
