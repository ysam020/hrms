import { readFileSync } from "fs";
import path from "path";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { REGISTRY } from "@next/features/dashboard/registry";
import { Customize } from "@next/features/dashboard/Customize";
import type { DashboardConfig } from "@next/features/dashboard/data";

// The server registry (api-gateway/src/config/dashboardWidgets.ts) decides
// which widgets exist and who may use them; the web registry only draws them.
// These tests keep the two in step and check that Customize can only arrange
// what the server listed.

const serverIds = () => {
  const src = readFileSync(
    path.resolve(
      __dirname,
      "../../../api-gateway/src/config/dashboardWidgets.ts",
    ),
    "utf8",
  );
  const block = src.slice(
    src.indexOf("export const WIDGETS"),
    src.indexOf("export const WIDGET_BY_ID"),
  );
  return [...block.matchAll(/id: "([a-z-]+)"/g)].map((m) => m[1]).sort();
};

describe("dashboard registries", () => {
  it("the web app can draw every widget the server defines, and no others", () => {
    expect(Object.keys(REGISTRY).sort()).toEqual(serverIds());
  });

  it("every server-backed widget has a renderer and a refresh pace", () => {
    for (const [id, meta] of Object.entries(REGISTRY)) {
      if (["my-day", "approvals", "announcements", "agenda"].includes(id))
        continue;
      expect(meta.render, id).toBeTypeOf("function");
      expect(meta.refresh, id).toMatch(/live|slow/);
    }
  });
});

const config = (): DashboardConfig => ({
  version: 1,
  capabilities: ["self", "teamLead"],
  personas: ["team-lead"],
  widgets: [
    {
      id: "my-day",
      sizes: ["wide"],
      defaultSize: "wide",
      source: "client",
      settings: {},
    },
    {
      id: "team-today",
      sizes: ["wide", "standard"],
      defaultSize: "wide",
      source: "server",
      settings: {},
    },
    {
      id: "team-leave",
      sizes: ["standard", "wide"],
      defaultSize: "standard",
      source: "server",
      settings: {
        days: {
          default: 14,
          options: [
            { value: 7, label: "7" },
            { value: 14, label: "14" },
          ],
        },
      },
    },
    {
      id: "payslip",
      sizes: ["standard"],
      defaultSize: "standard",
      source: "server",
      settings: {},
    },
  ],
  defaults: [],
  layout: [
    { id: "my-day", visible: true, size: "wide", settings: {} },
    { id: "team-today", visible: true, size: "wide", settings: {} },
    {
      id: "team-leave",
      visible: true,
      size: "standard",
      settings: { days: 14 },
    },
    { id: "payslip", visible: false, size: "standard", settings: {} },
    // A saved entry the server no longer lists: never offered.
    { id: "payroll", visible: true, size: "standard", settings: {} },
  ],
  customized: true,
});

const lastLayout = (fn: ReturnType<typeof vi.fn>) =>
  fn.mock.calls[fn.mock.calls.length - 1][0];

const renderCustomize = (onChange = vi.fn()) => {
  render(
    <MemoryRouter>
      <Customize
        open
        onClose={() => {}}
        config={config()}
        saving="idle"
        onChange={onChange}
        onReset={async () => {}}
      />
    </MemoryRouter>,
  );
  return onChange;
};

describe("Customize Today", () => {
  it("offers only widgets the server listed", () => {
    renderCustomize();
    const sheet = screen.getByRole("dialog", { name: "Customize Today" });
    expect(within(sheet).getByText("Team Today")).toBeInTheDocument();
    expect(within(sheet).getByText("Latest Payslip")).toBeInTheDocument();
    expect(within(sheet).queryByText("Payroll")).toBeNull();
  });

  it("hides, shows and reorders", () => {
    const onChange = renderCustomize();
    fireEvent.click(screen.getByRole("switch", { name: "Show Team Today" }));
    let layout = lastLayout(onChange);
    expect(layout.find((e: any) => e.id === "team-today").visible).toBe(false);

    fireEvent.click(
      screen.getByRole("switch", { name: "Show Latest Payslip" }),
    );
    layout = lastLayout(onChange);
    expect(layout.filter((e: any) => e.visible).map((e: any) => e.id)).toEqual([
      "my-day",
      "team-today",
      "team-leave",
      "payslip",
    ]);

    fireEvent.click(
      screen.getByRole("button", { name: "Move Team Leave Ahead up" }),
    );
    layout = lastLayout(onChange);
    expect(layout.map((e: any) => e.id).slice(0, 3)).toEqual([
      "my-day",
      "team-leave",
      "team-today",
    ]);
    expect(layout.some((e: any) => e.id === "payroll")).toBe(false);
  });

  it("disables moves past the ends", () => {
    renderCustomize();
    expect(
      screen.getByRole("button", { name: "Move Your Day up" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Move Team Leave Ahead down" }),
    ).toBeDisabled();
  });
});
