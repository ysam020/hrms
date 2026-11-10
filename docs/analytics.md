# Website analytics (GTM + GA4)

Praesto's public website is measured with Google Tag Manager container
`GTM-59723TZZ`, which runs the GA4 property `G-58KVDDCH2W`. Only production
(`praesto.in`) is measured, and only the public pages and the sign-up path.
Nothing behind sign-in is ever sent.

Code: `apps/web/src/app/analytics.ts`. Tests:
`apps/web/src/__tests__/analytics.test.ts` and `analyticsHost.test.ts`.

## How it works

```
route change ── SessionRoot effect ── trackPageView(pathname)
                                         │
              tracked path? ── no ──► GA switched off (ga-disable-G-58KVDDCH2W)
                   │ yes
              praesto.in, no GPC/DNT, no token in URL?
                   │ yes
              load GTM once (consent defaults → gtm.js, async)
                   │
              dataLayer.push({ event: "virtual_page_view", page_location, page_title, page_referrer })

UI actions ── trackEvent("sign_up_click" | …, params) ── dataLayer (only on tracked pages)
```

- **Measured pages** (`TRACKED_PATHS`): every entry in `PUBLIC_PAGES`
  (`/`, `/privacy-policy`, `/terms-of-use`, `/refund-policy`, `/login`) plus
  `/org-setup`. A new public page added to `PUBLIC_PAGES` is picked up
  automatically. Careers pages are not measured, because they are tenants'
  pages.
- **Why GTM is not in `index.html`:** `index.html` is also the SPA fallback for
  every in-app route, and Google sign-in returns to
  `/?oauth_success=1&access_token=…`. The token stays in the URL until the
  session boot removes it. GTM therefore starts from code, once per document,
  only on a measured page, and only once the URL holds no credentials.
- **The noscript `<iframe>` is intentionally omitted.** The site needs
  JavaScript, GA4 tags can't run without it, and the iframe would need a
  `frame-src` CSP exception for no benefit.
- **Page views** come only from `virtual_page_view`. Nothing in GTM or GA4 may
  generate page views on its own (see the settings below), or they double
  up.
- **Leaving the public area** (signing in, for example) sets
  `window['ga-disable-G-58KVDDCH2W'] = true`, GA's documented kill switch. It
  stops the tag's automatic hits (`user_engagement`), which would otherwise
  carry app URLs such as `/employee-management/<username>`.
- **Sanitised values:** `page_location` is `https://praesto.in` + path +
  `utm_*`/`gclid` only. `page_title` is the fixed title from `TRACKED_PATHS`,
  never `document.title`. `page_referrer` is another site's origin, or the
  previous measured page.
- **Consent (Consent Mode v2 defaults):** ads storage, ad user data and ad
  personalisation are denied everywhere. Analytics storage is granted, except
  in the EEA, UK and Switzerland, where it is denied. Browsers sending Global
  Privacy Control or Do Not Track never load GTM.

## Events

| Event                                 | Fires when                                                                                                                                                       | Parameters                                                                                          |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `virtual_page_view` → GA4 `page_view` | A measured route is shown: first load, link, back/forward. Not on a repeat of the same page.                                                                     | `page_location`, `page_title`, `page_referrer`                                                      |
| `sign_up_click`                       | A signed-out visitor clicks Start Free Trial (nav, hero, closing section) or "Choose ‹plan›"                                                                     | `cta_id` (`start_trial`, `choose_plan`), `cta_location`, `plan_tier`, `billing_period` (plans only) |
| `sign_up_complete`                    | The server confirms the organisation was created (`POST /tenants` success after payment or trial mandate, or a resumed setup)                                    | `plan_type` (`trial`/`paid`), `plan_tier`, `billing_period` (absent on resume)                      |
| `free_trial_start`                    | Same moment as `sign_up_complete`, when the organisation was created on the free trial                                                                           | `plan_tier`, `billing_period`                                                                       |
| `demo_request`                        | The server accepted a Book a Demo form (`POST /public/leads` → 201)                                                                                              | `form_type` = `demo`                                                                                |
| `contact_submit`                      | The server accepted a Contact Sales / custom-solution form                                                                                                       | `form_type` (`sales`/`custom`)                                                                      |
| `pricing_view`                        | The pricing section reaches the upper 60% of the viewport (once per page view)                                                                                   | none                                                                                                |
| `cta_click`                           | Book a Demo (hero, closing, mobile menu, footer), Contact Sales and Get a Custom HRMS Solution (pricing, footer), Sign In, Explore the Platform (signed-in hero) | `cta_id`, `cta_location`                                                                            |
| `outbound_click`                      | A link to another site, or a `mailto:` link                                                                                                                      | `link_type` (`web`/`email`), `link_domain`, `link_url` (origin + path; no query, no email address)  |

Every custom event also carries `page_location` (sanitised). Conversions
(`sign_up_complete`, `free_trial_start`, `demo_request`, `contact_submit`)
fire only after the server confirms success, once per success: a failed or
repeated submission sends nothing. No event carries anything a visitor typed.
`login` is deliberately not sent: it measures employees using the product,
not website visitors.

The lead forms (`/book-demo`, `/contact`) are measured pages. Prospect details
go only to Praesto's API (see docs/leads.md).

