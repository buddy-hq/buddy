import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type Transition,
  type Variants,
} from "motion/react"
import {
  ArrowRightIcon,
  CheckIcon,
  FolderIcon,
  GraduationCapIcon,
  Loader2Icon,
  SparklesIcon,
  UserRoundIcon,
  ZapIcon,
} from "lucide-react"
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react"

/**
 * Brief B — "Atelier"
 *
 * A structured, tactile, two-panel onboarding. The left panel is a living
 * "identity card" that assembles itself as you answer — mode badge lights up,
 * your name lands, occupation becomes a tag, the engine chip docks, the storage
 * path prints. It rewards momentum: you watch Buddy get to know you. The right
 * panel holds one chunky question at a time.
 *
 * Collects the exact same data as the real flow:
 *   1. mode        → learn | teach
 *   2. engine      → chatgpt (browser connect wait) | free
 *   3. location    → default Documents | custom folder
 *   4. details     → preferredName, occupation, moreAboutYou (skippable)
 *
 * UI-only prototype. Async is mocked with timers.
 */

const CONNECT_DELAY_MS = 1_900
const FOLDER_PICK_DELAY_MS = 650
const STEP_MS = 0.34
const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1]
const CARD_SPRING: Transition = { type: "spring", bounce: 0.28, duration: 0.55 }

const FONT_LINK_ID = "ob-atelier-fonts"
const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,600;12..96,700&display=swap"
const DISPLAY = '"Bricolage Grotesque", "Trebuchet MS", system-ui, sans-serif'

// ── Domain (mirrors real onboarding data contract) ──
const MODES = ["learn", "teach"] as const
type Mode = (typeof MODES)[number]

type Engine = "chatgpt" | "free"
type LocationKind = "default" | "custom"

type Details = { name: string; occupation: string; about: string }
const EMPTY_DETAILS: Details = { name: "", occupation: "", about: "" }

const DEFAULT_HOME = "~/Documents/Buddy"
const MOCK_PICKED_HOME = "~/Projects/StudyRoom"

const STEPS = ["mode", "engine", "location", "details"] as const
type Step = (typeof STEPS)[number]

const STEP_LABELS: Record<Step, string> = {
  mode: "Your goal",
  engine: "Your engine",
  location: "Your space",
  details: "About you",
}

const MODE_META: Record<Mode, { label: string; tag: string; tint: string; ink: string }> = {
  learn: { label: "Learning", tag: "Here to learn", tint: "#0f766e", ink: "#ccfbf1" },
  teach: { label: "Teaching", tag: "Here to teach", tint: "#c2410c", ink: "#ffedd5" },
}

const PAPER = "#f4f1ea"
const CARD_BG = "#fffdf8"
const INK = "#1c1917"
const INK_SOFT = "#78716c"
const INK_FAINT = "#a8a29e"
const LINE = "#e7e3d9"
const ACCENT = "#b5451f"

function useFont() {
  useEffect(() => {
    if (document.getElementById(FONT_LINK_ID)) return
    const link = document.createElement("link")
    link.id = FONT_LINK_ID
    link.rel = "stylesheet"
    link.href = FONT_HREF
    document.head.appendChild(link)
  }, [])
}

// ── Left: the identity card that builds itself ──
type CardState = {
  mode?: Mode
  engine?: Engine
  connecting: boolean
  locationKind?: LocationKind
  homePath: string
  details: Details
  finished: boolean
}

