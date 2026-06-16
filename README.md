# Cula Website Assets

WebP frames extracted from the Cula Technologies website animations (source: 1920×1080 `.mov` files).

---

## Hero scroll animation — performance work (June 2026)

The hero on [cula-tech.framer.website](https://cula-tech.framer.website/) is a scroll-scrubbed
image sequence (the "Video Scrubber 3" Framer code component, exported as `ScrollVideo`). It is
currently configured with `frameStep: 1` on the original `hero-animation` set (webp q90,
**275 KB** average), so a visitor downloads every one of the 1,417 frames — roughly **390 MB**.
The originals were never optimized for the web, which forces a long wait before the animation is
ready and a heavy ongoing transfer. The fix is a lighter frame set so a low `frameStep` (smooth
motion) stays affordable: at full quality you either pay ~390 MB at step 1 or accept the choppiness
of a high step on the originals — the optimized sets below remove that trade-off.

### What we did

1. **Re-encoded the frames** (same 1,418 source frames, same numbering) into several optimized
   sets — smaller files at visually identical quality, so a much lower `frameStep` becomes
   affordable. See the table below.
2. **Pre-cropped the mobile sets.** The component renders with `object-fit: cover`; on phones
   (<768 px breakpoint, portrait) ~74 % of every downloaded frame is cropped away by CSS.
   The mobile sets are center-cropped to 560×1080 (aspect 0.52, slight margin so cover still
   fine-trims across phone shapes) — same on-screen pixels, ~⅓ of the bytes, and *sharper*
   than downscaling the full wide frame.
3. **No tablet-specific set, on purpose.** The tablet breakpoint (768–1199 px) includes
   landscape iPads, which need the full wide frame. Tablets should use the desktop 1600 px set.
4. **Built a comparison page** (GitHub Pages, see below) replicating the component's exact
   loading & scrubbing behavior, so every set/step/scroll-length combination can be felt and
   measured before touching the Framer project.

### Frame sets — the shipped sets

Three AVIF sets, one per breakpoint, all `avifenc -s 6 -q 45`. Each contains frames
`frame_0001` … `frame_1418` (the site uses `sequenceFrameCount: 1417`, `sequenceStartIndex: 1`,
`sequencePadding: 4`, `sequencePrefix: frame_`).

Served via jsDelivr: `https://cdn.jsdelivr.net/gh/simonstadlinger/cula-website-assets@<ref>/<folder>`

| folder | breakpoint | dimensions | avg/frame | total @ step 2 |
|---|---|---|---|---|
| `hero/desktop` | desktop ≥1200 px | 1920×1080 (full 16:9) | 78 KB | **54 MB** |
| `hero/tablet`  | tablet 768–1199 px | 1600×900 (full 16:9) | 60 KB | **42 MB** |
| `hero/mobile`  | phone <768 px | 560×1080 (pre-cropped to cover) | 24 KB | **16 MB** |

Notes:
- AVIF at full 1920 px costs about the same as webp downscaled to 1600 px — full resolution for free,
  which is why AVIF won over the webp candidates that were evaluated.
- Tablet uses the 1600 px set, **not** a mobile set: the 768–1199 px breakpoint includes landscape
  iPads, which need the full wide frame.
- The mobile set is center-cropped to the cover region (560×1080). The component renders with
  `object-fit: cover`; on phones ~74 % of a full wide frame is cropped away by CSS, so cropping at
  encode time gives the same on-screen pixels at ~⅓ of the bytes, and *sharper* than downscaling.

**Reference — what the live site loads today:** `hero-animation` originals (webp q90, 275 KB avg)
at `frameStep: 1` = **~390 MB** for all 1,417 frames, nothing skipped. (It was previously
`frameStep: 8` = 49 MB for 178 frames, which was 4× choppier than step 2.) Either way every
frame is 2.4–11× heavier than the optimized sets.

"Total @ step 2" = what a visitor downloads in the background; the loader gate (dense head +
every-8th skeleton) is roughly a quarter of that before the animation becomes interactive.

### Instructions for the agency (Framer editor)

No component code changes are needed — the existing Video Scrubber supports everything via
props. On the hero's Video Scrubber instance, change per breakpoint:

**Desktop (≥1200 px)** — set `hero/desktop`

| prop | value |
|---|---|
| `sequenceBaseURL` | `https://cdn.jsdelivr.net/gh/simonstadlinger/cula-website-assets@main/hero/desktop` |
| `sequenceExtension` | `.avif` |
| `frameStep` | **2** |
| `scrollLength` | **5000** (was 3930 — slower motion per pixel reads as smoother; the headline overlay switches at fractions of the region, so it stays in sync) |

**Tablet (768–1199 px)** — same as desktop but `…/hero/tablet` (1600 px; landscape iPads need wide frames; do not use the mobile set here).

**Phone (<768 px)** — `…/hero/mobile`, `frameStep: 2`. The frames are pre-cropped
to the cover region, so the result looks identical to today, just sharper and far lighter.

All other props stay unchanged. AVIF is supported by all browsers since early 2023.

**Optional component upgrade: [`framer/VideoScrubber.tsx`](framer/VideoScrubber.tsx)**

A drop-in replacement for the "Video Scrubber 3" code file (identical props, controls, and
rendering, and it keeps the same `ScrollVideo` export so existing instances stay bound). To
adopt: open the code component in Framer and replace the file contents. It fixes/improves two
things:

1. **Smarter loader gate.** The original gates the loading bar only on every 8th frame, so
   right after the bar disappears the animation is uniformly chunky. The replacement preloads
   the *first 15 % of frames densely* (what visitors scrub first) **plus** the every-8th
   skeleton, then backfills the rest in the background. The percentage is a new instance prop
   (`Gate Head %`, default 15; `0` = original behavior). Try it on the comparison page via the
   "gate head" toggle or `?head=15`.
2. **`onerror` bug fix.** The original marks failed downloads as successfully loaded, so a
   frame that failed once (flaky connection, CDN hiccup) is re-requested from the network on
   every scroll position that lands on it. The replacement only marks frames loaded in
   `onload`; missing frames are covered by the existing nearest-loaded-frame fallback.

**Adopting / rollback**
- The `hero/` sets live on `main`. Reference `@main` URLs (above), or — recommended — pin a tag/commit.
- For production, pin a commit or tag instead of a moving branch ref
  (`…/cula-website-assets@<commit-sha>/…`). jsDelivr only marks commit/tag refs as immutable
  (`Cache-Control: max-age=31536000, immutable`); a branch ref like `@main` is held only ~12 h
  at the CDN edge (`s-maxage=43200`), so frames go cold and reload slowly (~300 ms–1 s each)
  roughly every day until the edge re-warms.
- Rollback at any time = revert the props; the original `hero-animation/` folder is untouched.

### Live comparison page

**https://simonstadlinger.github.io/cula-website-assets/** (served from `docs/`;
replicates the Framer component's loading and scrubbing 1:1).

Use the panel (top-left) or URL parameters:

| param | values | meaning |
|---|---|---|
| `vp` | `desktop` \| `tablet` \| `mobile` | viewport — tablet/mobile render in a simulated device frame with its own scrollbar (open the page on a real phone for the honest mobile test; it auto-detects) |
| `set` | `avif-full` \| `avif-lo` | frame set within the viewport — `avif-full` = `hero/desktop` (1920) or `hero/mobile` (1080); `avif-lo` = `hero/tablet` (1600). Tablet defaults to `avif-lo`. |
| `step` | `1`–`8` | `frameStep` — `2` is the proposal, `8` is today's value |
| `len` | px | `scrollLength` — `5000` proposed, `3930` today |
| `head` | `0`–`100` | % of frames the loader gates densely from the start (see component upgrade below) — `15` proposed, `0` = current component behavior |
| `lock` | `1` \| `0` | blocking loading screen — when on, scroll is locked behind a centered loading bar until the gate is ready (lets you feel the wait a visitor would experience). Default on, except in `live` mode. The current production component does **not** block (`0`). |
| `live` | `1` | reference mode: exactly what the live site loads today (original frames, step 1, no dense head, no blocking screen) |

The panel shows live stats: frames loaded, loader-gate time, total MB downloaded.

Example comparisons:
- Proposed desktop: [`?vp=desktop&set=avif-full&step=2&len=5000`](https://simonstadlinger.github.io/cula-website-assets/?vp=desktop&set=avif-full&step=2&len=5000)
- Today's behavior: [`?live=1`](https://simonstadlinger.github.io/cula-website-assets/?live=1)
- Proposed phone: [`?vp=mobile&set=avif-full&step=2`](https://simonstadlinger.github.io/cula-website-assets/?vp=mobile&set=avif-full&step=2)

---

## Contents

### `hero/` — the shipped scrubber sets
The three AVIF frame sets the site loads, one per breakpoint (`avifenc -s 6 -q 45`):
- `hero/desktop` — 1920×1080, desktop ≥1200 px
- `hero/tablet`  — 1600×900, tablet 768–1199 px
- `hero/mobile`  — 560×1080 (pre-cropped to the cover region), phone <768 px

Each has frames `frame_0001.avif` … `frame_1418.avif`. See the performance section above for the
rationale and the agency wiring. Other candidate sets (webp tiers, 810 px / 960 px variants) were
evaluated on the comparison page and dropped; only these three ship.

### `hero-animation/`
Frames of the hero animation, exported as WebP at full **1920×1080** resolution.
- 1418 frames, 30 fps (first 3 and last 2 frames trimmed)
- Named sequentially: `frame_0001.webp` … `frame_1418.webp`
- Encoded with `ffmpeg` (libwebp), quality 90, lossy — **this is the set the live site still loads
  today; kept as the production/rollback source until the agency cuts over to the `hero/` sets,
  then it can be removed.**

### `cover-frames/`
The **first frame** of each card animation, exported as WebP at **1920×1080**:

| File | Source animation |
|------|------------------|
| `cula_technologies_website_card_animation_01_inventory_tracking_1920px_1080px.webp` | Inventory tracking |
| `cula_technologies_website_card_animation_02_onsite_integrations_1920px_1080px.webp` | Onsite integrations |
| `cula_technologies_website_card_animation_03_unit_quality_management_1920px_1080px.webp` | Unit quality management |
| `cula_technologies_website_card_animation_04_biochar_production_1920px_1080px.webp` | Biochar production |
| `cula_technologies_website_card_animation_05_01_emissions_1920px_1080px.webp` | Emissions (01) |
