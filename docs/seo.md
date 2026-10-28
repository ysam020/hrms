# SEO and the public pages

praesto.in is one Vite + React SPA (apps/web). The public pages — `/`,
`/privacy-policy`, `/terms-of-use`, `/refund-policy` — are **prerendered at
build time** so crawlers, link previews and first paint get real HTML. The
signed-in app is unchanged.

## How it works

| Piece                     | Role                                                                                                                                                                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/app/seo.ts`          | One table of public pages (title, description, `prerender`). `applyPageMeta` keeps `<head>` in step on client navigation; any route that isn't public (or a careers page) gets `<meta name="robots" content="noindex">`.                         |
| `src/prerender/entry.tsx` | Renders those pages with `renderToString` as an anonymous visitor, plus the landing page's JSON-LD (Organization, WebSite, SoftwareApplication with the published monthly prices from `@web/shared/constants/billing`).                          |
| `scripts/prerender.mjs`   | After `vite build`: writes `dist/index.html` (landing) and `dist/<page>.html`, each with canonical, Open Graph/Twitter tags, the route's CSS and chunk preloads, and `dist/sitemap.xml`.                                                         |
| `SessionRoot`             | Public pages render while the session is checked instead of behind the boot spinner (except a Google sign-in return).                                                                                                                            |
| Guard in `<head>`         | `dist/index.html` is also the SPA fallback and the service worker's shell. If the URL isn't the page the file was built for, an inline script hides the prerendered markup and shows the loader, so `/dashboard` never flashes the landing page. |

The app still mounts with `createRoot` and replaces the markup (no
hydration), so the session and offline providers don't need to run on the
server. A page that arrived prerendered skips its entrance animations
(`arrivedPrerendered`) because its content is already on screen.

**Adding a public page:** add it to `PUBLIC_PAGES` with `prerender: true`, to
`PAGES` in `src/prerender/entry.tsx`, to `ROUTE_MODULE` in
`scripts/prerender.mjs`, and add an Amplify rewrite `/<page>` → `/<page>.html`
(below). `src/__tests__/seo.test.ts` checks every public page is a real route.

## Hosting rules (Amplify app `hrms-web`, console-managed)

`cloudformation/amplify-deploy.yaml` holds the intended rules, but the live
app isn't managed by a stack, so they are applied by hand. Order matters
(first match wins):

```json
[
  {
    "source": "https://www.praesto.in",
    "target": "https://praesto.in",
    "status": "301"
  },
  {
    "source": "/privacy-policy",
    "target": "/privacy-policy.html",
    "status": "200"
  },
  {
    "source": "/terms-of-use",
    "target": "/terms-of-use.html",
    "status": "200"
  },
  {
    "source": "/refund-policy",
    "target": "/refund-policy.html",
    "status": "200"
  },
  {
    "source": "</^[^.]+$|\\.(?!(css|gif|ico|jpg|jpeg|js|png|txt|xml|svg|webp|wasm|woff|woff2|ttf|map|json)$)([^.]+$)/>",
    "target": "/index.html",
    "status": "200"
  }
]
```

The same list is `cloudformation/amplify-rules.json`. The page rewrites need
the build that creates `<page>.html`, so apply them once that's deployed:

```sh
aws amplify update-app --region ap-south-1 --app-id d1of5ebkyz6egu \
  --custom-rules file://cloudformation/amplify-rules.json
```

To roll back, re-apply the previous list (`aws amplify get-app … --query
app.customRules` before changing it, and keep the output).

The rules it replaces (`/<*>` → `/index.html`, `404-200`) made every path
except `/` answer `301` to a trailing-slash URL and then `404`.

After applying, check:

```sh
for p in / /privacy-policy /terms-of-use /refund-policy /sitemap.xml /robots.txt /dashboard; do
  curl -s -o /dev/null -w "%{http_code} $p\n" "https://praesto.in$p"; done   # all 200
curl -sI https://www.praesto.in/terms-of-use | grep -i -E "^HTTP|^location"   # 301 → https://praesto.in/terms-of-use
curl -s https://praesto.in/terms-of-use | grep -o "<h1[^>]*>[^<]*"            # the page's own H1
```
