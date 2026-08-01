import type { AnyFieldApi } from "@tanstack/react-form"
import { AnimatePresence, motion } from "motion/react"
import { ArrowLeftIcon, ArrowUpRightIcon, FolderIcon, XIcon } from "@/icons/app-icons"
import type { PrimaryUse, PersonalizationSettings } from "@/state/project-config-readers"
import { describeDirectory } from "@/lib/directory-display"
import { resolveBuddyIconUrl } from "@/lib/static-asset"
import {
  COPY,
  EASE_OUT,
  LOCATION_ACTION,
  MONO,
  type CinematicLocationAction,
  ONBOARDING_STEPS,
  SELECT_SPRING,
  SERIF,
  container,
  rise,
  type CinematicOnboardingStep,
} from "./constants"
import { Eyebrow, Heading, MenuChoice, Pill, chatgptGlyph, EncryptedText } from "./primitives"

type PersonalizationFormApi = {
  Field: (props: {
    name: keyof PersonalizationSettings
    children: (field: AnyFieldApi) => React.ReactNode
  }) => React.ReactNode
}

/**
 * Set inline rather than as Tailwind classes. `border-white/[0.09]` does not
 * generate, which leaves the bare `border` on `border-color: currentColor` —
 * and this route sets `text-[#ffffff]`, so the row came out with a solid white
 * hairline instead of a 9% one.
 */
const FOLDER_ROW = {
  border: "rgba(255,255,255,0.09)",
  surface: "rgba(255,255,255,0.032)",
  paddingY: 18,
  paddingX: 20,
  glyph: 16,
  glyphColor: "rgba(255,255,255,0.38)",
  pathSize: 14.5,
  ancestorColor: "rgba(255,255,255,0.34)",
  nameColor: "#f7f1e8",
} as const

function FeedbackLine({ error, fallback }: { error?: string; fallback: string }) {
  return (
    <motion.p
      variants={rise}
      role={error ? "alert" : undefined}
      className="mt-6 text-[12px] text-white/30"
    >
      {error ?? fallback}
    </motion.p>
  )
}

export function Intro({ onBegin }: { onBegin: () => void }) {
  return (
    <motion.div
      key="intro"
      initial="hidden"
      animate="show"
      exit={{
        opacity: 0,
        y: -26,
        filter: "blur(8px)",
        transition: { duration: 0.5, ease: EASE_OUT },
      }}
      variants={container}
      className="flex w-full flex-col items-center text-center"
    >
      <motion.div
        variants={{
          hidden: { opacity: 0, scale: 0.82, y: 8 },
          show: {
            opacity: 1,
            scale: 1,
            y: 0,
            transition: { ...SELECT_SPRING, delay: 0.05 },
          },
        }}
        className="relative mb-6"
      >
        <div
          className="absolute inset-0 -z-10 scale-[1.4] rounded-full opacity-60 blur-2xl"
          style={{
            background: "radial-gradient(closest-side, var(--brand-bloom), transparent 70%)",
          }}
        />
        {/* tracks the headline's clamp so the mark stays ~1.8x the type at every width */}
        <img
          src={resolveBuddyIconUrl()}
          alt="Buddy"
          className="ob-float aspect-square"
          style={{
            width: "clamp(84px, 12.3vw, 128px)",
            filter: "drop-shadow(0 10px 40px var(--brand-bloom))",
          }}
        />
      </motion.div>
      <Heading lines={COPY.intro.heading} className="text-[clamp(34px,5vw,52px)] leading-[1.02]" />
      <div className="mt-14">
        <Pill onClick={onBegin}>{COPY.intro.begin}</Pill>
      </div>
    </motion.div>
  )
}