function IdentityCard({ state, reduce }: { state: CardState; reduce: boolean }) {
  const rx = useMotionValue(0)
  const ry = useMotionValue(0)
  const rotateX = useSpring(useTransform(rx, (v) => v), { stiffness: 120, damping: 14 })
  const rotateY = useSpring(useTransform(ry, (v) => v), { stiffness: 120, damping: 14 })

  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (reduce) return
    const rect = e.currentTarget.getBoundingClientRect()
    const px = (e.clientX - rect.left) / rect.width - 0.5
    const py = (e.clientY - rect.top) / rect.height - 0.5
    ry.set(px * 6)
    rx.set(py * -6)
  }
  const onLeave = () => {
    rx.set(0)
    ry.set(0)
  }

  const modeMeta = state.mode ? MODE_META[state.mode] : undefined
  const name = state.details.name.trim()

  return (
    <div
      className="flex h-full items-center justify-center p-8"
      style={{ perspective: 1200 }}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
    >
      <motion.div
        style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
        className="relative w-full max-w-[300px] overflow-hidden rounded-[26px]"
      >
        <div
          className="relative flex flex-col gap-5 rounded-[26px] p-6"
          style={{
            background: CARD_BG,
            boxShadow: "0 30px 60px -30px rgba(60,40,20,0.45), 0 2px 0 rgba(255,255,255,0.6) inset",
            border: `1px solid ${LINE}`,
          }}
        >
          {/* card header: avatar + name */}
          <div className="flex items-center gap-3.5">
            <motion.div
              className="flex size-12 shrink-0 items-center justify-center rounded-2xl"
              initial={false}
              animate={{
                background: modeMeta ? modeMeta.tint : "#efeae0",
                color: modeMeta ? modeMeta.ink : INK_FAINT,
              }}
              transition={{ duration: 0.5, ease: EASE_OUT }}
            >
              <AnimatePresence mode="wait">
                <motion.span
                  key={state.mode ?? "none"}
                  initial={{ scale: 0.5, opacity: 0, rotate: -12 }}
                  animate={{ scale: 1, opacity: 1, rotate: 0 }}
                  exit={{ scale: 0.5, opacity: 0 }}
                  transition={CARD_SPRING}
                >
                  {state.mode === "teach" ? (
                    <GraduationCapIcon className="size-6" />
                  ) : (
                    <UserRoundIcon className="size-6" />
                  )}
                </motion.span>
              </AnimatePresence>
            </motion.div>
            <div className="min-w-0 flex-1">
              <AnimatePresence mode="wait">
                {name ? (
                  <motion.p
                    key="name"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="truncate text-[17px] leading-tight"
                    style={{ fontFamily: DISPLAY, fontWeight: 700, color: INK }}
                  >
                    {name}
                  </motion.p>
                ) : (
                  <motion.p
                    key="placeholder"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-[17px] leading-tight"
                    style={{ fontFamily: DISPLAY, fontWeight: 700, color: INK_FAINT }}
                  >
                    Your card
                  </motion.p>
                )}
              </AnimatePresence>
              <AnimatePresence mode="wait">
                <motion.p
                  key={modeMeta?.tag ?? "waiting"}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3, ease: EASE_OUT }}
                  className="mt-0.5 truncate text-[12px]"
                  style={{ color: modeMeta ? modeMeta.tint : INK_FAINT, fontWeight: 600 }}
                >
                  {modeMeta ? modeMeta.tag : "Getting to know you…"}
                </motion.p>
              </AnimatePresence>
            </div>
          </div>

          <div className="h-px w-full" style={{ background: LINE }} />

          {/* rows fill in as data lands */}
          <div className="flex flex-col gap-3">
            <CardRow
              label="Engine"
              filled={Boolean(state.engine)}
              value={
                state.connecting
                  ? "Connecting…"
                  : state.engine === "chatgpt"
                    ? "ChatGPT"
                    : state.engine === "free"
                      ? "Free models"
                      : undefined
              }
              icon={state.connecting ? <Loader2Icon className="size-3.5 animate-spin" /> : undefined}
            />
            <CardRow
              label="Workspace"
              filled={Boolean(state.locationKind)}
              value={state.locationKind ? state.homePath : undefined}
              mono
            />
            <CardRow
              label="Focus"
              filled={Boolean(state.details.occupation.trim())}
              value={state.details.occupation.trim() || undefined}
            />
          </div>

          {/* about note */}
          <AnimatePresence>
            {state.details.about.trim() ? (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3, ease: EASE_OUT }}
                className="overflow-hidden"
              >
                <div
                  className="rounded-2xl px-3.5 py-3 text-[12.5px] leading-relaxed"
                  style={{ background: "#f7f3ea", color: INK_SOFT, border: `1px dashed ${LINE}` }}
                >
                  {state.details.about.trim()}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          {/* seal on finish */}
          <AnimatePresence>
            {state.finished ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={CARD_SPRING}
                className="absolute -right-3 -top-3 flex size-14 rotate-6 items-center justify-center rounded-full text-[#ffffff]"
                style={{ background: ACCENT, boxShadow: "0 10px 24px -8px rgba(181,69,31,0.7)" }}
              >
                <SparklesIcon className="size-6" />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  )
}

