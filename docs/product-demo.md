# /product-demo

A public page (no sign-in, no subscription, no permission check) where
visitors pick an HRMS module and watch short recordings of the real product.
The videos are HLS adaptive streams, with English and Hindi subtitles and
chapters, served straight from a public S3 bucket (CloudFront is blocked for
now, see below).

- Page: `apps/web/src/features/product-demo/` (`ProductDemo.tsx`,
  `HlsPlayer.tsx`, `catalogue.ts`, generated `manifest.ts`).
- Shared site chrome: `apps/web/src/features/landing/SiteChrome.tsx` (nav
  bar and footer, taken out of `Landing.tsx` unchanged; `home={false}` makes
  section links point at `/#…`).
- Recording and encoding: [`product-demo-assets/README.md`](../product-demo-assets/README.md).

## Status (2026-11-10)

| Piece                                                               | State                                                                                                                                                                                               |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 19 recordings, HLS (1080/720/480/360p), EN + HI subtitles, chapters | Done, validated (`product-demo-assets/validation.json`)                                                                                                                                             |
| S3 bucket `praesto-product-demo-<account>` (ap-south-1)             | 821 objects under `product-demo/`. **Public read** on `product-demo/*` only (bucket policy). Listing is denied, public ACLs stay blocked, CORS allows GET/HEAD from any origin. Holds nothing else. |
| Delivery                                                            | Direct from S3 over HTTPS: `https://praesto-product-demo-<account>.s3.ap-south-1.amazonaws.com/product-demo`. Tested end to end.                                                                    |
| CloudFront                                                          | Not used. Creating a distribution is refused until AWS Support verifies the account. OAC `praesto-product-demo-oac` exists for later.                                                               |
| Web page, route, SEO, sitemap, prerender                            | Done on branch `feature/product-demo` (not merged or deployed)                                                                                                                                      |
| Amplify: env var, CSP, `/product-demo` rewrite                      | **Not applied** (production change, needs approval)                                                                                                                                                 |

Until `VITE_PRODUCT_DEMO_CDN_URL` is set, the page renders fully (modules,
chapters, descriptions) and shows "The demo videos aren’t available right
now" in place of the player.

Trade-offs of serving from S3 without a CDN: no edge caching, so viewers far
from Mumbai start a little slower, and no shield against someone downloading
the files repeatedly. Each GB costs about the same as through CloudFront.

## Go-live steps (each needs approval)

`MEDIA` below is `https://praesto-product-demo-<account>.s3.ap-south-1.amazonaws.com`.

1. **Amplify (app `hrms-web`, console-managed):**
   - Environment variable `VITE_PRODUCT_DEMO_CDN_URL` = `$MEDIA/product-demo`.
   - CSP (custom headers):
     - `media-src 'self' blob: $MEDIA` (new directive. Today there's none,
       so media falls back to `default-src 'self'`, which blocks hls.js's
       `blob:` source and Safari's direct stream.)
     - add `$MEDIA` to `connect-src` (playlists and segments) and to
       `img-src` (thumbnails and posters).
     - `worker-src 'self' blob:` already allows hls.js's worker.
   - Rewrite rule `/product-demo` → `/product-demo.html` (200), before the
     SPA catch-all. It's already in `cloudformation/amplify-rules.json`.
     Without it the page still works, but crawlers get the SPA shell instead
     of the prerendered HTML.

   Keep a copy of `aws amplify get-app --app-id d1of5ebkyz6egu --query
'app.[customRules,customHeaders,environmentVariables]'` before changing
   anything. Custom headers take effect on the next deploy.

2. **Merge** `feature/product-demo` (Amplify builds `main`), then:

   ```sh
   for p in /product-demo /sitemap.xml; do curl -s -o /dev/null -w "%{http_code} $p\n" https://praesto.in$p; done
   curl -s https://praesto.in/product-demo | grep -o '<title>[^<]*'
   curl -s https://praesto.in/sitemap.xml | grep product-demo
   ```

   Then open the page, play a video, and check the browser console for CSP
   errors.

## Moving to CloudFront later (optional)

Once AWS Support verifies the account for CloudFront:

1. Run `bash product-demo-assets/tools/setup-cdn.sh`. It creates the
   distribution (OAC, HTTPS only, CachingOptimized, SimpleCORS), **replaces**
   the public bucket policy with one letting only the distribution read
   `product-demo/*`, and prints the new base URL.
2. Point `VITE_PRODUCT_DEMO_CDN_URL` and the CSP at the CloudFront host, and
   redeploy.
3. Re-enable full Block Public Access on the bucket:
   `aws s3api put-public-access-block --bucket praesto-product-demo-<account> --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true`.

## How the player works

- Nothing streams until the visitor presses play. Before that, only the
  featured video's poster and the lazily loaded card thumbnails are fetched.
  hls.js (173 KB gzip) is a separate chunk loaded on first play.
- Safari (macOS and iOS) plays HLS natively. Everywhere else hls.js plays it
  over Media Source Extensions. On Safari the quality menu offers Auto only,
  because the native player picks the rendition.
- Quality: Auto lets hls.js choose by bandwidth and player size
  (`capLevelToPlayerSize`). Picking a height sets `hls.currentLevel`. The
  list comes from the master playlist. A pinned height carries over to the
  next video if that video has it.
- Buffer: 10–15 s ahead (`maxBufferLength` 10, `maxMaxBufferLength` 15).
- Errors: a playlist that still fails after hls.js's own retries shows
  "couldn’t be loaded" with Try Again. Segment network errors resume up to
  3 times, and media errors go through `recoverMediaError()`.
- Subtitles: `<track>` elements in hidden mode, drawn by the player (same
  look everywhere, Devanagari fonts for Hindi, larger in fullscreen). Tracks
  are only fetched after play.
- Keyboard: Space/K play and pause, ←/→ seek 5 s, J/L seek 10 s, M mute,
  F fullscreen, C subtitles. The seek bar is a slider (arrows, PageUp/Down,
  Home/End). Menus use arrow keys and Escape, and return focus to their
  button.
- `?v=<video id>` opens a specific demo. The canonical URL stays
  `/product-demo`.

## Updating videos

See `product-demo-assets/README.md`: edit `tools/flows.mjs`, then record,
build, validate and upload. Each video's S3 path includes a content
revision, so new uploads never collide with cached old ones. Old revisions
can be deleted from S3 once the new web build is live.
