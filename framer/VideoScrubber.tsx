// Drop-in replacement for the project's "Video Scrubber 3" code component.
// Identical to the live ScrollVideo component except for two changes:
//
//   1. Smarter loader gate. The original gated the loader overlay on an
//      every-8th-frame skeleton only, so the moment the bar disappeared the
//      whole animation was uniformly chunky. This version gates on the FIRST
//      `gateHeadPercent` % of frames at full density (what visitors scrub
//      first) PLUS the every-8th skeleton, then backfills the rest in the
//      background. New optional prop `gateHeadPercent` (default 15; 0 = the
//      original skeleton-only behavior).
//   2. onerror bug fix. The original marked failed downloads as loaded, so a
//      frame that failed once was snapped to (and re-requested) on every
//      scroll position landing on it instead of falling back to a good
//      neighbor. Failures are no longer marked loaded.
//
// To adopt: open the "Video Scrubber 3" code file in Framer and replace its
// contents with this file. Props, controls and rendering are otherwise
// identical, so existing instances keep working.

import { useEffect, useRef, useState, startTransition } from "react"
import { motion } from "framer-motion"
import { addPropertyControls, ControlType, RenderTarget } from "framer"

/**
 * @framerDisableUnlink
 * @framerSupportedLayoutWidth any-prefer-fixed
 * @framerIntrinsicWidth 600
 * @framerSupportedLayoutHeight any-prefer-fixed
 * @framerIntrinsicHeight 400
 */
