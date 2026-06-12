// Video Scrubber — drop-in replacement for the existing "Video Scrubber 3" code component.
//
// Identical props and rendering; two changes versus the original:
//
// 1. Smarter loader gate: instead of gating only on every 8th frame, the gate
//    preloads the FIRST `gateHeadPercent` % of frames densely (that's what
//    visitors scrub first) PLUS every 8th frame across the whole range, then
//    backfills the rest in the background. New optional prop `gateHeadPercent`
//    (default 15). Set it to 0 for the original behavior.
// 2. Failed downloads are no longer marked as loaded (original bug: `onerror`
//    set the same "loaded" flag as `onload`, so a frame that failed once was
//    re-requested from the network on every scroll position landing on it).
//
// To adopt: open the project's "Video Scrubber 3" code file in Framer and
// replace its contents with this file. Existing instances keep their props.

import * as React from "react"
import { addPropertyControls, ControlType, RenderTarget } from "framer"

/**
 * @framerSupportedLayoutWidth any
 * @framerSupportedLayoutHeight any
 */
export default function VideoScrubber(props) {
    const {
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
        style,
    } = props

    const videoRef = React.useRef<HTMLVideoElement>(null)
    const imgRef = React.useRef<HTMLImageElement>(null)
    const wrapRef = React.useRef<HTMLDivElement>(null)
    const wrapTopRef = React.useRef(0)
    const wrapSpanRef = React.useRef(0)
    const shownIdxRef = React.useRef(-1)
    const rafRef = React.useRef<number | null>(null)
    const widthRef = React.useRef(0)
    const loadedRef = React.useRef<Uint8Array | null>(null)
    const imagesRef = React.useRef<HTMLImageElement[]>([])

    const [mounted, setMounted] = React.useState(false)
    const [progress, setProgress] = React.useState(0)
    const [gateDone, setGateDone] = React.useState(false)

    const isCanvas = RenderTarget.current() === RenderTarget.canvas

    React.useEffect(() => {
        requestAnimationFrame(() => setMounted(true))
    }, [])

    const zoom = () => {
        const v = getComputedStyle(
            document.documentElement
        ).getPropertyValue("--zoom-ratio")
        const z = parseFloat(v)
        return z > 0 ? z : 1
    }

    // Frame URL list (steps by frameStep, same as the original).
    const urls = React.useMemo(() => {
        if (sourceType !== "sequence") return []
        const step = Math.max(1, frameStep)
        const base = sequenceBaseURL.endsWith("/")
            ? sequenceBaseURL
            : sequenceBaseURL + "/"
        const ext = sequenceExtension.startsWith(".")
            ? sequenceExtension
            : "." + sequenceExtension
        const list: string[] = []
        for (let i = 0; i < sequenceFrameCount; i += step) {
            const num = String(sequenceStartIndex + i).padStart(
                sequencePadding,
                "0"
            )
            list.push(`${base}${sequencePrefix}${num}${ext}`)
        }
        return list
    }, [
        sourceType,
        sequenceBaseURL,
        sequencePrefix,
        sequenceExtension,
        sequencePadding,
        sequenceStartIndex,
        sequenceFrameCount,
        frameStep,
    ])
    const urlsKey = urls.length ? urls[0] + urls.length : ""

    const measure = () => {
        if (!wrapRef.current) return
        const z = zoom()
        const rect = wrapRef.current.getBoundingClientRect()
        wrapTopRef.current = window.pageYOffset + rect.top / z
        wrapSpanRef.current = rect.height / z
    }

    // Nearest already-loaded frame (bridges gaps during background fill).
    const nearestLoaded = (i: number) => {
        const loaded = loadedRef.current
        if (!loaded || loaded[i]) return i
        for (let d = 1; d < loaded.length; d++) {
            if (i - d >= 0 && loaded[i - d]) return i - d
            if (i + d < loaded.length && loaded[i + d]) return i + d
        }
        return i
    }

    const update = () => {
        const span = wrapSpanRef.current
        if (!span) return
        const raw = (window.pageYOffset - wrapTopRef.current) / span
        const frac = Math.max(0, Math.min(1, raw))
        if (sourceType === "video") {
            const video = videoRef.current
            if (!video) return
            const seek = () => {
                video.currentTime = frac * (video.duration || 0)
            }
            if (video.readyState >= 1) seek()
            else video.addEventListener("loadedmetadata", seek, { once: true })
        } else {
            if (!urls.length || !imgRef.current) return
            const idx = nearestLoaded(
                Math.min(urls.length - 1, Math.floor(frac * urls.length))
            )
            if (idx === shownIdxRef.current) return
            shownIdxRef.current = idx
            imgRef.current.src = urls[idx]
        }
    }

    React.useEffect(() => {
        if ("scrollRestoration" in window.history) {
            window.history.scrollRestoration = "manual"
        }
        window.scrollTo(0, 0)
    }, [])

    React.useEffect(() => {
        widthRef.current = window.innerWidth
        measure()
        update()
    }, [scrollLength, sourceType, urlsKey, mounted])

    React.useEffect(() => {
        const onResize = () => {
            if (window.innerWidth !== widthRef.current) {
                widthRef.current = window.innerWidth
                measure()
                update()
            }
        }
        window.addEventListener("resize", onResize)
        return () => window.removeEventListener("resize", onResize)
    }, [sourceType, urlsKey])

    // ---- preloader: gate = dense head + every-8th skeleton; rest backfills ----
    React.useEffect(() => {
        if (sourceType !== "sequence" || !urls.length || isCanvas) return
        let cancelled = false
        const n = urls.length
        loadedRef.current = new Uint8Array(n)
        imagesRef.current = Array(n)
        shownIdxRef.current = -1

        const headCount = Math.ceil(
            (Math.max(0, Math.min(100, gateHeadPercent)) / 100) * n
        )
        const gate: number[] = []
        const inGate = new Uint8Array(n)
        for (let i = 0; i < n; i++) {
            if (i < headCount || i % 8 === 0 || i === n - 1) {
                gate.push(i)
                inGate[i] = 1
            }
        }
        const rest: number[] = []
        for (let i = 0; i < n; i++) if (!inGate[i]) rest.push(i)

        const loadSet = (
            indices: number[],
            onEach: (() => void) | null
        ): Promise<void> =>
            new Promise((resolve) => {
                if (!indices.length) return resolve()
                let next = 0
                let active = 0
                const pump = () => {
                    while (active < 10 && next < indices.length) {
                        const idx = indices[next++]
                        active++
                        const im = new Image()
                        imagesRef.current[idx] = im
                        const finish = (ok: boolean) => () => {
                            active--
                            if (!cancelled) {
                                // onerror intentionally does NOT mark the frame
                                // as loaded — the nearest-loaded fallback covers
                                // it and a later remount can retry.
                                if (ok) loadedRef.current![idx] = 1
                                if (onEach) onEach()
                                if (next >= indices.length && active === 0)
                                    resolve()
                                else pump()
                            }
                        }
                        im.onload = finish(true)
                        im.onerror = finish(false)
                        im.src = urls[idx]
                    }
                }
                pump()
            })

        let done = 0
        let lastPct = -1
        requestAnimationFrame(() => {
            setProgress(0)
            setGateDone(false)
        })
        loadSet(gate, () => {
            done++
            const pct = Math.round((done / gate.length) * 100)
            if (pct !== lastPct) {
                lastPct = pct
                requestAnimationFrame(() => setProgress(pct))
            }
        }).then(() => {
            if (cancelled) return
            requestAnimationFrame(() => setGateDone(true))
            update()
            return loadSet(rest, null).then(() => {
                if (!cancelled) {
                    shownIdxRef.current = -1
                    update()
                }
            })
        })

        return () => {
            cancelled = true
            imagesRef.current.forEach((im) => {
                if (im) im.src = ""
            })
            imagesRef.current = []
        }
    }, [sourceType, urlsKey, isCanvas, gateHeadPercent])

    // Video mode: seek to the right position when scrolled into view.
    React.useEffect(() => {
        if (sourceType !== "video") return
        const threshold =
            startOn === "top" ? 0 : startOn === "center" ? 0.5 : 1
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting && videoRef.current) {
                    const z = zoom()
                    const raw =
                        (window.pageYOffset +
                            entry.boundingClientRect.top / z -
                            wrapTopRef.current) /
                        wrapSpanRef.current
                    const frac = Math.max(0, Math.min(1, raw))
                    videoRef.current.currentTime =
                        frac * (videoRef.current.duration || 0)
                }
            },
            { threshold }
        )
        if (videoRef.current) observer.observe(videoRef.current)
        return () => {
            if (videoRef.current) observer.unobserve(videoRef.current)
        }
    }, [sourceType, startOn, mounted])

    React.useEffect(() => {
        const onScroll = () => {
            if (rafRef.current === null) {
                rafRef.current = requestAnimationFrame(() => {
                    rafRef.current = null
                    update()
                })
            }
        }
        window.addEventListener("scroll", onScroll, { passive: true })
        return () => {
            window.removeEventListener("scroll", onScroll)
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current)
                rafRef.current = null
            }
        }
    }, [sourceType, urlsKey])

    const videoSrc = videoFileSourceType === "url" ? videoSrcURL : videoSrcFile
    const mediaStyle: React.CSSProperties = {
        width: "100%",
        height: "calc(100lvh / var(--zoom-ratio, 1))",
        position: "sticky",
        objectFit: fit,
        ...({
            center: { top: "50%", transform: "translateY(-50%)" },
            top: { top: 0 },
            bottom: { bottom: 0 },
        }[alignment] as React.CSSProperties),
    }
    const showBar =
        sourceType === "sequence" && showLoader && !gateDone && !isCanvas

    return (
        <div
            ref={wrapRef}
            style={{ height: scrollLength, position: "relative", ...style }}
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
                <img ref={imgRef} src={urls[0] || ""} style={mediaStyle} alt="" />
            )}
            {showBar && (
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
                                width: `${progress}%`,
                                height: "100%",
                                background: "rgba(255, 255, 255, 0.9)",
                                transition: "width 0.15s ease-out",
                            }}
                        />
                    </div>
                </div>
            )}
        </div>
    )
}

VideoScrubber.defaultProps = {
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

addPropertyControls(VideoScrubber, {
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