## GTM container configuration (manual)

This can't be done from the repository. In Tag Manager, open **GTM-59723TZZ ›
Workspace**:

**Variables › User-Defined › New › Data Layer Variable** (version 2). Create
one for each of: `page_location`, `page_title`, `page_referrer`, `cta_id`,
`cta_location`, `plan_tier`, `billing_period`, `plan_type`, `form_type`,
`link_type`, `link_domain`, `link_url`. Name each one `DLV - <key>`.

**Triggers › New › Custom Event:**

1. `CE - virtual_page_view`: event name `virtual_page_view`.
2. `CE - praesto events`: event name
   `^(sign_up_click|sign_up_complete|free_trial_start|demo_request|contact_submit|pricing_view|cta_click|outbound_click)$`,
   with **Use regex matching** ticked.

**Tags › New:**

1. **Google tag** (the container already has one, destination "Praesto"; edit
   it rather than adding a second): Tag ID `G-58KVDDCH2W`. Under
   _Configuration settings_, add parameter `send_page_view` = `false`. Trigger:
   **Initialization - All Pages**.
2. **GA4 Event – page_view**: Measurement ID `G-58KVDDCH2W`, Event name
   `page_view`. Event parameters: `page_location` = `{{DLV - page_location}}`,
   `page_title` = `{{DLV - page_title}}`, `page_referrer` =
   `{{DLV - page_referrer}}`. Trigger: `CE - virtual_page_view`.
3. **GA4 Event – custom events**: Measurement ID `G-58KVDDCH2W`, Event name
   `{{Event}}`. Event parameters: every DLV above except `page_title` and
   `page_referrer`, each with the same name. Trigger: `CE - praesto events`.

On all three tags, set **Advanced settings › Consent settings › Require
additional consent for tag to fire: `analytics_storage`**. There is no consent
banner, so visitors in the EEA, UK and Switzerland are not measured at all,
not even with cookieless pings.

Do **not** add a History Change trigger, the All Pages page-view pattern, or
any Custom HTML tag.

**Turn off automatic user-provided data collection.** In the Google tag's
settings (Tag Manager › the Google tag › _Tag settings_ / _Admin › Google tag
› Configure your Google tag_), switch **Allow user-provided data
capabilities** and **Automatic detection** (email, phone, address) off.
`/org-setup` has company email and phone fields.

**Change page views as one unit.** Setting `send_page_view = false`, turning
off Enhanced Measurement's _browser history_ page views (below) and adding
**GA4 Event – page_view** must go into the same published version. With only
some of them, page views are either doubled or missing. Test in **Preview**
(Tag Assistant on `https://praesto.in`): exactly one `page_view` per route.
Then **Submit › Publish**.

## GA4 property settings (manual)

- **Data streams › praesto.in › Enhanced measurement:** turn it **off**, or at
  least turn off _Page changes based on browser history events_, _Outbound
  clicks_, _Form interactions_ and _Site search_. Scrolls may stay on.
- **Configure tag settings › List unwanted referrals:** `accounts.google.com`,
  `checkout.razorpay.com`, `api.razorpay.com`.
- **Configure tag settings › Redact data:** turn on email redaction, and add
  query parameters `access_token`, `token`, `code`.
- **Data collection:** leave Google signals **off**.
- **Key events:** mark `sign_up_complete`, `free_trial_start`, `demo_request`
  and `contact_submit` (each appears in Admin › Events after its first
  occurrence; until then add it under Key events › New key event by name).
  Leave click events (`sign_up_click`, `cta_click`) as ordinary events.
- **Custom definitions › event-scoped custom dimensions:** `cta_id`,
  `cta_location`, `plan_tier`, `billing_period`, `plan_type`, `form_type`,
  `link_type`.
  (`link_domain`/`link_url` are built in.)
- Optional: **Define internal traffic** for the office IP, with a data filter.

## Content-Security-Policy

GTM and GA4 need these sources, added to the existing policy:

| Directive     | Add                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------ |
| `script-src`  | `https://www.googletagmanager.com`                                                               |
| `img-src`     | `https://www.googletagmanager.com https://*.google-analytics.com`                                |
| `connect-src` | `https://www.googletagmanager.com https://*.google-analytics.com https://*.analytics.google.com` |

`cloudformation/amplify-deploy.yaml` and `docker/nginx.conf` carry them. The
live Amplify app (`hrms-web`) is console-managed and its headers have drifted
from the template, so update **Amplify Console › Hosting › Custom headers**
too. Without that, production blocks `gtm.js`.

## Verifying

1. After the CSP and the code are deployed and the container is published:
   Tag Manager › **Preview** › enter `https://praesto.in`. In Tag Assistant,
   expect the _Google tag_ on Initialization, and one _GA4 Event – page_view_
   per route change.
2. GA4 › Admin › **DebugView**: Preview traffic appears there with
   `page_view`, `sign_up_click` and the other events.
3. GA4 › Reports › **Realtime**: open `https://praesto.in` in a normal window
   (no GPC/DNT, not in the EEA/UK) and the visit shows within about 30
   seconds.
4. DevTools › Network, filtered by `collect`: one `/g/collect` with
   `en=page_view` per route. No hit after moving into the app. No `dl=`
   containing anything but path and `utm_*`.