export default function ScrollVideo({
    sourceType,
    videoFileSourceType,
    videoSrcURL,
    videoSrcFile,
    sequenceBaseURL,
    sequencePrefix,
    sequenceExtension,
    sequencePadding,
    sequenceStartIndex,
    sequenceFrameCount,
    frameStep,
    gateHeadPercent,
    showLoader,
    scrollLength,
    alignment,
    startOn,
    fit,
}) {
    const videoRef = useRef(null)
    const imgRef = useRef(null)
    const containerRef = useRef(null)
    const containerTopRef = useRef(0)
    const containerHeightRef = useRef(0)
    const currentIndexRef = useRef(-1)
    const pendingRef = useRef(null)
    const lastWidthRef = useRef(0)
    const loadedRef = useRef(null) // Uint8Array: 1 = frame loaded
    const imagesRef = useRef([]) // hold references so the browser keeps them cached
    const [measured, setMeasured] = useState(false)
    const [loaderProgress, setLoaderProgress] = useState(0)
    const [loaderDone, setLoaderDone] = useState(false)

    const isOnCanvas = RenderTarget.current() === RenderTarget.canvas

    // Read the zoom ratio set by the page-level zoom script.
    // getBoundingClientRect() returns zoomed pixels; pageYOffset stays in
    // layout pixels. Dividing rect values by this ratio puts both in the
    // same coordinate space.
    const getZoom = () => {
        const raw = getComputedStyle(document.documentElement).getPropertyValue(
            "--zoom-ratio"
        )
        const parsed = parseFloat(raw)
        return parsed > 0 ? parsed : 1
    }

    // Build the array of frame URLs from the pattern, stepping by frameStep
    // so "every Nth frame" reduces both count and payload.
    const frameURLs = (() => {
        if (sourceType !== "sequence") return []
        const step = Math.max(1, frameStep)
        const urls = []
        for (let i = 0; i < sequenceFrameCount; i += step) {
            const num = sequenceStartIndex + i
            const padded = String(num).padStart(sequencePadding, "0")
            const base = sequenceBaseURL.endsWith("/")
                ? sequenceBaseURL
                : sequenceBaseURL + "/"
            const ext = sequenceExtension.startsWith(".")
                ? sequenceExtension
                : "." + sequenceExtension
            urls.push(`${base}${sequencePrefix}${padded}${ext}`)
        }
        return urls
    })()

    // A key that changes whenever the sequence definition changes.
    const sequenceKey = frameURLs.length ? frameURLs[0] + frameURLs.length : ""

    // Measure the container, normalizing rect values by the zoom ratio.
    const measure = () => {
        if (!containerRef.current) return
        const zoom = getZoom()
        const rect = containerRef.current.getBoundingClientRect()
        containerTopRef.current = window.pageYOffset + rect.top / zoom
        containerHeightRef.current = rect.height / zoom
    }

    // Find the nearest loaded frame to the target index, searching outward.
    // During the progressive load this snaps scrubbing to available frames.
    const nearestLoaded = (idx) => {
        const loaded = loadedRef.current
        if (!loaded) return idx
        if (loaded[idx]) return idx
        for (let d = 1; d < loaded.length; d++) {
            if (idx - d >= 0 && loaded[idx - d]) return idx - d
            if (idx + d < loaded.length && loaded[idx + d]) return idx + d
        }
        return idx
    }

    // Compute the correct frame for the current scroll position and apply it.
    const syncToScroll = () => {
        const height = containerHeightRef.current
        if (!height) return
        const progress = (window.pageYOffset - containerTopRef.current) / height
        const clamped = Math.max(0, Math.min(1, progress))

        if (sourceType === "video") {
            const video = videoRef.current
            if (!video) return
            const apply = () => {
                video.currentTime = clamped * (video.duration || 0)
            }
            if (video.readyState >= 1) apply()
            else video.addEventListener("loadedmetadata", apply, { once: true })
        } else {
            if (!frameURLs.length || !imgRef.current) return
            const target = Math.min(
                frameURLs.length - 1,
                Math.floor(clamped * frameURLs.length)
            )
            const idx = nearestLoaded(target)
            if (idx === currentIndexRef.current) return
            currentIndexRef.current = idx
            imgRef.current.src = frameURLs[idx]
        }
    }

    // Force scroll to top on every load, before paint, so the sequence
    // always starts at frame 1. Disables browser scroll restoration so
    // reloads don't jump to the previous position.
    useEffect(() => {
        if ("scrollRestoration" in window.history) {
            window.history.scrollRestoration = "manual"
        }
        window.scrollTo(0, 0)
    }, [])

    // Measure container, then immediately sync to current scroll position.
    useEffect(() => {
        lastWidthRef.current = window.innerWidth
        measure()
        startTransition(() => setMeasured(true))
        syncToScroll()
    }, [scrollLength, sourceType, sequenceKey])

    // Re-measure on resize — but only when the width actually changed.
    // Mobile Safari fires resize when the bottom bar collapses/expands on
    // scroll, which changes only the height. Re-measuring then shifts
    // containerTop mid-scroll and makes the sequence replay. Width-only
    // guard ignores bar collapse while still catching rotation and real
    // resizes (which the zoom script also responds to).
    useEffect(() => {
        const onResize = () => {
            if (window.innerWidth === lastWidthRef.current) return
            lastWidthRef.current = window.innerWidth
            measure()
            syncToScroll()
        }
        window.addEventListener("resize", onResize)
        return () => window.removeEventListener("resize", onResize)
    }, [sourceType, sequenceKey])

    // Progressive preloader with a concurrency cap.
    // The gate — what the loader overlay waits for — is the FIRST
    // `gateHeadPercent` % of frames at full density (the part visitors scrub
    // first) PLUS an every-8th skeleton across the whole range so the rest of
    // the timeline has coarse coverage immediately. Everything else backfills
    // in the background afterward. Scrubbing snaps to the nearest loaded frame
    // and sharpens as the backfill completes. The loader overlay (if enabled)
    // releases once the gate is loaded.
    useEffect(() => {
        if (sourceType !== "sequence" || !frameURLs.length || isOnCanvas) return

        let cancelled = false
        const total = frameURLs.length
        loadedRef.current = new Uint8Array(total)
        imagesRef.current = new Array(total)
        currentIndexRef.current = -1

        const CONCURRENCY = 10

        // Partition into the gate (dense head + every-8th skeleton + last
        // frame, so end-of-scroll always has a target) and the remainder.
        const headCount = Math.ceil(
            (Math.max(0, Math.min(100, gateHeadPercent)) / 100) * total
        )
        const inGate = new Uint8Array(total)
        const gate = []
        for (let i = 0; i < total; i++) {
            if (i < headCount || i % 8 === 0 || i === total - 1) {
                inGate[i] = 1
                gate.push(i)
            }
        }
        const rest = []
        for (let i = 0; i < total; i++) if (!inGate[i]) rest.push(i)

        const loadBatch = (indices, onProgress) =>
            new Promise<void>((resolve) => {
                if (!indices.length) return resolve()
                let next = 0
                let active = 0
                const launch = () => {
                    while (active < CONCURRENCY && next < indices.length) {
                        const i = indices[next++]
                        active++
                        const img = new Image()
                        imagesRef.current[i] = img
                        const settle = (ok) => () => {
                            active--
                            if (cancelled) return
                            // onerror must NOT mark the frame loaded: a failed
                            // frame stays unloaded so the nearest-loaded
                            // fallback bridges past it (and a later remount can
                            // retry), instead of snapping to a broken frame.
                            if (ok) loadedRef.current[i] = 1
                            if (onProgress) onProgress()
                            if (next >= indices.length && active === 0)
                                resolve()
                            else launch()
                        }
                        img.onload = settle(true)
                        img.onerror = settle(false)
                        img.src = frameURLs[i]
                    }
                }
                launch()
            })

        let loadedCount = 0
        let lastPercent = -1
        const onGateProgress = () => {
            loadedCount++
            const percent = Math.round((loadedCount / gate.length) * 100)
            if (percent === lastPercent) return
            lastPercent = percent
            startTransition(() => setLoaderProgress(percent))
        }

        startTransition(() => {
            setLoaderProgress(0)
            setLoaderDone(false)
        })

        // Load the gate first and release the overlay, then backfill the rest;
        // re-sync after each so the visible frame sharpens as density grows.
        const run = async () => {
            await loadBatch(gate, onGateProgress)
            if (cancelled) return
            startTransition(() => setLoaderDone(true))
            syncToScroll()

            await loadBatch(rest, null)
            if (cancelled) return
            currentIndexRef.current = -1
            syncToScroll()
        }
        run()

        return () => {
            cancelled = true
            imagesRef.current.forEach((img) => {
                if (img) img.src = ""
            })
            imagesRef.current = []
        }
    }, [sourceType, sequenceKey, isOnCanvas, gateHeadPercent])

    // Video: seek-on-enter via IntersectionObserver.
    useEffect(() => {
        if (sourceType !== "video") return
        let options = {}
        if (startOn === "top") options = { threshold: 0 }
        else if (startOn === "center") options = { threshold: 0.5 }
        else if (startOn === "bottom") options = { threshold: 1 }

        const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting && videoRef.current) {
                const zoom = getZoom()
                const scrollPosition =
                    window.pageYOffset + entry.boundingClientRect.top / zoom
                const progress =
                    (scrollPosition - containerTopRef.current) /
                    containerHeightRef.current
                const clamped = Math.max(0, Math.min(1, progress))
                videoRef.current.currentTime =
                    clamped * (videoRef.current.duration || 0)
            }
        }, options)

        if (videoRef.current) observer.observe(videoRef.current)
        return () => {
            if (videoRef.current) observer.unobserve(videoRef.current)
        }
    }, [sourceType, startOn, measured])

    // Scroll → write video currentTime OR swap image src, throttled to one write per frame.
    useEffect(() => {
        const onScroll = () => {
            if (pendingRef.current !== null) return
            pendingRef.current = requestAnimationFrame(() => {
                pendingRef.current = null
                syncToScroll()
            })
        }
        window.addEventListener("scroll", onScroll, { passive: true })
        return () => {
            window.removeEventListener("scroll", onScroll)
            if (pendingRef.current !== null) {
                cancelAnimationFrame(pendingRef.current)
                pendingRef.current = null
            }
        }
    }, [sourceType, sequenceKey])

    const videoSrc = videoFileSourceType === "url" ? videoSrcURL : videoSrcFile

    const alignmentStyles = {
        center: { top: "50%", transform: "translateY(-50%)" },
        top: { top: 0 },
        bottom: { bottom: 0 },
    }

    // Sticky media fills the small viewport: 100lvh excludes mobile Safari's
    // collapsible bars, so the media never resizes when the bar hides on
    // scroll. Divided by the zoom ratio to match the unzoomed layout space.
    const mediaStyle = {
        width: "100%",
        height: "calc(100lvh / var(--zoom-ratio, 1))",
        position: "sticky",
        objectFit: fit,
        ...alignmentStyles[alignment],
    }

    const showLoaderOverlay =
        sourceType === "sequence" && showLoader && !loaderDone && !isOnCanvas

    return (
        <motion.div
            ref={containerRef}
            style={{ height: scrollLength, position: "relative" }}
        >
            {sourceType === "video" ? (
                <video
                    ref={videoRef}
                    src={videoSrc}
                    style={mediaStyle}
                    muted
                    playsInline
                    preload="auto"
                />
            ) : (
                <img
                    ref={imgRef}
                    src={frameURLs[0] || ""}
                    style={mediaStyle}
                    alt=""
                />
            )}
            {showLoaderOverlay && (
                <div
                    style={{
                        position: "sticky",
                        top: "50%",
                        display: "flex",
                        justifyContent: "center",
                        pointerEvents: "none",
                        marginTop: "calc(-50lvh / var(--zoom-ratio, 1))",
                    }}
                >
                    <div
                        style={{
                            width: 200,
                            height: 2,
                            borderRadius: 1,
                            background: "rgba(255, 255, 255, 0.25)",
                            overflow: "hidden",
                        }}
                    >
                        <div
                            style={{
                                width: `${loaderProgress}%`,
                                height: "100%",
                                background: "rgba(255, 255, 255, 0.9)",
                                transition: "width 0.15s ease-out",
                            }}
                        />
                    </div>
                </div>
            )}
        </motion.div>
    )
}