export function ModeScreen({
  value,
  busy,
  error,
  onHover,
  onSelect,
}: {
  value?: PrimaryUse
  busy: boolean
  error?: string
  onHover: (value?: PrimaryUse) => void
  onSelect: (value: PrimaryUse) => void
}) {
  return (
    <>
      <Heading lines={COPY.mode.heading} />
      {/*
        No subheading to fill the gap the engine step has, so the gap carries it
        alone. Both rows stay neutral: these are equals, and a mark on one would
        read as a recommendation.
      */}
      <motion.div variants={rise} className="mt-12">
        <MenuChoice
          title={COPY.mode.choiceLearn.title}
          description={COPY.mode.choiceLearn.description}
          selected={value === "learn"}
          busy={busy}
          onHover={(hovering) => onHover(hovering ? "learn" : undefined)}
          onClick={() => onSelect("learn")}
        />
        <MenuChoice
          title={COPY.mode.choiceTeach.title}
          description={COPY.mode.choiceTeach.description}
          selected={value === "teach"}
          busy={busy}
          onHover={(hovering) => onHover(hovering ? "teach" : undefined)}
          onClick={() => onSelect("teach")}
        />
      </motion.div>
      {error ? <FeedbackLine error={error} fallback="" /> : null}
    </>
  )
}

export function EngineScreen({
  selected,
  busy,
  error,
  onChooseChatGpt,
  onChooseFree,
}: {
  selected?: "chatgpt_plus" | "free_models"
  busy: boolean
  error?: string
  onChooseChatGpt: () => void
  onChooseFree: () => void
}) {
  return (
    <>
      <Heading lines={COPY.engine.heading} emphasizeLast />
      <motion.p variants={rise} className="mt-4 text-[15px] leading-relaxed text-white/45">
        {COPY.engine.subheading}
      </motion.p>
      <motion.div variants={rise} className="mt-9">
        <MenuChoice
          title={COPY.engine.choiceChatGPT.title}
          description={COPY.engine.choiceChatGPT.description}
          emphasis="recommended"
          leading={<span className="size-[22px] text-white/60">{chatgptGlyph}</span>}
          // The only row in the flow that hands off to the browser, so it is the
          // only one that gets the outward arrow.
          trailing={
            <ArrowUpRightIcon className="size-5 -translate-x-1 text-white/25 opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:text-white/70 group-hover:opacity-100" />
          }
          selected={selected === "chatgpt_plus"}
          busy={busy}
          onClick={onChooseChatGpt}
        />
        <MenuChoice
          title={COPY.engine.choiceFree.title}
          description={COPY.engine.choiceFree.description}
          emphasis="subdued"
          leading={null}
          selected={selected === "free_models"}
          busy={busy}
          onClick={onChooseFree}
        />
      </motion.div>
      <FeedbackLine error={error} fallback={COPY.engine.footnote} />
    </>
  )
}

export function LocationScreen({
  homeDirectory,
  pending,
  error,
  onUseDefault,
  onPickFolder,
}: {
  homeDirectory: string
  pending?: CinematicLocationAction
  error?: string
  onUseDefault: () => void
  onPickFolder: () => void
}) {
  const folder = describeDirectory(homeDirectory)
  const busy = pending !== undefined

  return (
    <>
      <Heading lines={COPY.location.heading} />
      {/*
        The row is the only element here without a natural edge, so it gets one:
        unanchored, a single line of path floats. Inside it the glyph and the
        path sit on one optical band — `leading-none` collapses the mono line box
        to the type itself, so centring the boxes centres what you actually see.
      */}
      <motion.div
        variants={rise}
        title={homeDirectory}
        className="mt-12 flex w-full items-center gap-2.5 rounded-xl border"
        style={{
          borderColor: FOLDER_ROW.border,
          background: FOLDER_ROW.surface,
          padding: `${FOLDER_ROW.paddingY}px ${FOLDER_ROW.paddingX}px`,
        }}
      >
        <span
          className="flex shrink-0 items-center justify-center"
          style={{ width: FOLDER_ROW.glyph, height: FOLDER_ROW.glyph }}
        >
          <FolderIcon
            style={{
              width: FOLDER_ROW.glyph,
              height: FOLDER_ROW.glyph,
              color: FOLDER_ROW.glyphColor,
            }}
            strokeWidth={1.5}
          />
        </span>
        <span
          className="min-w-0 truncate leading-none"
          style={{ fontFamily: MONO, fontSize: FOLDER_ROW.pathSize }}
        >
          <span style={{ color: FOLDER_ROW.ancestorColor }}>{folder.ancestors}</span>
          <span style={{ color: FOLDER_ROW.nameColor }}>{folder.name}</span>
        </span>
      </motion.div>
      <motion.div variants={rise} className="mt-11 flex items-center gap-7">
        <Pill onClick={onUseDefault} disabled={busy}>
          {pending === LOCATION_ACTION.confirm
            ? COPY.location.btnConfirmSettingUp
            : COPY.location.btnConfirm}
        </Pill>
        <button
          type="button"
          onClick={onPickFolder}
          disabled={busy}
          className="cursor-pointer text-[13px] text-white/45 underline-offset-4 transition-colors hover:text-white/85 hover:underline disabled:cursor-default disabled:opacity-50"
        >
          {pending === LOCATION_ACTION.pick
            ? COPY.location.btnCustomOpening
            : COPY.location.btnCustom}
        </button>
      </motion.div>
      {error ? <FeedbackLine error={error} fallback="" /> : null}
    </>
  )
}

