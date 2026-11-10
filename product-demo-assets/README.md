# Product demo assets

The videos on [`/product-demo`](../apps/web/src/features/product-demo/) are
recorded from the real Praesto web app, encoded as HLS, and served from S3
through CloudFront. This folder holds the tooling; the recordings and HLS
output it generates are git-ignored and live in S3.

**Runbook (deploying, CDN, CSP, approvals):** [`docs/product-demo.md`](../docs/product-demo.md).

## How a video is made

| Step               | Command                                               | Output                                                                                                             |
| ------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 1. Run the web app | `cd apps/web && npx vite --port 5199`                 |                                                                                                                    |
| 2. Narrate         | `node product-demo-assets/tools/narrate.mjs`          | `.narration/<lang>/*.mp3`, `narration.json` (clip durations)                                                       |
| 3. Record          | `node product-demo-assets/tools/record.mjs [id …]`    | `<module>/<id>/source.mp4`, `timeline.json`                                                                        |
| 4. Encode          | `node product-demo-assets/tools/build-hls.mjs [id …]` | HLS with narration tracks, subtitles, thumbnail, `manifest.json`, `apps/web/src/features/product-demo/manifest.ts` |
| 5. Validate        | `node product-demo-assets/tools/validate-hls.mjs`     | `validation.json` (exits 1 on any failure)                                                                         |
| 6. Upload          | `node product-demo-assets/tools/upload.mjs`           | `s3://praesto-product-demo-<account>/product-demo/…`                                                               |

Helpers for writing flows: `survey.mjs <path…>` screenshots screens with the
fixtures, `probe.mjs <path…>` lists API calls the fixtures don't answer, and
`labels.mjs <path…>` prints a screen's controls.

