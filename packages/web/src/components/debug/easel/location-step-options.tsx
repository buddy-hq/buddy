import { useEffect, useState, type ReactNode } from "react"
import { motion } from "motion/react"
import { ArrowLeftIcon, ArrowUpRightIcon, FolderIcon } from "@/icons/app-icons"

/**
 * Easel · Onboarding step 3 (location)
 *
 * This step has one job: propose a folder and let you accept or change it. The
 * shipped screen spends nine elements on it, and the previous easel pass spent
 * seven — heading, subline, folder object, ember bar, rule, two controls, and a
 * reassurance line. Most of that is the same sentence three times:
 *
 *   "Your work lives here."                          your work goes in a folder
 *   "Buddy keeps everything in one folder."          your work goes in a folder
 *   "You can move it later…"                         reassurance nobody asked for
 *
 * All three are cut. So is the ember bar, the rule, the card, the icon tile and
 * the uppercase RECOMMENDED tag. What is left is the irreducible set:
 *
 *   1. one line of orientation
 *   2. the folder
 *   3. accept  ·  change
 *
 * The folder is one line — glyph, dim ancestors, bright name. The three
 * variants differ only in what holds that line, because unanchored it floats:
 * it is the only element on the screen without an edge.
 *
 * The path rules survive from the last pass, because they are the actual fix:
 * home collapses to `~`, the name is the only thing at full strength, deep
 * middles elide, and the absolute path lives in the tooltip, never the layout.
 */

// ── Type ──────────────────────────────────────────────────────────────────

const FONT_LINK_ID = "ob-location-fonts"
const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter+Tight:wght@400;500;600&display=swap"
const FRAUNCES = '"Fraunces", Georgia, "Times New Roman", serif'
const TIGHT = '"Inter Tight", ui-sans-serif, -apple-system, "Segoe UI", sans-serif'
const MONO = 'ui-monospace, SFMono-Regular, "SF Mono", monospace'

// ── Tokens ────────────────────────────────────────────────────────────────

const INK = "#070406"
const PAPER = "#F7F1E8"
const EMBER = "#FF6A2C"
const EMBER_WARM = "#FF9256"
const EASEL_BG = "#0A0A0C"

/**
 * One descending scale. The folder is information, not a headline, so nothing
 * here comes close to the heading — the old 30px serif name did, which is why
 * the block read as loud.
 */
const SCALE = {
  pathLine: 14.5,
} as const

/**
 * Glyph and text are centred against each other, not against their boxes. A
 * 16px folder beside 14.5px mono set solid puts the tab of the folder and the
 * cap line of the text on the same optical band; anything larger and the glyph
 * starts to outweigh the words it is labelling.
 */
const GLYPH_PX = 16

/**
 * One vertical rhythm for the step, so every gap is a decision rather than a
 * default. Three elements have to hold a full screen, so the gaps between them
 * are wider than they would be in a dense list — and the row is given real
 * height, because a short row with tight padding is what reads as cramped even
 * when the gaps around it are generous.
 */
const RHYTHM = {
  headingToFolder: 48,
  folderToActions: 44,
  rowPaddingY: 18,
  rowPaddingX: 20,
  actionsGap: 28,
} as const

const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1]
const PICK_DELAY_MS = 900

// ── Domain ────────────────────────────────────────────────────────────────

const STEP_COUNT = 3
const LOCATION_STEP_INDEX = 2

/** One line, not two. Orientation, then get out of the way. */
const HEADING = "Your work lives here."

const CONFIRM_LABEL = "Use this location"
const CHANGE_LABEL = "Choose a different folder"
const PICKING_LABEL = "Opening picker…"

const HOME_DIRECTORY = "/Users/prashantbhudwal"
const PATH_SEPARATOR = "/"
const HOME_ALIAS = "~"

const SAMPLE_PATHS = {
  default: `${HOME_DIRECTORY}/Documents/Buddy`,
  deep: `${HOME_DIRECTORY}/Library/CloudStorage/Dropbox/Teaching/Fall 2026 Semester/Buddy`,
} as const

// ── The path fix, shared by all three ─────────────────────────────────────

/** Ancestors kept at the tail of an elided trail. */
const TRAIL_TAIL_SEGMENTS = 2
const TRAIL_ELLIPSIS = "…"

