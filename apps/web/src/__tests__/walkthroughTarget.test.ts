import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { waitForTarget } from "@next/walkthrough/waitForTarget";

// Waiting for a step's target: appears later, never appears, hidden, a
// refused route, cancellation, and fallback order.

const rect = {
  width: 100,
  height: 20,
  top: 0,
  left: 0,
  right: 100,
  bottom: 20,
  x: 0,
  y: 0,
  toJSON() {},
};

beforeEach(() => {
  document.body.innerHTML = '<main id="px-main"></main>';
  // jsdom has no layout: give elements a size so they count as visible.
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(
    rect as DOMRect,
  );
});
afterEach(() => vi.restoreAllMocks());

const add = (html: string) => {
  const t = document.createElement("template");
  t.innerHTML = html;
  const el = t.content.firstElementChild!;
  document.getElementById("px-main")!.appendChild(el);
  return el;
};

describe("waitForTarget", () => {
  it("resolves immediately when the target is there", async () => {
    const el = add('<div data-tour="x"></div>');
    await expect(waitForTarget('[data-tour="x"]')).resolves.toBe(el);
  });

  it("waits for a target rendered later (data loading)", async () => {
    const p = waitForTarget('[data-tour="late"]', { timeout: 2000 });
    setTimeout(() => add('<div data-tour="late"></div>'), 50);
    const el = await p;
    expect(el?.getAttribute("data-tour")).toBe("late");
  });

  it("gives up after the timeout instead of hanging", async () => {
    const t0 = Date.now();
    await expect(
      waitForTarget('[data-tour="never"]', { timeout: 120 }),
    ).resolves.toBeNull();
    expect(Date.now() - t0).toBeLessThan(1000);
  });

  it("ignores targets inside inert or hidden regions", async () => {
    add('<div inert><div data-tour="h"></div></div>');
    await expect(
      waitForTarget('[data-tour="h"]', { timeout: 100 }),
    ).resolves.toBeNull();
  });

  it("stops at once on a refused route (NoAccess)", async () => {
    add("<span data-tour-blocked hidden></span>");
    const t0 = Date.now();
    await expect(
      waitForTarget('[data-tour="x"]', { timeout: 5000 }),
    ).resolves.toBeNull();
    expect(Date.now() - t0).toBeLessThan(500);
  });

  it("can be cancelled", async () => {
    const ac = new AbortController();
    const p = waitForTarget('[data-tour="x"]', { signal: ac.signal });
    ac.abort();
    await expect(p).resolves.toBeNull();
  });

  it("uses the first visible target in priority order", async () => {
    add('<div inert><div data-tour="nav"></div></div>');
    const title = add('<h1 data-tour="title"></h1>');
    await expect(
      waitForTarget(['[data-tour="nav"]', '[data-tour="title"]'], {
        timeout: 200,
      }),
    ).resolves.toBe(title);
  });

  it("waits for a loading skeleton to be replaced by the real content", async () => {
    add('<div data-tour="t"><table aria-busy="true"></table></div>');
    const p = waitForTarget('[data-tour="t"]', { timeout: 2000 });
    setTimeout(() => {
      document.getElementById("px-main")!.innerHTML =
        '<div data-tour="t" id="real"><table></table></div>';
    }, 50);
    expect((await p)?.id).toBe("real");
  });

  it("settles for a still-loading target when time runs out", async () => {
    const el = add('<div data-tour="t"><table aria-busy="true"></table></div>');
    await expect(
      waitForTarget('[data-tour="t"]', { timeout: 120 }),
    ).resolves.toBe(el);
  });

  it("gives up early once the page has settled without the target", async () => {
    add("<p>Loaded page</p>");
    const t0 = Date.now();
    await expect(
      waitForTarget('[data-tour="absent"]', { timeout: 5000, settle: 150 }),
    ).resolves.toBeNull();
    expect(Date.now() - t0).toBeLessThan(1500);
  });

  it("keeps waiting while the page still shows skeletons", async () => {
    const skeleton = add('<span data-skeleton=""></span>');
    const p = waitForTarget('[data-tour="late"]', {
      timeout: 3000,
      settle: 100,
    });
    setTimeout(() => {
      skeleton.remove();
      add('<div data-tour="late" id="arrived"></div>');
    }, 500);
    expect((await p)?.id).toBe("arrived");
  });

  it("treats an invalid selector as missing, without throwing", async () => {
    await expect(waitForTarget("[[[", { timeout: 100 })).resolves.toBeNull();
  });
});