function CardRow({
  label,
  filled,
  value,
  mono,
  icon,
}: {
  label: string
  filled: boolean
  value?: string
  mono?: boolean
  icon?: ReactNode
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className="flex size-5 shrink-0 items-center justify-center rounded-full transition-colors duration-300"
        style={{
          background: filled ? "#dcfce7" : "#efeae0",
          color: filled ? "#15803d" : INK_FAINT,
        }}
      >
        {filled ? <CheckIcon className="size-3" strokeWidth={3} /> : null}
      </span>
      <span className="w-[72px] shrink-0 text-[11px] uppercase tracking-wide" style={{ color: INK_FAINT }}>
        {label}
      </span>
      <div className="min-w-0 flex-1 text-right">
        <AnimatePresence mode="wait">
          {value ? (
            <motion.span
              key={value}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.28, ease: EASE_OUT }}
              className="flex items-center justify-end gap-1.5 truncate text-[13px]"
              style={{
                color: INK,
                fontWeight: 600,
                fontFamily: mono ? "ui-monospace, SFMono-Regular, monospace" : DISPLAY,
              }}
            >
              {icon}
              <span className="truncate">{value}</span>
            </motion.span>
          ) : (
            <span
              className="inline-block h-[9px] w-16 rounded-full"
              style={{ background: "#eee9df" }}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ── Right: chunky choice tile ──
function Tile({
  title,
  description,
  icon,
  selected,
  busy,
  onClick,
}: {
  title: string
  description: string
  icon: ReactNode
  selected?: boolean
  busy?: boolean
  onClick: () => void
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-pressed={selected}
      whileHover={busy ? undefined : { y: -3 }}
      whileTap={busy ? undefined : { scale: 0.98 }}
      transition={{ type: "spring", bounce: 0.3, duration: 0.4 }}
      className="group relative flex w-full items-center gap-4 rounded-2xl border-2 bg-white px-5 py-4 text-left outline-none disabled:cursor-default"
      style={{
        borderColor: selected ? ACCENT : LINE,
        background: selected ? "#fff6f1" : CARD_BG,
        boxShadow: selected
          ? "0 12px 26px -14px rgba(181,69,31,0.4)"
          : "0 6px 16px -12px rgba(60,40,20,0.35)",
      }}
    >
      <span
        className="flex size-11 shrink-0 items-center justify-center rounded-xl transition-colors"
        style={{
          background: selected ? ACCENT : "#f4efe6",
          color: selected ? "#fff" : INK_SOFT,
        }}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px]" style={{ fontFamily: DISPLAY, fontWeight: 600, color: INK }}>
          {title}
        </span>
        <span className="mt-0.5 block text-[13px] leading-snug" style={{ color: INK_SOFT }}>
          {description}
        </span>
      </span>
      <AnimatePresence mode="wait">
        {selected ? (
          <motion.span
            key="check"
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.5, opacity: 0 }}
            transition={CARD_SPRING}
            className="flex size-6 items-center justify-center rounded-full text-[#ffffff]"
            style={{ background: ACCENT }}
          >
            <CheckIcon className="size-3.5" strokeWidth={3} />
          </motion.span>
        ) : (
          <ArrowRightIcon
            key="arrow"
            className="size-4 -translate-x-1 opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100"
            style={{ color: INK_FAINT }}
          />
        )}
      </AnimatePresence>
    </motion.button>
  )
}