type DirectoryDescription = {
  /** The folder itself — the only word that carries meaning at this moment. */
  name: string
  /** Ancestors, home collapsed to `~`, deep middles elided. Never the full path. */
  trail: string[]
  /** Belongs in a tooltip, never in the layout. */
  full: string
}

function describeDirectory(absolutePath: string): DirectoryDescription {
  const homeRelative = absolutePath.startsWith(HOME_DIRECTORY)
    ? `${HOME_ALIAS}${absolutePath.slice(HOME_DIRECTORY.length)}`
    : absolutePath
  const segments = homeRelative.split(PATH_SEPARATOR).filter(Boolean)
  const name = segments.at(-1) ?? homeRelative
  const ancestors = segments.slice(0, -1)
  const trail =
    ancestors.length > TRAIL_TAIL_SEGMENTS + 1
      ? [...ancestors.slice(0, 1), TRAIL_ELLIPSIS, ...ancestors.slice(-TRAIL_TAIL_SEGMENTS)]
      : ancestors

  return { name, trail, full: absolutePath }
}

/** The ancestors, ending in the separator that hands off to the name. */
function joinAncestors(trail: string[]): string {
  return `${trail.join(PATH_SEPARATOR)}${PATH_SEPARATOR}`
}

// ── Variants ──────────────────────────────────────────────────────────────

/**
 * The content is settled: glyph, dim ancestors, bright name, one line. What is
 * still open is what holds it. Unanchored it floats, because it is the only
 * element on the screen without an edge — but a full card is what made the
 * shipped version heavy. These are three weights of the same answer.
 */
const LOCATION_VARIANTS = ["chip", "row", "shelf"] as const
type LocationVariant = (typeof LOCATION_VARIANTS)[number]

const VARIANT_LABEL: Record<LocationVariant, string> = {
  chip: "A · Chip",
  row: "B · Row",
  shelf: "C · Shelf",
}

const VARIANT_NOTE: Record<LocationVariant, string> = {
  chip: "Hugs the path — an object you could pick up, not a field waiting for input",
  row: "Full column width, same fill — anchors to the heading and the button below it",
  shelf: "No box at all. One hairline under it, so the path sits on something",
}

// ── Atoms ─────────────────────────────────────────────────────────────────

function useLocationFont() {
  useEffect(() => {
    if (document.getElementById(FONT_LINK_ID)) return
    const link = document.createElement("link")
    link.id = FONT_LINK_ID
    link.rel = "stylesheet"
    link.href = FONT_HREF
    document.head.appendChild(link)
  }, [])
}

function StyleTag() {
  return (
    <style>{`
      .obl-grain {
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
      }
      .obl-breathe { animation: obl-breathe 7s ease-in-out infinite; }
      @keyframes obl-breathe {
        0%, 100% { transform: scale(1); opacity: 0.85; }
        50% { transform: scale(1.05); opacity: 1; }
      }
      @media (prefers-reduced-motion: reduce) {
        .obl-breathe { animation: none; }
      }
    `}</style>
  )
}

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.055, delayChildren: 0.06 } },
}

const rise = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.44, ease: EASE_OUT } },
}

const maskedLine = {
  hidden: { y: "112%" },
  show: { y: "0%", transition: { duration: 0.62, ease: EASE_OUT } },
}

/**
 * The only folder signal that survives the cut. Muted, because the ember is
 * spent on the one control that matters — the confirm pill.
 */
function Glyph() {
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center"
      style={{ width: GLYPH_PX, height: GLYPH_PX }}
    >
      <FolderIcon
        style={{ width: GLYPH_PX, height: GLYPH_PX, color: "rgba(255,255,255,0.38)" }}
        strokeWidth={1.5}
      />
    </span>
  )
}

/**
 * Glyph and path on one optical band. `leading-none` collapses the text box to
 * the type itself, so centring the two boxes actually centres what you see —
 * with the default line box the mono sat low against the folder, which is what
 * read as misaligned.
 */
function PathLine({ directory }: { directory: DirectoryDescription }) {
  return (
    <>
      <Glyph />
      <span
        className="min-w-0 truncate leading-none"
        style={{ fontFamily: MONO, fontSize: SCALE.pathLine }}
      >
        <span style={{ color: "rgba(255,255,255,0.34)" }}>{joinAncestors(directory.trail)}</span>
        <span style={{ color: PAPER }}>{directory.name}</span>
      </span>
    </>
  )
}

