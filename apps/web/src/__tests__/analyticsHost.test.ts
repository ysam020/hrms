// jsdom's default origin (localhost) stands in for dev and preview hosts.
import { expect, it } from "vitest";
import {
  analyticsAllowed,
  resetAnalyticsForTests,
  trackPageView,
} from "@next/app/analytics";

it("never loads GTM outside production", () => {
  resetAnalyticsForTests();
  expect(analyticsAllowed()).toBe(false);
  trackPageView("/");
  expect(
    document.querySelectorAll(`script[src*="googletagmanager.com"]`),
  ).toHaveLength(0);
  expect(
    (window as unknown as { dataLayer?: unknown }).dataLayer,
  ).toBeUndefined();
});