function Field({
  label,
  value,
  placeholder,
  multiline,
  onChange,
}: {
  label: string
  value: string
  placeholder: string
  multiline?: boolean
  onChange: (v: string) => void
}) {
  const shared =
    "w-full rounded-xl border-2 bg-white px-3.5 py-2.5 text-[14px] outline-none transition-colors placeholder:text-stone-400 focus:border-[color:var(--ob-accent)]"
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-semibold" style={{ color: INK_SOFT }}>
        {label}
      </span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className={`${shared} resize-none`}
          style={{ borderColor: LINE, color: INK }}
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={shared}
          style={{ borderColor: LINE, color: INK }}
        />
      )}
    </label>
  )
}

function Header({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mb-6">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: ACCENT }}>
        {eyebrow}
      </p>
      <h2 className="text-[28px] leading-[1.08]" style={{ fontFamily: DISPLAY, fontWeight: 700, color: INK }}>
        {title}
      </h2>
    </div>
  )
}

export function OnboardingAtelier() {
  useFont()
  const reduce = useReducedMotion() === true

  const [step, setStep] = useState<Step>("mode")
  const [dir, setDir] = useState<1 | -1>(1)
  const [mode, setMode] = useState<Mode>()
  const [engine, setEngine] = useState<Engine>()
  const [connecting, setConnecting] = useState(false)
  const [locationKind, setLocationKind] = useState<LocationKind>()
  const [homePath, setHomePath] = useState(DEFAULT_HOME)
  const [pickingFolder, setPickingFolder] = useState(false)
  const [details, setDetails] = useState<Details>(EMPTY_DETAILS)
  const [finished, setFinished] = useState(false)

  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const defer = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(fn, ms)
    timers.current.push(id)
  }, [])
  useEffect(
    () => () => {
      for (const id of timers.current) clearTimeout(id)
    },
    [],
  )

  const index = STEPS.indexOf(step)
  const goTo = useCallback((next: Step, direction: 1 | -1) => {
    setDir(direction)
    setStep(next)
  }, [])

  const chooseMode = (m: Mode) => {
    setMode(m)
    defer(() => goTo("engine", 1), 240)
  }
  const chooseEngine = (e: Engine) => {
    setEngine(e)
    if (e === "free") {
      defer(() => goTo("location", 1), 240)
      return
    }
    setConnecting(true)
    defer(() => {
      setConnecting(false)
      goTo("location", 1)
    }, CONNECT_DELAY_MS)
  }
  const chooseDefaultHome = () => {
    setLocationKind("default")
    setHomePath(DEFAULT_HOME)
    defer(() => goTo("details", 1), 240)
  }
  const chooseCustomHome = () => {
    setPickingFolder(true)
    defer(() => {
      setPickingFolder(false)
      setLocationKind("custom")
      setHomePath(MOCK_PICKED_HOME)
      defer(() => goTo("details", 1), 240)
    }, FOLDER_PICK_DELAY_MS)
  }
  const finish = () => setFinished(true)
  const restart = () => {
    setFinished(false)
    setMode(undefined)
    setEngine(undefined)
    setLocationKind(undefined)
    setHomePath(DEFAULT_HOME)
    setDetails(EMPTY_DETAILS)
    goTo("mode", -1)
  }

  const cardState: CardState = {
    mode,
    engine,
    connecting,
    locationKind,
    homePath,
    details,
    finished,
  }

  const variants: Variants = {
    enter: (d: number) => ({ opacity: 0, x: reduce ? 0 : d * 28 }),
    center: { opacity: 1, x: 0 },
    exit: (d: number) => ({ opacity: 0, x: reduce ? 0 : d * -28 }),
  }

  return (
    <div
      className="relative flex h-full w-full overflow-hidden"
      style={{ background: PAPER, ["--ob-accent" as string]: ACCENT }}
    >
      {/* ── Left: living identity card ── */}
      <div className="relative hidden w-[42%] shrink-0 md:block" style={{ background: "#efeadd" }}>
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            backgroundImage:
              "radial-gradient(120% 80% at 15% 0%, rgba(255,255,255,0.7), transparent 60%), radial-gradient(80% 70% at 90% 100%, rgba(181,69,31,0.08), transparent 60%)",
          }}
        />
        {/* progress stepper */}
        <div className="absolute left-8 top-8 z-10 flex items-center gap-2">
          <span
            className="flex size-6 items-center justify-center rounded-md text-[#ffffff]"
            style={{ background: ACCENT }}
          >
            <ZapIcon className="size-3.5" />
          </span>
          <span className="text-[14px]" style={{ fontFamily: DISPLAY, fontWeight: 700, color: INK }}>
            Buddy
          </span>
        </div>
        <div className="relative z-10 h-full">
          <IdentityCard state={cardState} reduce={reduce} />
        </div>
      </div>

      {/* ── Right: questions ── */}
      <div className="relative flex min-w-0 flex-1 flex-col">
        {/* step ticker */}
        <div className="flex items-center gap-2 px-9 pt-9">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <span
                className="text-[11px] font-semibold uppercase tracking-wide transition-colors"
                style={{ color: i === index ? ACCENT : i < index ? INK_SOFT : INK_FAINT }}
              >
                {STEP_LABELS[s]}
              </span>
              {i < STEPS.length - 1 ? (
                <span className="h-px w-5" style={{ background: LINE }} />
              ) : null}
            </div>
          ))}
        </div>

        <div className="flex flex-1 items-center px-9 pb-9">
          <div className="w-full max-w-[420px]">
            <AnimatePresence mode="wait" custom={dir}>
              {finished ? (
                <motion.div
                  key="done"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, ease: EASE_OUT }}
                >
                  <Header eyebrow="All set" title={`Welcome aboard${
                    details.name.trim() ? `, ${details.name.trim()}` : ""
                  }.`} />
                  <p className="text-[15px] leading-relaxed" style={{ color: INK_SOFT }}>
                    Your card is complete. Buddy is tuned for{" "}
                    <span style={{ color: ACCENT, fontWeight: 600 }}>
                      {mode === "teach" ? "teaching" : "learning"}
                    </span>{" "}
                    and ready whenever you are.
                  </p>
                  <div className="mt-8 flex items-center gap-3">
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.97 }}
                      className="flex items-center gap-2 rounded-full px-6 py-2.5 text-[14px] text-[#ffffff]"
                      style={{ background: ACCENT, fontFamily: DISPLAY, fontWeight: 600 }}
                    >
                      Open Buddy
                      <ArrowRightIcon className="size-4" strokeWidth={2.5} />
                    </motion.button>
                    <button
                      type="button"
                      onClick={restart}
                      className="text-[13px]"
                      style={{ color: INK_FAINT }}
                    >
                      Replay
                    </button>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key={step}
                  custom={dir}
                  variants={variants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: STEP_MS, ease: EASE_OUT }}
                >
                  {step === "mode" ? (
                    <>
                      <Header eyebrow="Step 1 of 4" title="What are you here to do?" />
                      <div className="flex flex-col gap-3">
                        <Tile
                          title="Learn with Buddy"
                          description="Understand, practise, and remember what matters to you."
                          icon={<UserRoundIcon className="size-5" />}
                          selected={mode === "learn"}
                          onClick={() => chooseMode("learn")}
                        />
                        <Tile
                          title="Teach with Buddy"
                          description="Plan, create, and assess learning experiences for others."
                          icon={<GraduationCapIcon className="size-5" />}
                          selected={mode === "teach"}
                          onClick={() => chooseMode("teach")}
                        />
                      </div>
                    </>
                  ) : null}

                  {step === "engine" ? (
                    <>
                      <Header eyebrow="Step 2 of 4" title="Choose your engine." />
                      <div className="flex flex-col gap-3">
                        <Tile
                          title="Connect ChatGPT"
                          description="Use your account. Models follow your ChatGPT plan."
                          icon={<SparklesIcon className="size-5" />}
                          selected={engine === "chatgpt"}
                          busy={connecting}
                          onClick={() => chooseEngine("chatgpt")}
                        />
                        <Tile
                          title="Free models"
                          description="Start instantly. No account, no setup."
                          icon={<ZapIcon className="size-5" />}
                          selected={engine === "free"}
                          busy={connecting}
                          onClick={() => chooseEngine("free")}
                        />
                      </div>
                      <AnimatePresence>
                        {connecting ? (
                          <motion.p
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className="mt-4 flex items-center gap-2 text-[13px]"
                            style={{ color: INK_SOFT }}
                          >
                            <Loader2Icon className="size-3.5 animate-spin" />
                            Finish sign-in in your browser…
                            <button
                              type="button"
                              onClick={() => setConnecting(false)}
                              className="underline underline-offset-2"
                              style={{ color: ACCENT }}
                            >
                              Cancel
                            </button>
                          </motion.p>
                        ) : null}
                      </AnimatePresence>
                    </>
                  ) : null}

                  {step === "location" ? (
                    <>
                      <Header eyebrow="Step 3 of 4" title="Where should your work live?" />
                      <div className="flex flex-col gap-3">
                        <Tile
                          title="Keep it in Documents"
                          description={DEFAULT_HOME}
                          icon={<FolderIcon className="size-5" />}
                          selected={locationKind === "default"}
                          busy={pickingFolder}
                          onClick={chooseDefaultHome}
                        />
                        <Tile
                          title="Choose another folder"
                          description={
                            locationKind === "custom" ? homePath : "Pick where Buddy creates notebooks."
                          }
                          icon={<FolderIcon className="size-5" />}
                          selected={locationKind === "custom"}
                          busy={pickingFolder}
                          onClick={chooseCustomHome}
                        />
                      </div>
                    </>
                  ) : null}

                  {step === "details" ? (
                    <>
                      <Header eyebrow="Step 4 of 4 · Optional" title="Tell Buddy about you." />
                      <div className="flex flex-col gap-4">
                        <Field
                          label="What should Buddy call you?"
                          value={details.name}
                          placeholder="Your name"
                          onChange={(name) => setDetails((d) => ({ ...d, name }))}
                        />
                        <Field
                          label="What do you do?"
                          value={details.occupation}
                          placeholder="Student, engineer, teacher…"
                          onChange={(occupation) => setDetails((d) => ({ ...d, occupation }))}
                        />
                        <Field
                          label="Anything else?"
                          value={details.about}
                          placeholder="Goals, context, preferences…"
                          multiline
                          onChange={(about) => setDetails((d) => ({ ...d, about }))}
                        />
                      </div>
                      <div className="mt-7 flex items-center justify-between">
                        <button
                          type="button"
                          onClick={finish}
                          className="text-[13px]"
                          style={{ color: INK_FAINT }}
                        >
                          Skip for now
                        </button>
                        <motion.button
                          type="button"
                          onClick={finish}
                          whileTap={{ scale: 0.97 }}
                          className="flex items-center gap-2 rounded-full px-6 py-2.5 text-[14px] text-[#ffffff]"
                          style={{ background: ACCENT, fontFamily: DISPLAY, fontWeight: 600 }}
                        >
                          Finish setup
                          <ArrowRightIcon className="size-4" strokeWidth={2.5} />
                        </motion.button>
                      </div>
                    </>
                  ) : null}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  )
}