const FOLDER_SURFACE = "rgba(255,255,255,0.032)"
const FOLDER_BORDER = "rgba(255,255,255,0.09)"

function FolderChip({ directory }: { directory: DirectoryDescription }) {
  return (
    <span
      title={directory.full}
      className="inline-flex max-w-full items-center gap-2.5 rounded-xl border"
      style={{
        borderColor: FOLDER_BORDER,
        background: FOLDER_SURFACE,
        padding: `${RHYTHM.rowPaddingY}px ${RHYTHM.rowPaddingX}px`,
      }}
    >
      <PathLine directory={directory} />
    </span>
  )
}

function FolderRow({ directory }: { directory: DirectoryDescription }) {
  return (
    <div
      title={directory.full}
      className="flex w-full items-center gap-2.5 rounded-xl border"
      style={{
        borderColor: FOLDER_BORDER,
        background: FOLDER_SURFACE,
        padding: `${RHYTHM.rowPaddingY}px ${RHYTHM.rowPaddingX}px`,
      }}
    >
      <PathLine directory={directory} />
    </div>
  )
}

/** No box — the hairline alone is enough to stop it floating. */
function FolderShelf({ directory }: { directory: DirectoryDescription }) {
  return (
    <div
      title={directory.full}
      className="flex w-full items-center gap-2.5 border-b"
      style={{ borderColor: FOLDER_BORDER, paddingBottom: RHYTHM.rowPaddingY }}
    >
      <PathLine directory={directory} />
    </div>
  )
}

// ── The step ──────────────────────────────────────────────────────────────

function Heading() {
  return (
    <motion.h2
      className="text-[clamp(32px,4.1vw,46px)] leading-[1.03] tracking-[-0.02em]"
      style={{ fontFamily: FRAUNCES, fontWeight: 500, color: PAPER }}
    >
      <span className="block overflow-hidden pb-[0.08em]">
        <motion.span variants={maskedLine} className="block">
          {HEADING}
        </motion.span>
      </span>
    </motion.h2>
  )
}

function LocationStep({
  variant,
  directory,
  picking,
  onPick,
  onConfirm,
}: {
  variant: LocationVariant
  directory: DirectoryDescription
  picking: boolean
  onPick: () => void
  onConfirm: () => void
}) {
  const progress = ((LOCATION_STEP_INDEX + 1) / STEP_COUNT) * 100

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{ background: INK, fontFamily: TIGHT }}
    >
      <div
        aria-hidden
        className="obl-breathe pointer-events-none absolute -left-[14%] -top-[34%] size-[76%] rounded-full blur-[120px]"
        style={{ background: "radial-gradient(closest-side, rgba(255,106,44,0.26), transparent 70%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-[32%] -right-[16%] size-[60%] rounded-full blur-[140px]"
        style={{ background: "radial-gradient(closest-side, rgba(96,64,190,0.18), transparent 70%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(120% 80% at 50% 40%, transparent 40%, rgba(0,0,0,0.7))" }}
      />
      <div
        aria-hidden
        className="obl-grain pointer-events-none absolute inset-0 z-[1] opacity-[0.05] mix-blend-overlay"
      />

      <div aria-hidden className="absolute inset-y-0 left-16 z-[2] w-px">
        <div className="absolute inset-0" style={{ background: "rgba(255,255,255,0.07)" }} />
        <div
          className="absolute inset-x-0 top-0"
          style={{
            height: `${progress}%`,
            background: `linear-gradient(180deg, transparent, ${EMBER} 22%, ${EMBER})`,
            boxShadow: `0 0 22px ${EMBER}`,
          }}
        />
        <span
          className="absolute -left-[3px] size-[7px] rounded-full"
          style={{
            top: `calc(${progress}% - 3.5px)`,
            background: EMBER_WARM,
            boxShadow: `0 0 18px ${EMBER}, 0 0 44px ${EMBER}`,
          }}
        />
      </div>

      <button
        type="button"
        className="absolute left-[88px] top-10 z-10 inline-flex cursor-pointer items-center gap-1.5 text-[12.5px] text-white/25 transition-colors hover:text-white/70"
      >
        <ArrowLeftIcon className="size-3.5" />
        Back
      </button>

      <div className="relative z-[3] flex h-full items-center pl-[132px] pr-14">
        <motion.div
          key={variant}
          variants={stagger}
          initial="hidden"
          animate="show"
          className="w-full max-w-[560px]"
        >
          <Heading />

          <motion.div variants={rise} style={{ marginTop: RHYTHM.headingToFolder }}>
            {variant === "chip" ? <FolderChip directory={directory} /> : null}
            {variant === "row" ? <FolderRow directory={directory} /> : null}
            {variant === "shelf" ? <FolderShelf directory={directory} /> : null}
          </motion.div>

          <motion.div
            variants={rise}
            className="flex items-center"
            style={{ marginTop: RHYTHM.folderToActions, gap: RHYTHM.actionsGap }}
          >
            <motion.button
              type="button"
              onClick={onConfirm}
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.97 }}
              transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
              className="inline-flex cursor-pointer items-center gap-2 rounded-full px-7 py-3.5 text-[14px] font-medium"
              style={{
                background: EMBER,
                color: "#180b04",
                boxShadow: "0 14px 44px rgba(255,106,44,0.16)",
              }}
            >
              {CONFIRM_LABEL}
              <ArrowUpRightIcon className="size-4" strokeWidth={2.4} />
            </motion.button>
            <button
              type="button"
              onClick={onPick}
              className="cursor-pointer text-[13px] text-white/45 underline-offset-4 transition-colors hover:text-white/85 hover:underline"
            >
              {picking ? PICKING_LABEL : CHANGE_LABEL}
            </button>
          </motion.div>
        </motion.div>
      </div>
    </div>
  )
}

