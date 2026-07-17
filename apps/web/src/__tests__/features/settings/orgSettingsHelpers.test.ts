import {
  resolveEffectiveDate,
  formatDate,
  subTabSlugToIndex,
  SUB_TABS,
} from "@web/features/settings/org-settings/helpers";

describe("resolveEffectiveDate", () => {
  it("returns now for the 'now' preset", () => {
    const before = Date.now();
    const result = resolveEffectiveDate("now", "");
    const after = Date.now();
    expect(result.getTime()).toBeGreaterThanOrEqual(before);
    expect(result.getTime()).toBeLessThanOrEqual(after);
  });

  it("returns the 1st of next month for 'next_month'", () => {
    const now = new Date();
    const result = resolveEffectiveDate("next_month", "");
    expect(result.getDate()).toBe(1);
    expect(result.getMonth()).toBe((now.getMonth() + 1) % 12);
  });

  it("returns January 1st of next year for 'next_year'", () => {
    const now = new Date();
    const result = resolveEffectiveDate("next_year", "");
    expect(result.getFullYear()).toBe(now.getFullYear() + 1);
    expect(result.getMonth()).toBe(0);
    expect(result.getDate()).toBe(1);
  });

  it("parses the custom date string for 'custom'", () => {
    const result = resolveEffectiveDate("custom", "2026-03-15");
    expect(result.getUTCFullYear()).toBe(2026);
    expect(result.getUTCMonth()).toBe(2);
    expect(result.getUTCDate()).toBe(15);
  });

  it("falls back to now when 'custom' is selected without a date", () => {
    const before = Date.now();
    const result = resolveEffectiveDate("custom", "");
    expect(result.getTime()).toBeGreaterThanOrEqual(before);
  });
});

describe("formatDate", () => {
  it("returns an em dash for null", () => {
    expect(formatDate(null)).toBe("—");
  });

  it("formats an ISO date string", () => {
    const result = formatDate("2026-03-15T00:00:00Z");
    expect(result).toContain("2026");
    expect(result).toMatch(/Mar/);
  });
});

describe("subTabSlugToIndex", () => {
  it("returns 0 for a null slug", () => {
    expect(subTabSlugToIndex(null)).toBe(0);
  });

  it("returns 0 for an unknown slug", () => {
    expect(subTabSlugToIndex("nonexistent")).toBe(0);
  });

  it("resolves a known slug to its index", () => {
    const idx = SUB_TABS.findIndex((t) => t.slug === "exit-policy");
    expect(subTabSlugToIndex("exit-policy")).toBe(idx);
    expect(idx).toBeGreaterThan(0);
  });

  it("resolves every declared slug to a valid index", () => {
    SUB_TABS.forEach((tab, i) => {
      expect(subTabSlugToIndex(tab.slug)).toBe(i);
    });
  });
});