`cdn-local.mjs` serves the same keys locally (with CloudFront's headers) for
testing before the CDN exists.

### Recording (`tools/record.mjs`, `tools/flows/*.mjs`)

41 videos in 12 modules (`tools/modules.mjs`). The flows live in
`tools/flows/` (`start`, `people`, `work`, `admin`), with shared helpers in
`common.mjs`. Each one explains what the feature is for, how to use it and
what it solves. Helpers: `r.navigate(path)` moves between screens without a
page load, and `r.optional(label, fn)` runs a nice-to-have step and records
it in `skippedSteps` if its element isn't there. Onboarding videos use the
`ONBOARDING()` fixtures in `extras.mjs`: a signed-in user with no
organisation, switched mid-video to "trial started, contact details pending".

- **Real app, fictional data.** Chromium runs the actual web build. Every
  `/api` request is answered _in the browser_ by the marketing library's
  fictional "Halcyon Labs" fixtures (`~/Downloads/marketing/tools/fixtures.mjs`)
  plus `tools/extras.mjs`. No request reaches a backend or database, so a
  recording can't read real data, change a record, send a notification or
  run payroll. Sockets, Firebase and analytics are blocked. `timeline.json`
  lists the writes each flow made (all answered by fixtures).
- **One flow per video.** Each flow in `flows.mjs` drives the UI like a
  person: a visible pointer glides and clicks, and text is typed. Loading
  happens before the first frame.
- **Chapters and subtitles are timed by the recording.** A flow calls
  `rec.chapter(title)` and `rec.say(english, hindi)` while it runs, so the
  timestamps are where things actually happen on screen. `PACE` (default
  1.35) stretches the pauses for reading time.
- 1440×810 CSS px at a device scale of 4/3 gives 1920×1080 frames with UI at a
  readable size. Frames are full-resolution screenshots in a loop (about
  35–39 fps captured), laid on a constant 30 fps timeline, then encoded as an
  H.264 CRF 14 mezzanine.

### Narration (`tools/narrate.mjs`, `tools/glossary.mjs`)

- Every cue is spoken in both languages by Amazon Polly's generative voice
  **Kiara** (Indian English and Hindi), on the existing AWS account. Clips
  are cached by voice, language and text, so only changed lines are
  re-synthesised.
- The English narration reads the English subtitle. "Praesto" is respelled
  "Praysto" so it's said PRAY-stoh.
- The Hindi narration reads the Hindi subtitle with each English term
  written in Devanagari for the narrator (`glossary.mjs`: "Today" → "टुडे",
  "Approve" → "अप्रूव", "Praesto" → "प्रेस्टो"). The subtitles themselves
  keep the English terms. Read as Latin script, the voice mispronounced them
  (speech-to-text heard "Today" as "तोड़े"). An English word missing from
  the glossary stops `narrate.mjs`.
- **Paced to the speech:** in `record.mjs`, `rec.say()` and `rec.chapter()`
  wait until the previous line has been spoken in _both_ languages (the
  longer one, plus 0.45 s). The UI keeps moving while the narrator talks,
  and neither language is ever cut off.

### Encoding (`tools/build-hls.mjs`)

One ffmpeg pass per video, split into renditions (never upscaled):

| Rendition | Size      | Target / max bitrate | Profile  |
| --------- | --------- | -------------------- | -------- |
| 1080p     | 1920×1080 | 3200 / 4500 kb/s     | High 4.0 |
| 720p      | 1280×720  | 1800 / 2600 kb/s     | High 3.1 |
| 480p      | 854×480   | 900 / 1300 kb/s      | Main 3.0 |
| 360p      | 640×360   | 550 / 800 kb/s       | Main 3.0 |

- H.264 (libx264 `-preset slow -tune animation`), yuv420p, 30 fps.
- Closed GOPs of 120 frames with a keyframe forced every 4 s on the same
  timestamps in every rendition (`-force_key_frames expr:gte(t,n_forced*4)`,
  `-sc_threshold 0`). Every segment starts on a keyframe and boundaries
  match across renditions, so quality can switch at any segment.
- HLS v7 VOD with fMP4/CMAF segments (`init.mp4` plus `segment_NNN.m4s`) of
  4 s. The master has `INDEPENDENT-SEGMENTS`, `BANDWIDTH`, `CODECS`,
  `RESOLUTION` and `FRAME-RATE`.
- Two narration tracks as HLS alternate audio renditions in one group
  (`EXT-X-MEDIA TYPE=AUDIO`, English default, Hindi; `AUTOSELECT=YES`).
  Each is the cue clips placed at their cue times, loudness-normalised to
  −16 LUFS (−1.5 dBTP), AAC-LC mono 96 kb/s at 48 kHz, in 4 s fMP4
  segments. Every video variant references the group, and its `CODECS`
  includes `mp4a.40.2`.
- WebVTT subtitles: `subtitles/en.vtt` and `subtitles/hi.vtt`, with
  identical cue timings.
- A 1280×720 `thumbnail.jpg`, taken 1.5 s into the second chapter.
- Manifest paths include a content revision (`<module>/<id>/<rev>/`), so
  objects can be cached as immutable for a year.

### Hindi subtitles

Each cue is written in Hindi alongside the English, not machine-translated.
Product and UI terms stay in English as the app shows them (Attendance,
Geofencing, Payroll, Role-Based Access Control, WebAuthn, Approve…). The
Hindi around them is plain conversational Hindi. The validator checks that
every Hindi cue contains Devanagari and matches its English cue's timing.

### Adding or changing a video

Edit `tools/flows.mjs` (and `tools/modules.mjs` for a new module). Then run
steps 2–5 for that id, commit `manifest.json`, `validation.json` and the
regenerated `manifest.ts`, and deploy the web app. Old revisions stay in S3
until you delete them.

## The complete tour (`tools/film.mjs`)

One film of the whole product ("Praesto: The Complete Tour", about 18 min)
for YouTube and for anyone who wants the full demo in one sitting. The page
features it above the modules (`?v=praesto-tour`).

- `tools/film/script.mjs`: the scenes in order. Title and info cards with
  their narration lines (English and Hindi), and, for each module, a section
  card followed by cuts from the recordings. Cuts go from one chapter up to
  another, so no sentence is clipped, and they bring their own narration and
  subtitles.
- `tools/film/cards.mjs`: the cards as HTML at 1920×1080 (the opening mark,
  "spread across too many places → one workspace", the agenda, a card per
  part, the outro and the end lockup), the window frame the recordings play
  in, and the YouTube thumbnail. Motion is CSS animation; film.mjs pauses
  every animation and steps it frame by frame, so the capture is exactly
  30 fps.
- Between two topics of a part, a short "next topic" screen names what's
  coming, says what it's for, and lists the part's topics with this one lit
  (done, current, still to come). A clip slides away to it, and it dissolves
  into the next clip.
- `tools/film/sfx.mjs`: the sound effects, synthesised with FFmpeg (nothing
  to license). A whoosh and a two-note chime open each part, the pitch and
  the outro, and a swipe and a soft tick mark each next topic. The opening
  mark rises in with a swell. They sit under the narration in both language
  tracks (`sfx` in the film's timeline; build-hls.mjs mixes them in).
- `tools/film/icons.json`: the module icons, scraped from the web app by
  `tools/film/scrape-icons.mjs`.

```sh
node tools/film.mjs --preview   # stills of every card in film/preview/
node tools/film.mjs             # render; scenes are cached in film/.work/
node tools/build-hls.mjs --manifest-only && node tools/validate-hls.mjs && node tools/upload.mjs
```

Output: `film/praesto-tour/` (HLS, like the demos: 1080p–360p, English and
Hindi narration, subtitles, chapters) and `film/youtube/`:
`praesto-tour-en.mp4`, `praesto-tour-hi.mp4`, `praesto-tour-<lang>.vtt`,
`thumbnail.jpg` and `description.txt` (title, links and YouTube chapters).

The film has sound effects but no music. To add music, use a track you
hold a licence for, mixed under the narration.
