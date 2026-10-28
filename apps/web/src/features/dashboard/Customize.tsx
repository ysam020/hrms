import { Reorder, useDragControls } from "framer-motion";
import { useState } from "react";
import {
  Button,
  ConfirmDialog,
  Icon,
  IconButton,
  SegmentedControl,
  Select,
  Sheet,
  Switch,
} from "@next/ui";
import { useIsCompact } from "@next/lib/hooks";
import type {
  AvailableWidget,
  DashboardConfig,
  LayoutEntry,
  WidgetSize,
} from "./data";
import { GROUP_ORDER, REGISTRY } from "./registry";
import d from "./dashboard.module.css";

// Customize Today: show or hide widgets, put them in order (drag the handle,
// or use the Move Up / Move Down buttons with a keyboard), pick a size, and
// set the options a widget supports. Only widgets the server listed for this
// person appear here. Changes apply at once and are saved shortly after —
// offline, they wait in Pending Changes like any other edit.

export function Customize({
  open,
  onClose,
  config,
  saving,
  onChange,
  onReset,
}: {
  open: boolean;
  onClose: () => void;
  config: DashboardConfig;
  saving: "idle" | "saving" | "queued" | "error";
  onChange: (layout: LayoutEntry[]) => void;
  onReset: () => Promise<void>;
}) {
  const compact = useIsCompact();
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const available = new Map(config.widgets.map((w) => [w.id, w]));
  const layout = config.layout.filter(
    (e) => available.has(e.id) && REGISTRY[e.id],
  );
  const shown = layout.filter((e) => e.visible);
  const hidden = layout.filter((e) => !e.visible);

  const set = (id: string, patch: Partial<LayoutEntry>) =>
    onChange(layout.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const reorder = (ids: string[]) =>
    onChange([...ids.map((id) => shown.find((e) => e.id === id)!), ...hidden]);
  const move = (id: string, by: -1 | 1) => {
    const ids = shown.map((e) => e.id);
    const i = ids.indexOf(id);
    const j = i + by;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    reorder(ids);
  };
  const show = (id: string) =>
    onChange([
      ...shown,
      { ...layout.find((e) => e.id === id)!, visible: true },
      ...hidden.filter((e) => e.id !== id),
    ]);

  const status =
    saving === "saving"
      ? "Saving…"
      : saving === "queued"
        ? "Saved on this device. It will sync when you’re back online."
        : saving === "error"
          ? "Couldn’t save. Your changes apply here until you reload."
          : config.customized
            ? "Saved."
            : "Showing the default for your role.";

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Customize Today"
      edge={compact ? "bottom" : "right"}
      width={460}
      footer={
        <div className={d.customizeFooter}>
          <Button
            variant="plain"
            disabled={!config.customized}
            onClick={() => setConfirmReset(true)}
          >
            Reset to Default…
          </Button>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </div>
      }
    >
      <p className={d.customizeStatus} role="status">
        {status}
      </p>

      <h3 className={d.customizeHead}>On Today</h3>
      {shown.length === 0 ? (
        <p className={d.note}>Nothing yet. Add widgets from the list below.</p>
      ) : (
        <Reorder.Group
          as="ol"
          axis="y"
          values={shown.map((e) => e.id)}
          onReorder={reorder}
          className={d.customizeList}
        >
          {shown.map((entry, i) => (
            <ShownRow
              key={entry.id}
              entry={entry}
              spec={available.get(entry.id)!}
              first={i === 0}
              last={i === shown.length - 1}
              onHide={() => set(entry.id, { visible: false })}
              onMove={(by) => move(entry.id, by)}
              onSize={(size) => set(entry.id, { size })}
              onSetting={(k, v) =>
                set(entry.id, { settings: { ...entry.settings, [k]: v } })
              }
            />
          ))}
        </Reorder.Group>
      )}

      {hidden.length > 0 && (
        <>
          <h3 className={d.customizeHead}>More Widgets</h3>
          {GROUP_ORDER.map((group) => {
            const items = hidden.filter((e) => REGISTRY[e.id].group === group);
            if (items.length === 0) return null;
            return (
              <div key={group} className={d.customizeGroup}>
                <p className={d.customizeGroupName}>{group}</p>
                <ul className={d.customizeList}>
                  {items.map((e) => (
                    <li key={e.id} className={d.customizeRow}>
                      <WidgetLabel id={e.id} />
                      <Switch
                        checked={false}
                        onChange={() => show(e.id)}
                        label={`Show ${REGISTRY[e.id].name}`}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </>
      )}
      <p className={`${d.footnote} ${d.customizeNote}`}>
        You only see widgets for information you have access to. If your access
        changes, Today updates to match.
      </p>

      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={async () => {
          setResetting(true);
          try {
            await onReset();
          } finally {
            setResetting(false);
            setConfirmReset(false);
          }
        }}
        busy={resetting}
        tone="accent"
        title="Reset Today?"
        description="Your widgets, their order and their options go back to the default for your role."
        confirmLabel="Reset"
      />
    </Sheet>
  );
}

function WidgetLabel({ id }: { id: string }) {
  const meta = REGISTRY[id];
  return (
    <span className={d.customizeLabel}>
      <span className={d.customizeIcon} aria-hidden>
        <Icon name={meta.icon} />
      </span>
      <span className={d.customizeText}>
        <span className={d.customizeName}>{meta.name}</span>
        <span className={d.customizeDesc}>{meta.description}</span>
      </span>
    </span>
  );
}

function ShownRow({
  entry,
  spec,
  first,
  last,
  onHide,
  onMove,
  onSize,
  onSetting,
}: {
  entry: LayoutEntry;
  spec: AvailableWidget;
  first: boolean;
  last: boolean;
  onHide: () => void;
  onMove: (by: -1 | 1) => void;
  onSize: (s: WidgetSize) => void;
  onSetting: (key: string, value: string | number) => void;
}) {
  const controls = useDragControls();
  const meta = REGISTRY[entry.id];
  const settings = Object.entries(spec.settings ?? {});
  return (
    <Reorder.Item
      value={entry.id}
      dragListener={false}
      dragControls={controls}
      className={d.customizeItem}
    >
      <div className={d.customizeRow}>
        <span
          className={d.handle}
          onPointerDown={(e) => controls.start(e)}
          aria-hidden
          title="Drag to reorder"
        >
          <Icon name="more" />
        </span>
        <WidgetLabel id={entry.id} />
        <Switch checked onChange={onHide} label={`Show ${meta.name}`} />
      </div>
      <div className={d.customizeControls}>
        <span className={d.moveButtons}>
          <IconButton
            icon="chevronUp"
            label={`Move ${meta.name} up`}
            disabled={first}
            onClick={() => onMove(-1)}
          />
          <IconButton
            icon="chevronDown"
            label={`Move ${meta.name} down`}
            disabled={last}
            onClick={() => onMove(1)}
          />
        </span>
        {spec.sizes.length > 1 && (
          <SegmentedControl<WidgetSize>
            label={`${meta.name} size`}
            value={entry.size}
            onChange={onSize}
            segments={spec.sizes
              .slice()
              .sort((a) => (a === "standard" ? -1 : 1))
              .map((s) => ({
                value: s,
                label: s === "wide" ? "Wide" : "Standard",
              }))}
          />
        )}
        {settings.map(([key, s]) => (
          <label key={key} className={d.setting}>
            <span>{meta.settingLabels?.[key] ?? key}</span>
            <Select
              value={String(entry.settings[key] ?? s.default)}
              onChange={(e) => {
                const opt = s.options.find(
                  (o) => String(o.value) === e.target.value,
                );
                if (opt) onSetting(key, opt.value);
              }}
            >
              {s.options.map((o) => (
                <option key={String(o.value)} value={String(o.value)}>
                  {meta.formatOption
                    ? meta.formatOption(key, o.value)
                    : o.label}
                </option>
              ))}
            </Select>
          </label>
        ))}
      </div>
    </Reorder.Item>
  );
}
