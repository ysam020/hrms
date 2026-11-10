// @vitest-environment-options {"url": "https://praesto.in/"}
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  GA4_MEASUREMENT_ID,
  GTM_ID,
  resetAnalyticsForTests,
  sanitizedLocation,
  trackEvent,
  trackPageView,
  trackPricingView,
} from "@next/app/analytics";

type DL = Record<string, unknown>[];
const win = window as unknown as Record<string, unknown> & { dataLayer?: DL };

const gtmScripts = () =>
  document.querySelectorAll(`script[src*="googletagmanager.com/gtm.js"]`);
const events = (name?: string) =>
  (win.dataLayer ?? []).filter(
    (e) =>
      !(e instanceof Object && "length" in e) && // gtag() arguments objects
      typeof e.event === "string" &&
      (name ? e.event === name : true),
  );
const go = (url: string) => window.history.pushState({}, "", url);

beforeEach(() => {
  resetAnalyticsForTests();
  gtmScripts().forEach((s) => s.remove());
  delete win.dataLayer;
  delete win[`ga-disable-${GA4_MEASUREMENT_ID}`];
  Object.defineProperty(navigator, "globalPrivacyControl", {
    value: undefined,
    configurable: true,
  });
  go("/");
});
afterEach(() => resetAnalyticsForTests());

describe("GTM loading", () => {
  it("loads the container once, async, after consent defaults", () => {
    trackPageView("/");
    trackPageView("/privacy-policy");
    trackPageView("/");
    const scripts = gtmScripts();
    expect(scripts).toHaveLength(1);
    const s = scripts[0] as HTMLScriptElement;
    expect(s.async).toBe(true);
    expect(s.src).toBe(`https://www.googletagmanager.com/gtm.js?id=${GTM_ID}`);

    const dl = win.dataLayer!;
    const consentIdx = dl.findIndex(
      (e) => "length" in e && (e as unknown as unknown[])[0] === "consent",
    );
    const startIdx = dl.findIndex((e) => e.event === "gtm.js");
    const viewIdx = dl.findIndex((e) => e.event === "virtual_page_view");
    expect(consentIdx).toBeGreaterThanOrEqual(0);
    expect(consentIdx).toBeLessThan(startIdx);
    expect(startIdx).toBeLessThan(viewIdx);
    const ads = dl[consentIdx] as unknown as [
      string,
      string,
      Record<string, string>,
    ];
    expect(ads[2].ad_storage).toBe("denied");
    expect(ads[2].ad_user_data).toBe("denied");
    expect(ads[2].ad_personalization).toBe("denied");
  });

  it("never loads when the first route is inside the app", () => {
    trackPageView("/dashboard");
    trackPageView("/employee-management/jane.doe");
    expect(gtmScripts()).toHaveLength(0);
    expect(win.dataLayer).toBeUndefined();
  });

  it("waits while an access token is in the address bar", () => {
    go("/?oauth_success=1&access_token=secret.jwt.value");
    trackPageView("/");
    expect(gtmScripts()).toHaveLength(0);
    go("/org-setup");
    trackPageView("/org-setup");
    expect(gtmScripts()).toHaveLength(1);
    expect(JSON.stringify(win.dataLayer)).not.toContain("secret");
  });

  it("respects Global Privacy Control", () => {
    Object.defineProperty(navigator, "globalPrivacyControl", {
      value: true,
      configurable: true,
    });
    trackPageView("/");
    expect(gtmScripts()).toHaveLength(0);
  });
});

