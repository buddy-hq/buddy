import {
  Easing,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion"

const COMPOSER_WIDTH = 768
const COMPOSER_HEIGHT = 128
const EDITOR_HEIGHT = 84
const TOOLBAR_HEIGHT = COMPOSER_HEIGHT - EDITOR_HEIGHT
const ACCESSORY_ROW_HEIGHT = 34
const EDITOR_FONT_SIZE = 18
const EDITOR_LINE_HEIGHT = 28
const EDITOR_CARET_HEIGHT = 22
const SURFACE_RADIUS = 16
const CONTROL_SIZE = 28
const ACCESSORY_CONTROL_SIZE = 24
const ICON_STROKE_WIDTH = 2
const APPROXIMATE_CHARACTERS_PER_WORD = 5
const SECONDS_PER_MINUTE = 60
const CARET_BLINK_HALF_PERIOD_FRAMES = 15
const SUBMIT_PRESS_FRAME = 3
const SUBMIT_RELEASE_FRAME = 8
const SUBMIT_PULSE_END_FRAME = 10
const SUBMIT_ARROW_LIFT_END_FRAME = 10
const SUBMIT_PRESS_SCALE = 0.88
const SUBMIT_PULSE_SCALE = 1.65
const SUBMIT_ARROW_LIFT_PIXELS = -12
const SUBMIT_EASING = Easing.bezier(0.23, 1, 0.32, 1)

const COLORS = {
  accessory: "#8e8c99",
  background: "#12131b",
  caret: "#f8f8f2",
  editorText: "#f1f0f6",
  placeholder: "#b8b6c1",
  sendDisabled: "#6e657e",
  sendDisabledIcon: "#aaa4b5",
  sendEnabled: "#bd93f9",
  sendEnabledIcon: "#282a36",
  surfaceBottom: "#1b1c23",
  surfaceTop: "#1e1e26",
  toolbarText: "#c1bfc9",
} as const

const GRAIN_IMAGE = `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`
const SURFACE_SHADOW =
  "0 1px 2px -1px rgba(0,0,0,0.08), 0 12px 28px -12px rgba(0,0,0,0.18)"

type IconProps = {
  readonly color?: string
  readonly size: number
}

const PlusIcon = ({ color = "currentColor", size }: IconProps) => {
  return (
    <svg
      aria-hidden="true"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      <path
        d="M12.001 5.00003V19.002"
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={ICON_STROKE_WIDTH}
      />
      <path
        d="M19.002 12.002L4.99998 12.002"
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={ICON_STROKE_WIDTH}
      />
    </svg>
  )
}

const ArrowUpIcon = ({ color = "currentColor", size }: IconProps) => {
  return (
    <svg
      aria-hidden="true"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      <path
        d="M12 5.5V19"
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={ICON_STROKE_WIDTH}
      />
      <path
        d="M18 11C18 11 13.5811 5.00001 12 5C10.4188 4.99999 6 11 6 11"
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={ICON_STROKE_WIDTH}
      />
    </svg>
  )
}

const ChevronDownIcon = ({ color = "currentColor", size }: IconProps) => {
  return (
    <svg
      aria-hidden="true"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      <path
        d="M18 9.00005C18 9.00005 13.5811 15 12 15C10.4188 15 6 9 6 9"
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={ICON_STROKE_WIDTH}
      />
    </svg>
  )
}

const PenIcon = ({ color = "currentColor", size }: IconProps) => {
  return (
    <svg
      aria-hidden="true"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      <path
        d="M15.2141 5.98239L16.6158 4.58063C17.39 3.80646 18.6452 3.80646 19.4194 4.58063C20.1935 5.3548 20.1935 6.60998 19.4194 7.38415L18.0176 8.78591L9.78375 17.0198C8.73844 18.0651 8.21579 18.5877 7.57889 18.9436C6.94199 19.2995 5.43809 19.6576 4 20C4.3424 18.5619 4.70047 17.058 5.05637 16.4211C5.41226 15.7842 5.93493 15.2616 6.98023 14.2163L15.2141 5.98239Z"
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={ICON_STROKE_WIDTH}
      />
      <path
        d="M11 20H17"
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeWidth={ICON_STROKE_WIDTH}
      />
    </svg>
  )
}

const GamepadIcon = ({ color = "currentColor", size }: IconProps) => {
  return (
    <svg
      aria-hidden="true"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      <path
        d="M3.01486 18.0594C3.661 18.6865 4.44018 19 5.35238 19C5.99092 19 6.58385 18.8396 7.13117 18.5188C7.67849 18.1979 8.08898 17.7604 8.36264 17.2063C8.67356 16.6032 8.82901 16.3016 9.05447 16.0785C9.27611 15.8591 9.54597 15.6946 9.84249 15.5982C10.1441 15.5 10.4834 15.5 11.1619 15.5H12.841C13.5004 15.5 13.8301 15.5 14.1236 15.5925C14.4382 15.6917 14.7233 15.8671 14.9537 16.1032C15.1686 16.3234 15.3173 16.6177 15.6146 17.2063C15.8883 17.7604 16.2988 18.1979 16.8461 18.5188C17.3934 18.8396 17.9864 19 18.6249 19C19.5523 19 20.3467 18.6901 21.008 18.0703C21.6694 17.4505 22 16.6958 22 15.8063C22 15.675 21.9886 15.5401 21.9658 15.4016C21.943 15.263 21.9164 15.1281 21.886 14.9969L20.8403 10.983C20.0911 8.10773 19.7166 6.67008 18.6361 5.83504C17.5556 5 16.07 5 13.0987 5H10.8855C7.91888 5 6.43556 5 5.35584 5.83306C4.27612 6.66613 3.89982 8.10093 3.14723 10.9705L2.09126 14.9969C2.06085 15.1281 2.03805 15.2594 2.02284 15.3906C2.00764 15.5219 2.00004 15.6531 2.00004 15.7844C2.03044 16.674 2.36872 17.4323 3.01486 18.0594Z"
        fill="none"
        stroke={color}
        strokeWidth={ICON_STROKE_WIDTH}
      />
      <path
        d="M8.5 8.5V12.5M10.5 10.5H6.5"
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeWidth={ICON_STROKE_WIDTH}
      />
      <circle cx="16.75" cy="9.25" fill={color} r="0.75" />
      <circle cx="14.25" cy="11.75" fill={color} r="0.75" />
    </svg>
  )
}

const ContextRing = ({ size }: Pick<IconProps, "size">) => {
  return (
    <div
      style={{
        background: `conic-gradient(#7c3aed 22deg, #353640 22deg 360deg)`,
        borderRadius: "50%",
        height: size,
        position: "relative",
        width: size,
      }}
    >
      <div
        style={{
          backgroundColor: COLORS.background,
          borderRadius: "50%",
          inset: 3,
          position: "absolute",
        }}
      />
    </div>
  )
}

type SelectorLabelProps = {
  readonly children: string
}

const SelectorLabel = ({ children }: SelectorLabelProps) => {
  return (
    <div
      style={{
        alignItems: "center",
        color: COLORS.toolbarText,
        display: "flex",
        fontSize: 12,
        gap: 5,
        height: CONTROL_SIZE,
        lineHeight: 1,
        padding: "0 8px",
      }}
    >
      <span>{children}</span>
      <ChevronDownIcon color={COLORS.toolbarText} size={10} />
    </div>
  )
}

export type PromptComposerMockProps = {
  readonly modelLabel: string
  readonly placeholder: string
  readonly showAccessoryRow?: boolean
  readonly submitFrame?: number
  readonly text: string
  readonly thinkingLabel: string
  readonly typingStartFrame?: number
  readonly wordsPerMinute: number
}

type PromptTypingDurationInput = {
  readonly fps: number
  readonly text: string
  readonly wordsPerMinute: number
}

const getFramesPerCharacter = ({
  fps,
  wordsPerMinute,
}: Omit<PromptTypingDurationInput, "text">): number => {
  if (wordsPerMinute <= 0) {
    throw new Error("Prompt typing speed must be greater than zero.")
  }

  return (
    (fps * SECONDS_PER_MINUTE) /
    (wordsPerMinute * APPROXIMATE_CHARACTERS_PER_WORD)
  )
}

export const getPromptTypingFrameOffsets = ({
  fps,
  text,
  wordsPerMinute,
}: PromptTypingDurationInput): readonly number[] => {
  const framesPerCharacter = getFramesPerCharacter({ fps, wordsPerMinute })

  return Array.from({ length: text.length }, (_, index) =>
    Math.ceil((index + 1) * framesPerCharacter),
  )
}

export const getPromptTypingDurationInFrames = ({
  fps,
  text,
  wordsPerMinute,
}: PromptTypingDurationInput): number => {
  return getPromptTypingFrameOffsets({ fps, text, wordsPerMinute }).at(-1) ?? 0
}

export const PromptComposerMock = ({
  modelLabel,
  placeholder,
  showAccessoryRow = true,
  submitFrame,
  text,
  thinkingLabel,
  typingStartFrame = 0,
  wordsPerMinute,
}: PromptComposerMockProps) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  if (wordsPerMinute <= 0) {
    throw new Error("PromptComposerMock wordsPerMinute must be greater than zero.")
  }

  const framesPerCharacter = getFramesPerCharacter({ fps, wordsPerMinute })
  const elapsedTypingFrames = Math.max(0, frame - typingStartFrame)
  const typedCharacterCount = Math.min(
    text.length,
    Math.floor(elapsedTypingFrames / framesPerCharacter),
  )
  const displayedText = text.slice(0, typedCharacterCount)
  const typingHasStarted = frame >= typingStartFrame
  const canSubmit = displayedText.length > 0
  const submitAnimationFrame =
    submitFrame === undefined ? 0 : Math.max(0, frame - submitFrame)
  const submitHasStarted = submitFrame !== undefined && frame >= submitFrame
  const submitButtonScale = submitHasStarted
    ? interpolate(
        submitAnimationFrame,
        [0, SUBMIT_PRESS_FRAME, SUBMIT_RELEASE_FRAME],
        [1, SUBMIT_PRESS_SCALE, 1],
        {
          easing: SUBMIT_EASING,
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        },
      )
    : 1
  const submitPulseOpacity = submitHasStarted
    ? interpolate(
        submitAnimationFrame,
        [0, SUBMIT_PULSE_END_FRAME],
        [0.45, 0],
        {
          easing: SUBMIT_EASING,
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        },
      )
    : 0
  const submitPulseScale = submitHasStarted
    ? interpolate(
        submitAnimationFrame,
        [0, SUBMIT_PULSE_END_FRAME],
        [0.9, SUBMIT_PULSE_SCALE],
        {
          easing: SUBMIT_EASING,
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        },
      )
    : 0.9
  const submitArrowOpacity = submitHasStarted
    ? interpolate(
        submitAnimationFrame,
        [SUBMIT_PRESS_FRAME, SUBMIT_ARROW_LIFT_END_FRAME],
        [1, 0],
        {
          easing: SUBMIT_EASING,
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        },
      )
    : 1
  const submitArrowTranslateY = submitHasStarted
    ? interpolate(
        submitAnimationFrame,
        [SUBMIT_PRESS_FRAME, SUBMIT_ARROW_LIFT_END_FRAME],
        [0, SUBMIT_ARROW_LIFT_PIXELS],
        {
          easing: SUBMIT_EASING,
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        },
      )
    : 0
  const caretVisible =
    typingHasStarted &&
    !submitHasStarted &&
    Math.floor(frame / CARET_BLINK_HALF_PERIOD_FRAMES) % 2 === 0

  return (
    <div
      style={{
        color: COLORS.editorText,
        fontFamily:
          '"Inter Variable", Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, sans-serif',
        height: COMPOSER_HEIGHT + (showAccessoryRow ? ACCESSORY_ROW_HEIGHT : 0),
        width: COMPOSER_WIDTH,
      }}
    >
      <div
        style={{
          background: `linear-gradient(180deg, ${COLORS.surfaceTop} 0%, ${COLORS.surfaceBottom} 100%)`,
          borderRadius: SURFACE_RADIUS,
          boxShadow: SURFACE_SHADOW,
          height: COMPOSER_HEIGHT,
          overflow: "hidden",
          position: "relative",
          width: COMPOSER_WIDTH,
        }}
      >
        <div
          style={{
            backgroundImage: GRAIN_IMAGE,
            backgroundRepeat: "repeat",
            backgroundSize: "180px 180px",
            borderRadius: "inherit",
            inset: 0,
            opacity: 0.06,
            pointerEvents: "none",
            position: "absolute",
            zIndex: 2,
          }}
        />

        <div
          style={{
            boxSizing: "border-box",
            color: displayedText ? COLORS.editorText : COLORS.placeholder,
            fontSize: EDITOR_FONT_SIZE,
            height: EDITOR_HEIGHT,
            lineHeight: `${EDITOR_LINE_HEIGHT}px`,
            overflow: "hidden",
            padding: "12px 80px 0 12px",
            position: "relative",
            whiteSpace: "pre-wrap",
            zIndex: 1,
          }}
        >
          {displayedText || (!typingHasStarted ? placeholder : null)}
          {typingHasStarted ? (
            <span
              style={{
                backgroundColor: COLORS.caret,
                display: "inline-block",
                height: EDITOR_CARET_HEIGHT,
                marginLeft: 1,
                opacity: caretVisible ? 0.9 : 0,
                translate: "0px 3px",
                width: 1,
              }}
            />
          ) : null}
        </div>

        <div
          style={{
            alignItems: "center",
            boxSizing: "border-box",
            display: "flex",
            height: TOOLBAR_HEIGHT,
            justifyContent: "space-between",
            padding: "8px",
            position: "relative",
            zIndex: 1,
          }}
        >
          <div
            style={{
              alignItems: "center",
              display: "flex",
              gap: 4,
            }}
          >
            <div
              style={{
                alignItems: "center",
                color: COLORS.toolbarText,
                display: "flex",
                height: CONTROL_SIZE,
                justifyContent: "center",
                width: CONTROL_SIZE,
              }}
            >
              <PlusIcon color={COLORS.toolbarText} size={14} />
            </div>
            <SelectorLabel>{modelLabel}</SelectorLabel>
            <SelectorLabel>{thinkingLabel}</SelectorLabel>
          </div>

          <div
            style={{
              alignItems: "center",
              backgroundColor: canSubmit
                ? COLORS.sendEnabled
                : COLORS.sendDisabled,
              borderRadius: "50%",
              display: "flex",
              height: CONTROL_SIZE,
              justifyContent: "center",
              position: "relative",
              transform: `scale(${submitButtonScale})`,
              width: CONTROL_SIZE,
            }}
          >
            <div
              style={{
                border: `2px solid ${COLORS.sendEnabled}`,
                borderRadius: "50%",
                inset: 0,
                opacity: submitPulseOpacity,
                position: "absolute",
                transform: `scale(${submitPulseScale})`,
              }}
            />
            <div
              style={{
                display: "flex",
                opacity: submitArrowOpacity,
                transform: `translateY(${submitArrowTranslateY}px)`,
              }}
            >
              <ArrowUpIcon
                color={
                  canSubmit
                    ? COLORS.sendEnabledIcon
                    : COLORS.sendDisabledIcon
                }
                size={16}
              />
            </div>
          </div>
        </div>
      </div>

      {showAccessoryRow ? (
        <div
          style={{
            alignItems: "center",
            boxSizing: "border-box",
            display: "flex",
            gap: 6,
            height: ACCESSORY_ROW_HEIGHT,
            justifyContent: "flex-end",
            padding: "6px 8px 4px",
          }}
        >
          <div
            style={{
              alignItems: "center",
              display: "flex",
              height: ACCESSORY_CONTROL_SIZE,
              justifyContent: "center",
              width: ACCESSORY_CONTROL_SIZE,
            }}
          >
            <PenIcon color={COLORS.accessory} size={14} />
          </div>
          <div
            style={{
              alignItems: "center",
              display: "flex",
              height: ACCESSORY_CONTROL_SIZE,
              justifyContent: "center",
              width: ACCESSORY_CONTROL_SIZE,
            }}
          >
            <GamepadIcon color={COLORS.accessory} size={14} />
          </div>
          <div
            style={{
              alignItems: "center",
              display: "flex",
              height: ACCESSORY_CONTROL_SIZE,
              justifyContent: "center",
              width: ACCESSORY_CONTROL_SIZE,
            }}
          >
            <ContextRing size={14} />
          </div>
        </div>
      ) : null}
    </div>
  )
}