ScrollVideo.defaultProps = {
    sourceType: "video",
    videoFileSourceType: "url",
    videoSrcURL:
        "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    sequenceBaseURL:
        "https://cdn.jsdelivr.net/gh/Sofyberci/CulaWebsite-Scrollingvideo-Frames@main/",
    sequencePrefix: "frame_",
    sequenceExtension: ".jpg",
    sequencePadding: 4,
    sequenceStartIndex: 1,
    sequenceFrameCount: 900,
    frameStep: 1,
    gateHeadPercent: 15,
    showLoader: true,
    scrollLength: 500,
    alignment: "center",
    startOn: "top",
    fit: "cover",
}

addPropertyControls(ScrollVideo, {
    sourceType: {
        type: ControlType.Enum,
        title: "Source",
        options: ["video", "sequence"],
        optionTitles: ["Video", "Image Sequence"],
        defaultValue: "video",
    },
    videoFileSourceType: {
        type: ControlType.Enum,
        title: "Video From",
        options: ["url", "file"],
        optionTitles: ["URL", "File"],
        defaultValue: "url",
        hidden: ({ sourceType }) => sourceType !== "video",
    },
    videoSrcURL: {
        type: ControlType.String,
        title: "Video URL",
        defaultValue:
            "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
        hidden: ({ sourceType, videoFileSourceType }) =>
            sourceType !== "video" || videoFileSourceType !== "url",
    },
    videoSrcFile: {
        type: ControlType.File,
        title: "Video File",
        allowedFileTypes: ["mp4", "mov", "webm"],
        hidden: ({ sourceType, videoFileSourceType }) =>
            sourceType !== "video" || videoFileSourceType !== "file",
    },
    sequenceBaseURL: {
        type: ControlType.String,
        title: "Base URL",
        defaultValue:
            "https://cdn.jsdelivr.net/gh/Sofyberci/CulaWebsite-Scrollingvideo-Frames@main/",
        hidden: ({ sourceType }) => sourceType !== "sequence",
        description: "Folder URL ending with /",
    },
    sequencePrefix: {
        type: ControlType.String,
        title: "Filename Prefix",
        defaultValue: "frame_",
        hidden: ({ sourceType }) => sourceType !== "sequence",
    },
    sequenceExtension: {
        type: ControlType.String,
        title: "Extension",
        defaultValue: ".jpg",
        hidden: ({ sourceType }) => sourceType !== "sequence",
    },
    sequencePadding: {
        type: ControlType.Number,
        title: "Padding",
        defaultValue: 4,
        min: 1,
        max: 8,
        step: 1,
        displayStepper: true,
        hidden: ({ sourceType }) => sourceType !== "sequence",
        description: "Digits in frame number (4 = 0001)",
    },
    sequenceStartIndex: {
        type: ControlType.Number,
        title: "Start Index",
        defaultValue: 1,
        min: 0,
        max: 9999,
        step: 1,
        displayStepper: true,
        hidden: ({ sourceType }) => sourceType !== "sequence",
    },
    sequenceFrameCount: {
        type: ControlType.Number,
        title: "Frame Count",
        defaultValue: 900,
        min: 1,
        max: 9999,
        step: 1,
        hidden: ({ sourceType }) => sourceType !== "sequence",
    },
    frameStep: {
        type: ControlType.Number,
        title: "Frame Step",
        defaultValue: 1,
        min: 1,
        max: 10,
        step: 1,
        displayStepper: true,
        hidden: ({ sourceType }) => sourceType !== "sequence",
        description: "Use every Nth frame (2 = half the frames)",
    },
    gateHeadPercent: {
        type: ControlType.Number,
        title: "Gate Head %",
        defaultValue: 15,
        min: 0,
        max: 100,
        step: 5,
        displayStepper: true,
        hidden: ({ sourceType }) => sourceType !== "sequence",
        description:
            "First % of frames fully preloaded before the loader hides (plus an every-8th skeleton of the rest). 0 = skeleton only.",
    },
    showLoader: {
        type: ControlType.Boolean,
        title: "Loader",
        defaultValue: true,
        hidden: ({ sourceType }) => sourceType !== "sequence",
    },
    scrollLength: {
        type: ControlType.Number,
        title: "Scroll Length",
        defaultValue: 500,
        min: 100,
        max: 20000,
        step: 30,
    },
    alignment: {
        type: ControlType.Enum,
        title: "Alignment",
        options: ["center", "top", "bottom"],
        optionTitles: ["Center", "Top", "Bottom"],
        defaultValue: "center",
    },
    fit: {
        type: ControlType.Enum,
        title: "Fit",
        options: ["cover", "contain", "fill"],
        optionTitles: ["Cover", "Contain", "Fill"],
        defaultValue: "cover",
    },
    startOn: {
        type: ControlType.Enum,
        title: "Start On",
        options: ["top", "center", "bottom"],
        optionTitles: ["Top", "Center", "Bottom"],
        defaultValue: "top",
        hidden: ({ sourceType }) => sourceType !== "video",
    },
})
