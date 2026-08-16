import { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "motion/react"
import { PaintbrushIcon, ChevronDownIcon } from "@/icons/app-icons"
import { findSelectValue } from "./select-value"

// ── TYPES PRESERVATION ──

export type ThemeId = "nocturne" | "bamboo" | "cosmic" | "lyceum" | "cyber" | "abyssal"
export type SpaceId =
  | "nocturne"
  | "nebula"
  | "aurora-green"
  | "nebula-orion"
  | "nebula-dust"
  | "dust-cygnus"
export type SpaceColorId =
  | "theme"
  | "emerald"
  | "amethyst"
  | "sapphire"
  | "amber"
  | "ruby"
  | "monochrome"
const SPACE_COLOR_IDS = [
  "theme",
  "emerald",
  "amethyst",
  "sapphire",
  "amber",
  "ruby",
  "monochrome",
] satisfies SpaceColorId[]
export type TransitionId = "diagonal" | "ripple" | "warp" | "dissolve" | "eclipse"
export type MoodKey = "neutral" | "learn" | "teach"

export type ThemeConfig = {
  id: ThemeId
  name: string
  ring: string
  ring2: string
  soft: string
  word: string
  ink: string
  bloom: string
}

export type MoodColors = {
  a: string
  b: string
  c: string
  core: string
}

export type SpaceConfig = {
  id: SpaceId
  name: string
  bg: string
  moods: Record<MoodKey, MoodColors>
  grainOpacity?: number
}

// ── THEMES PRESERVATION ──

export const THEMES = {
  nocturne: {
    id: "nocturne",
    name: "Ember Nocturne",
    ring: "#FF6A2C",
    ring2: "#FF8A4C",
    soft: "rgba(255, 106, 44, 0.16)",
    word: "#FF9256",
    ink: "#180b04",
    bloom: "rgba(255, 120, 60, 0.45)",
  },
  bamboo: {
    id: "bamboo",
    name: "Sage Bamboo",
    ring: "#5cb85c",
    ring2: "#8be08b",
    soft: "rgba(92, 184, 92, 0.16)",
    word: "#8be08b",
    ink: "#020803",
    bloom: "rgba(92, 184, 92, 0.4)",
  },
  cosmic: {
    id: "cosmic",
    name: "Cosmic Purple",
    ring: "#d946ef",
    ring2: "#f472b6",
    soft: "rgba(217, 70, 239, 0.16)",
    word: "#c084fc",
    ink: "#05010a",
    bloom: "rgba(217, 70, 239, 0.4)",
  },
  lyceum: {
    id: "lyceum",
    name: "Golden Lyceum",
    ring: "#d9a74a",
    ring2: "#f3d082",
    soft: "rgba(217, 167, 74, 0.16)",
    word: "#e6b963",
    ink: "#120902",
    bloom: "rgba(217, 167, 74, 0.4)",
  },
  cyber: {
    id: "cyber",
    name: "Cyber Neon",
    ring: "#00f0ff",
    ring2: "#70f5ff",
    soft: "rgba(0, 240, 255, 0.16)",
    word: "#60a5fa",
    ink: "#00050c",
    bloom: "rgba(0, 240, 255, 0.4)",
  },
  abyssal: {
    id: "abyssal",
    name: "Seafoam Abyssal",
    ring: "#00c4b4",
    ring2: "#4ef5e7",
    soft: "rgba(0, 196, 180, 0.16)",
    word: "#38bdf8",
    ink: "#000308",
    bloom: "rgba(0, 196, 180, 0.4)",
  },
} satisfies Record<ThemeId, ThemeConfig>

// ── COLOR FILTERS PRESERVATION ──

export function getBgFilter(spaceColorId: SpaceColorId, themeId: ThemeId): string {
  if (spaceColorId === "theme") {
    const themeRotations = {
      nocturne: "none",
      bamboo: "hue-rotate(110deg)",
      cosmic: "hue-rotate(295deg) saturate(1.3)",
      lyceum: "hue-rotate(35deg)",
      cyber: "hue-rotate(190deg)",
      abyssal: "hue-rotate(155deg)",
    } satisfies Record<ThemeId, string>
    return themeRotations[themeId] || "none"
  }

  const overrides = {
    emerald: "hue-rotate(110deg)",
    amethyst: "hue-rotate(295deg) saturate(1.3)",
    sapphire: "hue-rotate(190deg)",
    amber: "hue-rotate(35deg)",
    ruby: "hue-rotate(325deg)",
    monochrome: "saturate(0) brightness(1.05) contrast(1.05)",
  } satisfies Record<Exclude<SpaceColorId, "theme">, string>
  return overrides[spaceColorId] || "none"
}

// ── SPACES PRESERVATION ──

export const SPACES = {
  nocturne: {
    id: "nocturne",
    name: "Night Aurora Sky",
    bg: "#0a0a0c",
    moods: {
      neutral: {
        a: "rgba(255, 138, 76, 0.40)",
        b: "rgba(255, 96, 40, 0.32)",
        c: "rgba(255, 182, 96, 0.30)",
        core: "rgba(255, 170, 104, 0.55)",
      },
      learn: {
        a: "rgba(255, 196, 92, 0.44)",
        b: "rgba(255, 132, 64, 0.34)",
        c: "rgba(255, 224, 150, 0.32)",
        core: "rgba(255, 210, 130, 0.6)",
      },
      teach: {
        a: "rgba(64, 206, 208, 0.40)",
        b: "rgba(120, 108, 240, 0.44)",
        c: "rgba(184, 122, 255, 0.34)",
        core: "rgba(150, 200, 255, 0.5)",
      },
    },
    grainOpacity: 0.05,
  },
  nebula: {
    id: "nebula",
    name: "Ethereal Wispy Nebula",
    bg: "#010101",
    moods: {
      neutral: {
        a: "rgba(255, 106, 44, 0.35)",
        b: "rgba(255, 96, 40, 0.25)",
        c: "rgba(255, 182, 96, 0.15)",
        core: "rgba(255, 170, 104, 0.45)",
      },
      learn: {
        a: "rgba(255, 196, 92, 0.40)",
        b: "rgba(255, 132, 64, 0.25)",
        c: "rgba(255, 224, 150, 0.15)",
        core: "rgba(255, 210, 130, 0.50)",
      },
      teach: {
        a: "rgba(64, 206, 208, 0.35)",
        b: "rgba(120, 108, 240, 0.30)",
        c: "rgba(184, 122, 255, 0.20)",
        core: "rgba(150, 200, 255, 0.45)",
      },
    },
    grainOpacity: 0.04,
  },
  "aurora-green": {
    id: "aurora-green",
    name: "Northern Borealis",
    bg: "#020403",
    moods: {
      neutral: {
        a: "rgba(46, 196, 182, 0.40)",
        b: "rgba(20, 150, 120, 0.30)",
        c: "rgba(0, 0, 0, 0)",
        core: "rgba(100, 255, 218, 0.55)",
      },
      learn: {
        a: "rgba(46, 196, 182, 0.40)",
        b: "rgba(20, 150, 120, 0.30)",
        c: "rgba(0, 0, 0, 0)",
        core: "rgba(100, 255, 218, 0.55)",
      },
      teach: {
        a: "rgba(46, 196, 182, 0.40)",
        b: "rgba(20, 150, 120, 0.30)",
        c: "rgba(0, 0, 0, 0)",
        core: "rgba(100, 255, 218, 0.55)",
      },
    },
    grainOpacity: 0.05,
  },
  "nebula-orion": {
    id: "nebula-orion",
    name: "Cosmic Orion Nebula",
    bg: "#010102",
    moods: {
      neutral: {
        a: "rgba(255, 0, 85, 0.35)",
        b: "rgba(186, 104, 200, 0.25)",
        c: "rgba(236, 72, 153, 0.15)",
        core: "rgba(255, 64, 129, 0.55)",
      },
      learn: {
        a: "rgba(255, 0, 85, 0.35)",
        b: "rgba(186, 104, 200, 0.25)",
        c: "rgba(236, 72, 153, 0.15)",
        core: "rgba(255, 64, 129, 0.55)",
      },
      teach: {
        a: "rgba(255, 0, 85, 0.35)",
        b: "rgba(186, 104, 200, 0.25)",
        c: "rgba(236, 72, 153, 0.15)",
        core: "rgba(255, 64, 129, 0.55)",
      },
    },
    grainOpacity: 0.05,
  },
  "nebula-dust": {
    id: "nebula-dust",
    name: "Dark Dust Lane",
    bg: "#020101",
    moods: {
      neutral: {
        a: "rgba(255, 179, 0, 0.40)",
        b: "rgba(255, 111, 0, 0.25)",
        c: "rgba(255, 215, 0, 0.15)",
        core: "rgba(255, 160, 0, 0.60)",
      },
      learn: {
        a: "rgba(255, 179, 0, 0.40)",
        b: "rgba(255, 111, 0, 0.25)",
        c: "rgba(255, 215, 0, 0.15)",
        core: "rgba(255, 160, 0, 0.60)",
      },
      teach: {
        a: "rgba(255, 179, 0, 0.40)",
        b: "rgba(255, 111, 0, 0.25)",
        c: "rgba(255, 215, 0, 0.15)",
        core: "rgba(255, 160, 0, 0.60)",
      },
    },
    grainOpacity: 0.05,
  },
  "dust-cygnus": {
    id: "dust-cygnus",
    name: "Cygnus Rift Glow",
    bg: "#010101",
    moods: {
      neutral: {
        a: "rgba(255, 160, 0, 0.35)",
        b: "rgba(186, 104, 200, 0.25)",
        c: "rgba(255, 255, 255, 0)",
        core: "rgba(255, 179, 0, 0.50)",
      },
      learn: {
        a: "rgba(255, 160, 0, 0.35)",
        b: "rgba(186, 104, 200, 0.25)",
        c: "rgba(255, 255, 255, 0)",
        core: "rgba(255, 179, 0, 0.50)",
      },
      teach: {
        a: "rgba(255, 160, 0, 0.35)",
        b: "rgba(186, 104, 200, 0.25)",
        c: "rgba(255, 255, 255, 0)",
        core: "rgba(255, 179, 0, 0.50)",
      },
    },
    grainOpacity: 0.05,
  },
} satisfies Record<SpaceId, SpaceConfig>

// ── BACKGROUND COMPONENTS PRESERVATION ──

export function NocturneBackground({ mood, _bloom }: { mood: MoodColors; _bloom: boolean }) {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none bg-[#0a0a0c]">
      <div
        className="absolute inset-0 opacity-[0.55] transition-opacity duration-1000"
        style={{
          backgroundImage: `radial-gradient(100% 100% at 50% 100%, ${mood.a}, transparent 75%)`,
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.40] transition-opacity duration-1000"
        style={{
          backgroundImage: `radial-gradient(130% 100% at 20% 90%, ${mood.b}, transparent 70%)`,
        }}
      />
    </div>
  )
}

export function NebulaBackground({ mood, _bloom }: { mood: MoodColors; _bloom: boolean }) {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none bg-[#010101]">
      <svg style={{ position: "absolute", width: 0, height: 0 }}>
        <defs>
          <filter id="nebula-drift-filter">
            <feTurbulence type="fractalNoise" baseFrequency="0.006" numOctaves="4" result="noise" />
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale="120"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>
      </svg>
      <div
        className="ob-drift absolute inset-0 opacity-[0.52]"
        style={{
          filter: "url(#nebula-drift-filter)",
          backgroundImage: [
            `radial-gradient(55% 55% at 20% 25%, ${mood.a}, transparent 70%)`,
            `radial-gradient(60% 60% at 75% 75%, ${mood.b}, transparent 70%)`,
            `radial-gradient(40% 40% at 80% 20%, ${mood.c}, transparent 65%)`,
          ].join(", "),
        }}
      />
    </div>
  )
}

export function AuroraGreenBackground({ mood, _bloom }: { mood: MoodColors; _bloom: boolean }) {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none bg-[#020403]">
      <div
        className="absolute inset-0 opacity-[0.60] transition-opacity duration-1000"
        style={{
          backgroundImage: [
            `radial-gradient(60% 60% at 30% 40%, ${mood.a}, transparent 75%)`,
            `radial-gradient(65% 65% at 70% 60%, ${mood.b}, transparent 75%)`,
          ].join(", "),
        }}
      />
    </div>
  )
}

export function NebulaDustBackground({ mood, _bloom }: { mood: MoodColors; _bloom: boolean }) {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none bg-[#020101]">
      <svg style={{ position: "absolute", width: 0, height: 0 }}>
        <defs>
          <filter id="dust-lane-filter">
            <feTurbulence type="fractalNoise" baseFrequency="0.008" numOctaves="5" result="noise" />
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale="130"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>
      </svg>
      <div
        className="ob-drift absolute inset-0 opacity-[0.60]"
        style={{
          filter: "url(#dust-lane-filter)",
          backgroundImage: [
            `radial-gradient(55% 55% at 25% 30%, ${mood.a}, transparent 70%)`,
            `radial-gradient(60% 60% at 75% 70%, ${mood.b}, transparent 70%)`,
          ].join(", "),
        }}
      />
    </div>
  )
}

export function DustCygnusBackground({ mood, _bloom }: { mood: MoodColors; _bloom?: boolean }) {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none bg-[#010101]">
      <svg style={{ position: "absolute", width: 0, height: 0 }}>
        <defs>
          <filter id="cygnus-rift-filter">
            <feTurbulence type="fractalNoise" baseFrequency="0.007" numOctaves="4" result="noise" />
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale="115"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>
      </svg>
      <div
        className="absolute inset-0 opacity-[0.60]"
        style={{
          backgroundImage: [
            `radial-gradient(50% 50% at 30% 30%, ${mood.a}, transparent 70%)`,
            `radial-gradient(55% 55% at 70% 70%, ${mood.b}, transparent 70%)`,
          ].join(", "),
        }}
      />
    </div>
  )
}

// ── CONTROL PANEL PRESERVATION ──

export function ControlPanel({
  themeId,
  onThemeChange,
  spaceId,
  onSpaceChange,
  spaceColorId,
  onSpaceColorChange,
  transitionId,
  onTransitionChange,
}: {
  themeId: ThemeId
  onThemeChange: (id: ThemeId) => void
  spaceId: SpaceId
  onSpaceChange: (id: SpaceId) => void
  spaceColorId: SpaceColorId
  onSpaceColorChange: (id: SpaceColorId) => void
  transitionId: TransitionId
  onTransitionChange: (id: TransitionId) => void
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        event.target instanceof Node &&
        !containerRef.current.contains(event.target)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const currentTheme = THEMES[themeId]

  const schemeColors = {
    theme: "linear-gradient(135deg, #FF6A2C 0%, #d946ef 50%, #00f0ff 100%)",
    emerald: "#10b981",
    amethyst: "#a855f7",
    sapphire: "#3b82f6",
    amber: "#f59e0b",
    ruby: "#ef4444",
    monochrome: "#ffffff",
  } satisfies Record<SpaceColorId, string>

  return (
    <div ref={containerRef} className="absolute top-6 right-8 z-50 flex flex-col items-end">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-full border border-white/10 bg-black/45 backdrop-blur-md px-4 py-2 text-[12px] font-medium text-white/90 transition-all hover:bg-black/60 hover:text-white hover:border-white/25 animate-fade-in"
        style={{ boxShadow: "0 4px 14px rgba(0,0,0,0.3)" }}
      >
        <PaintbrushIcon className="size-3.5" style={{ color: "var(--brand-word)" }} />
        <span>Easel Customize</span>
        <ChevronDownIcon
          className={`size-3 text-white/40 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="mt-2 w-80 rounded-2xl border border-white/10 bg-[#0c0d10]/95 backdrop-blur-xl p-5 shadow-2xl flex flex-col gap-5 text-left font-sans"
            style={{ boxShadow: "0 15px 35px rgba(0,0,0,0.6)" }}
          >
            {/* Theme Selector */}
            <div className="flex flex-col gap-2.5">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/45">
                  1. UI Theme Accent
                </span>
                <span className="text-[11px] text-white/80 font-medium">{currentTheme.name}</span>
              </div>
              <div className="flex gap-2.5">
                {Object.values(THEMES).map((t) => {
                  const isActive = t.id === themeId
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => onThemeChange(t.id)}
                      title={t.name}
                      className={`size-6 rounded-full border transition-all relative ${
                        isActive
                          ? "border-white scale-110 shadow-[0_0_12px_rgba(255,255,255,0.4)]"
                          : "border-white/10 hover:border-white/30 hover:scale-105"
                      }`}
                      style={{ backgroundColor: t.ring }}
                    />
                  )
                })}
              </div>
            </div>

            {/* Space Canvas Selector */}
            <div className="flex flex-col gap-2.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-white/45">
                2. Background Space Layer
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                {Object.values(SPACES).map((s) => {
                  const isActive = s.id === spaceId
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => onSpaceChange(s.id)}
                      className={`rounded-lg px-2.5 py-1.5 text-[11.5px] font-medium text-left border transition-all ${
                        isActive
                          ? "border-white/30 bg-white/10 shadow-[0_4px_12px_rgba(255,255,255,0.05)]"
                          : "border-white/5 bg-white/[0.02] hover:bg-white/[0.05]"
                      }`}
                      style={{ color: isActive ? "#ffffff" : "rgba(255, 255, 255, 0.6)" }}
                    >
                      {s.name}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Background Color Selector */}
            <div className="flex flex-col gap-2.5">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/45">
                  3. Canvas Color Scheme
                </span>
                <span className="text-[11px] text-white/80 font-medium capitalize">
                  {spaceColorId === "theme" ? "Follow Accent" : spaceColorId}
                </span>
              </div>
              <div className="flex gap-2">
                {Object.entries(schemeColors).map(([id, color]) => {
                  const isActive = id === spaceColorId
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        const spaceColorID = findSelectValue(id, SPACE_COLOR_IDS)
                        if (spaceColorID) onSpaceColorChange(spaceColorID)
                      }}
                      className={`size-6 rounded-full border transition-all relative ${
                        isActive
                          ? "border-white scale-110 shadow-[0_0_12px_rgba(255,255,255,0.4)]"
                          : "border-white/10 hover:border-white/30 hover:scale-105"
                      }`}
                      style={{
                        background: color,
                      }}
                    />
                  )
                })}
              </div>
            </div>

            {/* Transition Selector */}
            <div className="flex flex-col gap-2.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-white/45">
                4. Nav & Finish Transition
              </span>
              <div className="flex flex-wrap gap-1">
                {(["diagonal", "ripple", "warp", "dissolve", "eclipse"] as const).map((tId) => {
                  const isActive = tId === transitionId
                  const labels = {
                    diagonal: "Diagonal",
                    ripple: "Ripple",
                    warp: "Warp",
                    dissolve: "Dissolve",
                    eclipse: "Eclipse",
                  } satisfies Record<TransitionId, string>
                  return (
                    <button
                      key={tId}
                      type="button"
                      onClick={() => onTransitionChange(tId)}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium border transition-all ${
                        isActive
                          ? "border-white/30 bg-white/10"
                          : "border-white/5 bg-white/[0.02] hover:bg-white/[0.05]"
                      }`}
                      style={{ color: isActive ? "#ffffff" : "rgba(255, 255, 255, 0.6)" }}
                    >
                      {labels[tId]}
                    </button>
                  )
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
