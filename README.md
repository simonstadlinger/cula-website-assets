# Cula Website Assets

WebP frames extracted from the Cula Technologies website animations (source: 1920×1080 `.mov` files).

---

## Hero scroll animation — performance work (June 2026)

The hero on [cula-tech.framer.website](https://cula-tech.framer.website/) is a scroll-scrubbed
image sequence ("Video Scrubber" Framer code component). It currently stutters because the
component is configured with `frameStep: 8` — only 178 of 1,417 frames are shown. The skip was
necessary because the original frames average **275 KB** (381 MB for the full set).

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

### Frame sets

All sets contain frames `frame_0001` … `frame_1418` (the site uses `sequenceFrameCount: 1417`,
`sequenceStartIndex: 1`, `sequencePadding: 4`, `sequencePrefix: frame_`).

Served via jsDelivr: `https://cdn.jsdelivr.net/gh/simonstadlinger/cula-website-assets@<ref>/<folder>`

**Desktop & tablet** (full 16:9, 1920×1080 source)

| folder | format | size | avg/frame | total @ step 2 |
|---|---|---|---|---|
| `hero-animation-v2` | webp q60 | 1920×1080 | 115 KB | 79 MB |
| `hero-frames/desktop-webp-1600` | webp q60 | 1600×900 | 79 KB | 55 MB |
| `hero-frames/desktop-avif-1920` | avif q45 | 1920×1080 | 78 KB | **54 MB** |
| `hero-frames/desktop-avif-1600` | avif q45 | 1600×900 | 60 KB | 42 MB |

Note: AVIF at full 1920 px costs the same as webp downscaled to 1600 px — full resolution for free.

**Phone** (center-cropped to the cover region, 560×1080)

| folder | format | size | avg/frame | total @ step 2 |
|---|---|---|---|---|
| `hero-frames/mobile-webp-1080` | webp q60 | 560×1080 | 35 KB | 24 MB |
| `hero-frames/mobile-webp-810` | webp q60 | 420×810 | 21 KB | 15 MB |
| `hero-frames/mobile-avif-1080` | avif q45 | 560×1080 | 24 KB | **16 MB** |
| `hero-frames/mobile-avif-810` | avif q45 | 420×810 | 16 KB | 11 MB |

**Reference — what the live site loads today:** `hero-animation` originals (webp q90, 275 KB avg)
at `frameStep: 8` = 49 MB for 178 frames (4× choppier than step 2, and every frame is 2.4–11×
heavier than the optimized sets).

“Total @ step 2” = what a visitor downloads in the background; the loader gate is ~1/8 of that.

### Instructions for the agency (Framer editor)

No component code changes are needed — the existing Video Scrubber supports everything via
props. On the hero's Video Scrubber instance, change per breakpoint:

**Desktop (≥1200 px)** — recommended set: `desktop-avif-1920` (or `hero-animation-v2` to stay on webp)

| prop | value |
|---|---|
| `sequenceBaseURL` | `https://cdn.jsdelivr.net/gh/simonstadlinger/cula-website-assets@main/hero-frames/desktop-avif-1920` |
| `sequenceExtension` | `.avif` (or `.webp` for the webp sets) |
| `frameStep` | **2** |
| `scrollLength` | **5000** (was 3930 — slower motion per pixel reads as smoother; the headline overlay switches at fractions of the region, so it stays in sync) |

**Tablet (768–1199 px)** — same as desktop but `…/hero-frames/desktop-avif-1600` (landscape iPads need wide frames; do not use a mobile set here).

**Phone (<768 px)** — `…/hero-frames/mobile-avif-1080`, `frameStep: 2`. The frames are pre-cropped
to the cover region, so the result looks identical to today, just sharper and far lighter.

All other props stay unchanged. AVIF is supported by all browsers since early 2023; if you prefer
maximum compatibility, the `…webp…` sets are drop-in equivalents at ~30 % more bytes.

**Optional component hardening (one-line fix, not required for the changes above)**

In the Video Scrubber's preloader, the `onerror` handler marks a frame as successfully loaded
(same flag as `onload`). Consequence: if any download fails mid-preload (flaky connection, CDN
hiccup), the component believes the frame is cached and re-requests it from the network on
*every* scroll position that lands on it. Suggested fix in the code component: in the image
preload loop, set the "loaded" flag only in `onload`; in `onerror` just continue the queue
(the existing nearest-loaded-frame fallback already covers missing frames gracefully), or
re-queue the index once for a retry.

**Adopting / rollback**
- The sets live on branch [`hero-v2-preview`](../../tree/hero-v2-preview). Merge it into `main`
  (or reference `@hero-v2-preview` directly) before pointing the site at `@main` URLs.
- For production, pin a commit instead of a moving ref
  (`…/cula-website-assets@<commit-sha>/…`) — jsDelivr caches branch refs for up to 7 days.
- Rollback at any time = revert the props; the original `hero-animation/` folder is untouched.

### Live comparison page

**https://simonstadlinger.github.io/cula-website-assets/** (served from `docs/` on the
`hero-v2-preview` branch; replicates the Framer component's loading and scrubbing 1:1).

Use the panel (top-left) or URL parameters:

| param | values | meaning |
|---|---|---|
| `vp` | `desktop` \| `tablet` \| `mobile` | viewport — tablet/mobile render in a simulated device frame with its own scrollbar (open the page on a real phone for the honest mobile test; it auto-detects) |
| `set` | `webp-full` \| `webp-lo` \| `avif-full` \| `avif-lo` | frame set within the viewport (full = 1920 px desktop / 1080 h mobile; lo = 1600 px / 810 h) |
| `step` | `1`–`8` | `frameStep` — `2` is the proposal, `8` is today's value |
| `len` | px | `scrollLength` — `5000` proposed, `3930` today |
| `live` | `1` | reference mode: exactly what the live site loads today (original frames, step 8) |

The panel shows live stats: frames loaded, loader-gate time, total MB downloaded.

Example comparisons:
- Proposed desktop: [`?vp=desktop&set=avif-full&step=2&len=5000`](https://simonstadlinger.github.io/cula-website-assets/?vp=desktop&set=avif-full&step=2&len=5000)
- Today's behavior: [`?live=1`](https://simonstadlinger.github.io/cula-website-assets/?live=1)
- Proposed phone: [`?vp=mobile&set=avif-full&step=2`](https://simonstadlinger.github.io/cula-website-assets/?vp=mobile&set=avif-full&step=2)

---

## Contents

### `hero-animation/`
Frames of the hero animation, exported as WebP at full **1920×1080** resolution.
- 1418 frames, 30 fps (first 3 and last 2 frames trimmed)
- Named sequentially: `frame_0001.webp` … `frame_1418.webp`
- Encoded with `ffmpeg` (libwebp), quality 90, lossy — **kept as the high-quality master; the
  live site should move to one of the optimized sets above**

### `hero-animation-v2/`, `hero-animation-v2-960/`, `hero-frames/*` *(branch `hero-v2-preview`)*
Optimized derivatives of `hero-animation/` — see the performance section above.
WebP: `cwebp -q 60 -m 6 -sharp_yuv`. AVIF: `avifenc -s 6 -q 45`.
(`hero-animation-v2-960/` is an early resize-only mobile set, superseded by the cropped
`hero-frames/mobile-*` sets.)

### `cover-frames/`
The **first frame** of each card animation, exported as WebP at **1920×1080**:

| File | Source animation |
|------|------------------|
| `cula_technologies_website_card_animation_01_inventory_tracking_1920px_1080px.webp` | Inventory tracking |
| `cula_technologies_website_card_animation_02_onsite_integrations_1920px_1080px.webp` | Onsite integrations |
| `cula_technologies_website_card_animation_03_unit_quality_management_1920px_1080px.webp` | Unit quality management |
| `cula_technologies_website_card_animation_04_biochar_production_1920px_1080px.webp` | Biochar production |
| `cula_technologies_website_card_animation_05_01_emissions_1920px_1080px.webp` | Emissions (01) |