// ── Easel chrome ──────────────────────────────────────────────────────────

function ChromeToggle({
  active,
  children,
  onClick,
}: {
  active: boolean
  children: ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-pointer rounded-full border px-3 py-1.5 text-[12px] transition-colors"
      style={{
        borderColor: active ? "rgba(255,106,44,0.5)" : "rgba(255,255,255,0.1)",
        color: active ? EMBER_WARM : "rgba(255,255,255,0.45)",
        background: active ? "rgba(255,106,44,0.08)" : "transparent",
      }}
    >
      {children}
    </button>
  )
}

export function LocationStepOptionsEasel() {
  useLocationFont()
  const [variant, setVariant] = useState<LocationVariant>("row")
  const [deepPath, setDeepPath] = useState(false)
  const [picking, setPicking] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  useEffect(() => {
    if (!picking) return
    const timer = setTimeout(() => {
      setPicking(false)
      setDeepPath(true)
    }, PICK_DELAY_MS)
    return () => clearTimeout(timer)
  }, [picking])

  const directory = describeDirectory(deepPath ? SAMPLE_PATHS.deep : SAMPLE_PATHS.default)

  return (
    <div
      className="flex h-full min-h-0 w-full flex-col"
      style={{ background: EASEL_BG, fontFamily: TIGHT }}
    >
      <StyleTag />

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/[0.07] px-4 py-2.5">
        {LOCATION_VARIANTS.map((id) => (
          <ChromeToggle key={id} active={variant === id} onClick={() => setVariant(id)}>
            {VARIANT_LABEL[id]}
          </ChromeToggle>
        ))}
        <span className="ml-1 min-w-0 truncate text-[12px] text-white/30">
          {VARIANT_NOTE[variant]}
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <ChromeToggle active={deepPath} onClick={() => setDeepPath(!deepPath)}>
            Deep custom path
          </ChromeToggle>
          <ChromeToggle
            active={false}
            onClick={() => {
              setDeepPath(false)
              setPicking(false)
              setConfirmed(false)
            }}
          >
            Reset
          </ChromeToggle>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 items-stretch justify-center p-4">
        <div
          className="relative h-full w-full max-w-[1060px] overflow-hidden rounded-xl border border-white/[0.09]"
          style={{ boxShadow: "0 44px 130px rgba(0,0,0,0.6)" }}
        >
          <LocationStep
            variant={variant}
            directory={directory}
            picking={picking}
            onPick={() => setPicking(true)}
            onConfirm={() => setConfirmed(true)}
          />
          {confirmed ? (
            <p
              className="absolute bottom-5 left-[132px] z-10 text-[12.5px]"
              style={{ color: EMBER_WARM }}
            >
              Setting up {directory.name}…
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