describe("page views", () => {
  it("sends one page view per route change, with fixed title and referrer chain", () => {
    trackPageView("/");
    trackPageView("/"); // StrictMode / re-render
    go("/privacy-policy");
    trackPageView("/privacy-policy");
    go("/");
    trackPageView("/"); // back button

    const views = events("virtual_page_view");
    expect(views.map((v) => v.page_location)).toEqual([
      "https://praesto.in/",
      "https://praesto.in/privacy-policy",
      "https://praesto.in/",
    ]);
    expect(views[1].page_title).toBe("Privacy Policy · Praesto");
    expect(views[1].page_referrer).toBe("https://praesto.in/");
    expect(views[2].page_referrer).toBe("https://praesto.in/privacy-policy");
  });

  it("keeps only campaign parameters in page_location", () => {
    expect(
      sanitizedLocation(
        "/",
        "?utm_source=linkedin&email=a%40b.com&invite=abc&gclid=G1",
      ),
    ).toBe("https://praesto.in/?utm_source=linkedin&gclid=G1");
  });

  it("switches GA off inside the app and back on outside it", () => {
    trackPageView("/login");
    trackPageView("/employee-management/jane.doe");
    expect(win[`ga-disable-${GA4_MEASUREMENT_ID}`]).toBe(true);
    trackEvent("cta_click", { cta_id: "sign_in", cta_location: "nav" });
    expect(events("virtual_page_view")).toHaveLength(1);
    expect(events("cta_click")).toHaveLength(0);
    expect(JSON.stringify(win.dataLayer)).not.toContain("jane");

    go("/");
    trackPageView("/");
    expect(win[`ga-disable-${GA4_MEASUREMENT_ID}`]).toBeUndefined();
    const last = events("virtual_page_view").at(-1)!;
    expect(last.page_location).toBe("https://praesto.in/");
    // Not the app page, and not the document's original referrer again.
    expect(last.page_referrer).toBeUndefined();
  });
});

describe("custom events", () => {
  it("resets parameters between events", () => {
    trackPageView("/");
    trackEvent("sign_up_click", {
      cta_id: "choose_plan",
      cta_location: "pricing",
      plan_tier: "growth",
      billing_period: "annual",
    });
    trackEvent("cta_click", { cta_id: "sign_in", cta_location: "nav" });
    const [click] = events("cta_click");
    expect(click).toHaveProperty("plan_tier", undefined);
    expect(click).toHaveProperty("billing_period", undefined);
    expect(click.cta_location).toBe("nav");
  });

  it("measures the lead form pages and sends form conversions with form_type only", () => {
    go("/book-demo?utm_source=linkedin&email=a%40b.com");
    trackPageView("/book-demo");
    trackEvent("demo_request", { form_type: "demo" });
    const [view] = events("virtual_page_view");
    expect(view.page_location).toBe(
      "https://praesto.in/book-demo?utm_source=linkedin",
    );
    const [demo] = events("demo_request");
    const sent = Object.fromEntries(
      Object.entries(demo).filter(([, v]) => v !== undefined),
    );
    expect(sent).toEqual({
      event: "demo_request",
      form_type: "demo",
      page_location: "https://praesto.in/book-demo?utm_source=linkedin",
    });
    go("/contact");
    trackPageView("/contact");
    expect(events("virtual_page_view")).toHaveLength(2);
  });

  it("sends pricing_view once per page view", () => {
    trackPageView("/");
    trackPricingView();
    trackPricingView();
    expect(events("pricing_view")).toHaveLength(1);
  });

  it("records outbound links by domain and path, and email links without the address", () => {
    trackPageView("/");
    const a = document.createElement("a");
    a.href = "https://razorpay.com/pricing?ref=praesto#x";
    const mail = document.createElement("a");
    mail.href = "mailto:hello@praesto.in";
    const own = document.createElement("a");
    own.href = "https://praesto.in/privacy-policy";
    for (const el of [a, mail, own]) {
      el.addEventListener("click", (e) => e.preventDefault());
      document.body.append(el);
      el.click();
      el.remove();
    }
    const out = events("outbound_click");
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      link_type: "web",
      link_domain: "razorpay.com",
      link_url: "https://razorpay.com/pricing",
    });
    expect(out[1].link_type).toBe("email");
    expect(JSON.stringify(out[1])).not.toContain("hello@");
  });
});