export function DetailsScreen({
  form,
  busy,
  error,
  onFinish,
  onSkip,
}: {
  form: PersonalizationFormApi
  busy: boolean
  error?: string
  onFinish: () => void
  onSkip: () => void
}) {
  return (
    <>
      <Eyebrow>{COPY.details.eyebrow}</Eyebrow>
      <Heading lines={COPY.details.heading} />

      <motion.div variants={rise} className="mt-8 flex flex-col gap-6">
        <form.Field name="preferredName">
          {(field) => (
            <div className="flex flex-col gap-2">
              <label
                className="text-[12px] font-medium tracking-wide text-white/50"
                htmlFor="ob-name"
              >
                {COPY.details.labelName}
              </label>
              <input
                id="ob-name"
                type="text"
                value={field.state.value}
                placeholder={COPY.details.placeholderName}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-[15px] text-[#ffffff] outline-none transition-colors placeholder:text-white/20 hover:bg-white/[0.05] focus:border-white/20"
                style={{ caretColor: "var(--brand-ring)" }}
              />
            </div>
          )}
        </form.Field>

        <form.Field name="occupation">
          {(field) => (
            <div className="flex flex-col gap-2">
              <label
                className="text-[12px] font-medium tracking-wide text-white/50"
                htmlFor="ob-occupation"
              >
                {COPY.details.labelOccupation}
              </label>
              <input
                id="ob-occupation"
                type="text"
                value={field.state.value}
                placeholder={COPY.details.placeholderOccupation}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-[15px] text-[#ffffff] outline-none transition-colors placeholder:text-white/20 hover:bg-white/[0.05] focus:border-white/20"
                style={{ caretColor: "var(--brand-ring)" }}
              />
            </div>
          )}
        </form.Field>

        <form.Field name="moreAboutYou">
          {(field) => (
            <div className="flex flex-col gap-2">
              <label
                className="text-[12px] font-medium tracking-wide text-white/50"
                htmlFor="ob-about"
              >
                {COPY.details.labelAbout}
              </label>
              <textarea
                id="ob-about"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                rows={3}
                placeholder={COPY.details.placeholderAbout}
                className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-[15px] leading-relaxed text-[#ffffff] outline-none transition-colors placeholder:text-white/20 hover:bg-white/[0.05] focus:border-white/20"
                style={{ caretColor: "var(--brand-ring)" }}
              />
            </div>
          )}
        </form.Field>
      </motion.div>

      {error ? <FeedbackLine error={error} fallback="" /> : null}
      <motion.div variants={rise} className="mt-8 flex items-center gap-6">
        <Pill onClick={onFinish} disabled={busy}>
          {COPY.details.btnFinish}
        </Pill>
        <button
          type="button"
          onClick={onSkip}
          disabled={busy}
          className="cursor-pointer text-[13px] text-white/40 underline-offset-4 transition-colors hover:text-white/75 hover:underline disabled:cursor-default disabled:opacity-50"
        >
          {COPY.details.btnSkip}
        </button>
      </motion.div>
    </>
  )
}

export function Finish({ expanding }: { expanding: boolean }) {
  return (
    <motion.div
      key="done"
      variants={container}
      initial="hidden"
      animate="show"
      className="flex w-full flex-col items-center justify-center text-center"
    >
      <motion.div
        animate={{ opacity: expanding ? 0 : 1, y: expanding ? -30 : 0 }}
        transition={{ duration: 1.2, ease: "easeInOut" }}
      >
        <h2
          className="whitespace-nowrap text-[clamp(38px,5.4vw,58px)] font-semibold leading-[1.0]"
          style={{ fontFamily: SERIF, color: "#faf6f0" }}
        >
          <EncryptedText
            text="Welcome to Buddy."
            revealDelayMs={95}
            encryptedClassName="font-mono text-white/30 opacity-40"
            revealedClassName="text-[#ffffff]"
          />
        </h2>
      </motion.div>
    </motion.div>
  )
}

export function HeaderRail({
  visible,
  step,
  onBack,
}: {
  visible: boolean
  step: CinematicOnboardingStep
  onBack: () => void
}) {
  const index = ONBOARDING_STEPS.indexOf(step)

  return (
    <motion.div
      initial={false}
      animate={{ opacity: visible ? 1 : 0 }}
      transition={{ duration: 0.4, ease: EASE_OUT }}
      className="relative z-10 flex items-center justify-between px-9 pt-14 sm:px-14"
    >
      <div className="flex w-16 justify-start">
        <AnimatePresence>
          {visible && index > 0 ? (
            <motion.button
              type="button"
              onClick={onBack}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="inline-flex cursor-pointer items-center gap-1.5 text-[13px] text-white/40 transition-colors hover:text-white/80"
            >
              <ArrowLeftIcon className="size-3.5" />
              {COPY.chrome.backButton}
            </motion.button>
          ) : null}
        </AnimatePresence>
      </div>

      {visible ? (
        <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-2" aria-hidden>
          {ONBOARDING_STEPS.map((progressStep, progressIndex) => (
            <div
              key={progressStep}
              className="h-[3px] w-9 overflow-hidden rounded-full bg-white/10"
            >
              <motion.div
                className="h-full w-full origin-left rounded-full"
                initial={false}
                animate={{
                  scaleX: progressIndex <= index ? 1 : 0,
                  opacity: progressIndex < index ? 0.55 : progressIndex === index ? 1 : 0,
                }}
                transition={{ duration: 0.45, ease: EASE_OUT }}
                style={{ background: "var(--brand-ring)" }}
              />
            </div>
          ))}
        </div>
      ) : null}

      <div className="w-16" />
    </motion.div>
  )
}

export function AuthOverlay({ open, onCancel }: { open: boolean; onCancel: () => void }) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          data-component="onboarding-auth-modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.24, ease: EASE_OUT }}
          className="absolute inset-0 z-30 flex flex-col items-center justify-center backdrop-blur-md"
          style={{ background: "rgba(10,10,12,0.74)" }}
        >
          <div className="relative flex size-24 items-center justify-center">
            <div
              className="ob-orbit absolute inset-0 rounded-full"
              style={{
                background:
                  "conic-gradient(from 0deg, transparent, var(--brand-ring), transparent 62%)",
                WebkitMask:
                  "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px))",
                mask: "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px))",
              }}
            />
            <span className="size-7 text-white/85">{chatgptGlyph}</span>
          </div>
          <p
            className="mt-7 text-[22px] text-white/95"
            style={{ fontFamily: SERIF, fontWeight: 500 }}
          >
            {COPY.auth.title}
          </p>
          <p className="mt-1.5 text-[13px] text-white/40">{COPY.auth.description}</p>
          <button
            type="button"
            data-action="onboarding-cancel-auth"
            onClick={onCancel}
            className="mt-8 inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-white/12 px-4 py-2 text-[13px] text-white/55 transition-colors hover:border-white/25 hover:text-white/85"
          >
            <XIcon className="size-3.5" />
            {COPY.auth.cancel}
          </button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
