import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { ArrowUpIcon, Button, PlusIcon, ToggleGroup, ToggleGroupItem, cn } from "@buddy/ui"
import { UserSection } from "@/components/chat/sections/user-section"
import { TextShimmer } from "@/components/chat/tools/text-shimmer"
import { CHAT_BODY_TEXT_STYLE } from "@/components/chat/chat-text-styles"
import { PlayIcon } from "@/icons/app-icons"
import type { MessageWithParts } from "@/state/chat-types"
import "@/components/prompt/composer-surfaces.css"
import { findSelectValue } from "./select-value"

type MotionID = "previous" | "instant" | "fade" | "rise" | "glide" | "handoff" | "spring"
type Speed = "1" | "2" | "4"
type MessageLength = "short" | "medium" | "long"
type View = "one" | "all"

type Tween = {
  keyframes: Keyframe[]
  duration: number
  delay?: number
  easing: string
  origin?: string
}

type Travel = {
  duration: number
  easing: string
}

type SendMotion = {
  id: MotionID
  label: string
  summary: string
  spec: string
  bubble: Tween[]
  thinking: Tween[]
  glide?: Travel
  handoff?: Travel
}

type Turn = {
  id: string
  text: string
  reply: string
  replied: boolean
}

type PendingSend = {
  composerRect: DOMRect | undefined
}

type PlayRequest = {
  signal: number
  text: string
}

const SPEEDS: Speed[] = ["1", "2", "4"]
const LENGTHS: MessageLength[] = ["short", "medium", "long"]
const VIEWS: View[] = ["one", "all"]
const MAX_TURNS = 5
const REPLY_DELAY_MS = 1600

const TAILWIND_EASE_OUT = "cubic-bezier(0, 0, 0.2, 1)"
const EASE_OUT_CUBIC = "cubic-bezier(0.33, 1, 0.68, 1)"
const EASE_OUT_QUINT = "cubic-bezier(0.22, 1, 0.36, 1)"
const EMPHASIZED_DECELERATE = "cubic-bezier(0.05, 0.7, 0.1, 1)"

function springEasing(stiffness: number, damping: number): Travel {
  const step = 1 / 240
  const samples = [0]
  let position = 0
  let velocity = 0
  let elapsed = 0
  while (elapsed < 2) {
    velocity += (-stiffness * (position - 1) - damping * velocity) * step
    position += velocity * step
    elapsed += step
    samples.push(position)
    if (Math.abs(position - 1) < 0.001 && Math.abs(velocity) < 0.01) break
  }
  const stride = Math.max(1, Math.ceil(samples.length / 48))
  const points = samples.filter((_, index) => index % stride === 0)
  points.push(1)
  return {
    duration: Math.round(elapsed * 1000),
    easing: `linear(${points.map((point) => point.toFixed(4)).join(", ")})`,
  }
}

const SPRING = springEasing(300, 22)

const fadeIn = (duration: number, delay = 0): Tween => ({
  keyframes: [{ opacity: 0 }, { opacity: 1 }],
  duration,
  delay,
  easing: TAILWIND_EASE_OUT,
})

const MOTIONS: SendMotion[] = [
  {
    id: "previous",
    label: "Previous · corner zoom",
    summary:
      "What Buddy did before Spring shipped. The block grows from 85% out of its bottom-right corner while fading in; the thinking row de-blurs 100ms later.",
    spec: "scale .85→1 + opacity · 400ms out-cubic · origin bottom-right · thinking blur 6px→0, +100ms, 300ms",
    bubble: [
      {
        keyframes: [
          { opacity: 0, transform: "scale(0.85)" },
          { opacity: 1, transform: "scale(1)" },
        ],
        duration: 400,
        easing: EASE_OUT_CUBIC,
        origin: "bottom right",
      },
    ],
    thinking: [
      {
        keyframes: [
          { opacity: 0, filter: "blur(6px)" },
          { opacity: 1, filter: "blur(0px)" },
        ],
        duration: 300,
        delay: 100,
        easing: TAILWIND_EASE_OUT,
      },
    ],
  },
  {
    id: "instant",
    label: "Instant",
    summary: "No motion at all. The baseline every other option has to beat.",
    spec: "0ms",
    bubble: [],
    thinking: [],
  },
  {
    id: "fade",
    label: "Fade",
    summary:
      "Opacity only, and short. Nothing moves or resizes, so the words never look like they are zooming.",
    spec: "opacity · 160ms ease-out · thinking +60ms",
    bubble: [fadeIn(160)],
    thinking: [fadeIn(160, 60)],
  },
  {
    id: "rise",
    label: "Rise",
    summary:
      "A short lift from just below its slot, the direction the composer sits in. The usual chat default.",
    spec: "y 12px→0 + opacity · 240ms out-quint · thinking y 6px, +80ms",
    bubble: [
      {
        keyframes: [
          { opacity: 0, transform: "translateY(12px)" },
          { opacity: 1, transform: "translateY(0)" },
        ],
        duration: 240,
        easing: EASE_OUT_QUINT,
      },
    ],
    thinking: [
      {
        keyframes: [
          { opacity: 0, transform: "translateY(6px)" },
          { opacity: 1, transform: "translateY(0)" },
        ],
        duration: 220,
        delay: 80,
        easing: EASE_OUT_QUINT,
      },
    ],
  },
  {
    id: "glide",
    label: "Glide",
    summary:
      "The transcript slides up to make room instead of jumping, and the new message rides up with it from behind the composer.",
    spec: "whole stack y +turn height→0 · 320ms emphasized-decelerate · new rows opacity 200ms",
    glide: { duration: 320, easing: EMPHASIZED_DECELERATE },
    bubble: [fadeIn(200)],
    thinking: [fadeIn(200, 100)],
  },
  {
    id: "handoff",
    label: "Handoff",
    summary:
      "The text lifts out of the composer and travels to its slot, so it never vanishes in one place and reappears in another. Earlier messages glide up in step.",
    spec: "bubble flies from composer text to slot · 380ms emphasized-decelerate · stack glide · thinking +260ms",
    glide: { duration: 380, easing: EMPHASIZED_DECELERATE },
    handoff: { duration: 380, easing: EMPHASIZED_DECELERATE },
    bubble: [],
    thinking: [fadeIn(180, 260)],
  },
  {
    id: "spring",
    label: "Spring · shipped",
    summary:
      "Rises from a little lower on a lightly damped spring and settles with a hint of overshoot instead of a fixed curve.",
    spec: `y 24px→0 on spring k300 c22 (≈${SPRING.duration}ms) · opacity 120ms · thinking +90ms`,
    bubble: [
      {
        keyframes: [{ transform: "translateY(24px)" }, { transform: "translateY(0)" }],
        duration: SPRING.duration,
        easing: SPRING.easing,
      },
      fadeIn(120),
    ],
    thinking: [fadeIn(180, 90)],
  },
]

const PREVIOUS_PROBLEMS = [
  "It scales text. At 85% the far corner of a long message travels 15% of the bubble's width and height, and the words visibly grow.",
  "It grows out of the bubble's right corner, a point with no relation to the composer the text just left.",
  "400ms is long for acknowledging your own action, and earlier messages shift up in one frame while the new one is still growing.",
  "The thinking row de-blurs instead of fading, a third motion in the same beat.",
]

const SAMPLE_MESSAGES = {
  short: "What's the difference between recall and recognition?",
  medium:
    "I keep re-reading my notes before the exam and they feel familiar, but I blank when I try to write answers from memory. Why does that happen, and what should I change this week?",
  long: "I'm preparing for the organic chemistry final in nine days. I have the lecture slides, two practice exams with answer keys, and about forty pages of my own handwritten notes that I've scanned.\n\nMy problem is that I understand the mechanisms when I read through a worked solution, but when I sit down with a blank page I can't reproduce the arrow-pushing on my own. I also lose track of which reagents do what once there are more than two steps.\n\nCan you build me a plan that splits the nine days between practice problems, flashcards for reagents, and full timed practice exams? I can study about three hours a day, and I'd like to leave the last day light.",
} satisfies Record<MessageLength, string>

const REPLIES = [
  "Recognition only asks you to notice something you've seen before. Recall asks you to rebuild it from nothing, which is why it's the better test of whether you know it.",
  "Familiarity is recognition, and it's easy to mistake for knowing. Close the notes and try to write each answer first; check afterwards.",
  "Here's a nine-day plan that front-loads mechanisms, moves reagents into spaced flashcards, and saves the two timed exams for days six and eight.",
  "Short answer: test yourself before you review. Getting it wrong first makes the correction stick.",
]

const SEED_TURNS: Turn[] = [
  {
    id: "seed-1",
    text: "Can you explain spaced repetition in one paragraph?",
    reply:
      "Spaced repetition schedules each review for just before you're likely to forget. Every successful recall pushes the next review further out, so the material you know well drifts away from your queue while the shaky material keeps coming back.",
    replied: true,
  },
  {
    id: "seed-2",
    text: "And how is that different from cramming?",
    reply:
      "Cramming packs every review into one session, so it feels productive but mostly builds short-term familiarity. Spacing the same number of reviews across days forces real recall each time, which is what makes it last.",
    replied: true,
  },
]

const SPEED_LABEL = { "1": "1×", "2": "½×", "4": "¼×" } satisfies Record<Speed, string>
const LENGTH_LABEL = { short: "Short", medium: "Medium", long: "Long" } satisfies Record<
  MessageLength,
  string
>

function userMessage(turn: Turn): MessageWithParts {
  return {
    info: {
      id: turn.id,
      sessionID: "easel-sent-message-motion",
      role: "user",
      agent: "buddy",
      model: { providerID: "easel", modelID: "easel" },
      time: { created: 1 },
    },
    parts: [
      {
        id: `${turn.id}-text`,
        sessionID: "easel-sent-message-motion",
        messageID: turn.id,
        type: "text",
        text: turn.text,
      },
    ],
  }
}

function playTween(element: HTMLElement, tween: Tween, scale: number) {
  if (tween.origin) element.style.transformOrigin = tween.origin
  return element.animate(tween.keyframes, {
    duration: tween.duration * scale,
    delay: (tween.delay ?? 0) * scale,
    easing: tween.easing,
    fill: "backwards",
  })
}

function flyGhost(input: {
  bubbleRow: HTMLElement
  stage: HTMLElement
  layer: HTMLElement
  from: DOMRect
  travel: Travel
  scale: number
}) {
  const surface = input.bubbleRow.querySelector<HTMLElement>(".composer-surface-bubble")
  if (!surface) return []
  const target = surface.getBoundingClientRect()
  const stageRect = input.stage.getBoundingClientRect()
  const ghost = surface.cloneNode(true)
  if (!(ghost instanceof HTMLElement)) return []
  Object.assign(ghost.style, {
    position: "absolute",
    left: `${target.left - stageRect.left}px`,
    top: `${target.top - stageRect.top}px`,
    width: `${target.width}px`,
    margin: "0",
  })
  input.layer.append(ghost)
  const duration = input.travel.duration * input.scale
  const flight = ghost.animate(
    [
      {
        transform: `translate(${input.from.left - target.left}px, ${input.from.top - target.top}px)`,
      },
      { transform: "translate(0, 0)" },
    ],
    { duration, easing: input.travel.easing },
  )
  const removeGhost = () => ghost.remove()
  flight.addEventListener("finish", removeGhost)
  flight.addEventListener("cancel", removeGhost)
  return [flight, input.bubbleRow.animate([{ opacity: 0 }, { opacity: 0 }], { duration })]
}

function SendStage(props: {
  motion: SendMotion
  scale: number
  play: PlayRequest
  sample: string
  compact?: boolean
}) {
  const [turns, setTurns] = useState<Turn[]>(SEED_TURNS)
  const [draft, setDraft] = useState("")
  const stageRef = useRef<HTMLDivElement>(null)
  const stackRef = useRef<HTMLDivElement>(null)
  const layerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const pendingRef = useRef<PendingSend | undefined>(undefined)
  const runningRef = useRef<Animation[]>([])
  const timersRef = useRef<number[]>([])
  const counterRef = useRef(0)
  const handledSignalRef = useRef(props.play.signal)
  const motionRef = useRef(props.motion)
  const scaleRef = useRef(props.scale)
  motionRef.current = props.motion
  scaleRef.current = props.scale

  const send = useCallback((text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    for (const animation of runningRef.current) animation.finish()
    runningRef.current = []
    pendingRef.current = { composerRect: textareaRef.current?.getBoundingClientRect() }
    counterRef.current += 1
    const id = `sent-${counterRef.current}`
    const reply = REPLIES[(counterRef.current - 1) % REPLIES.length] ?? ""
    setTurns((current) =>
      [...current, { id, text: trimmed, reply, replied: false }].slice(-MAX_TURNS),
    )
    setDraft("")
    const timer = window.setTimeout(() => {
      setTurns((current) =>
        current.map((turn) => (turn.id === id ? { ...turn, replied: true } : turn)),
      )
    }, REPLY_DELAY_MS * scaleRef.current)
    timersRef.current.push(timer)
  }, [])

  useEffect(() => {
    if (props.play.signal === handledSignalRef.current) return
    handledSignalRef.current = props.play.signal
    send(props.play.text)
  }, [props.play, send])

  useEffect(
    () => () => {
      for (const timer of timersRef.current) window.clearTimeout(timer)
      for (const animation of runningRef.current) animation.cancel()
    },
    [],
  )

  useLayoutEffect(() => {
    const pending = pendingRef.current
    const stack = stackRef.current
    const turnID = turns.at(-1)?.id
    if (!pending || !stack || !turnID) return
    pendingRef.current = undefined
    const turnRow = stack.querySelector<HTMLElement>(`[data-turn-id="${turnID}"]`)
    const bubbleRow = turnRow?.querySelector<HTMLElement>('[data-send-part="bubble"]')
    const thinkingRow = turnRow?.querySelector<HTMLElement>('[data-send-part="thinking"]')
    if (!turnRow || !bubbleRow || !thinkingRow) return
    const motion = motionRef.current
    const scale = scaleRef.current
    const running: Animation[] = []
    if (motion.handoff && pending.composerRect && stageRef.current && layerRef.current) {
      running.push(
        ...flyGhost({
          bubbleRow,
          stage: stageRef.current,
          layer: layerRef.current,
          from: pending.composerRect,
          travel: motion.handoff,
          scale,
        }),
      )
    }
    if (motion.glide) {
      running.push(
        stack.animate(
          [{ transform: `translateY(${turnRow.offsetHeight}px)` }, { transform: "translateY(0)" }],
          { duration: motion.glide.duration * scale, easing: motion.glide.easing },
        ),
      )
    }
    for (const tween of motion.bubble) running.push(playTween(bubbleRow, tween, scale))
    for (const tween of motion.thinking) running.push(playTween(thinkingRow, tween, scale))
    runningRef.current = running
  }, [turns])

  return (
    <div
      ref={stageRef}
      className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-background-base"
    >
      <div className="flex min-h-0 flex-1 flex-col justify-end overflow-hidden">
        <div
          ref={stackRef}
          className={cn("mx-auto w-full max-w-200 pb-2", props.compact ? "px-3" : "px-8")}
        >
          {turns.map((turn) => (
            <div key={turn.id} data-turn-id={turn.id} className="pt-6">
              <div data-send-part="bubble">
                <UserSection userMessage={userMessage(turn)} providers={[]} />
              </div>
              <div data-send-part="thinking" className="pt-5">
                {turn.replied ? (
                  <p
                    className="animate-in fade-in text-sm leading-relaxed duration-300"
                    style={CHAT_BODY_TEXT_STYLE}
                  >
                    {turn.reply}
                  </p>
                ) : (
                  <div className="flex h-6 items-center text-sm text-text-weak">
                    <TextShimmer text="Thinking" />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div
        className={cn(
          "relative z-10 mx-auto w-full max-w-200 shrink-0 pb-4 pt-2",
          props.compact ? "px-3" : "px-8",
        )}
      >
        <form
          className="composer-surface composer-grain relative"
          onSubmit={(event) => {
            event.preventDefault()
            send(draft || props.sample)
          }}
        >
          <textarea
            ref={textareaRef}
            value={draft}
            rows={props.compact ? 1 : 2}
            placeholder={props.compact ? "Ask Buddy" : "Type and press Enter, or send the sample"}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.shiftKey) return
              event.preventDefault()
              send(draft || props.sample)
            }}
            className="relative z-[3] block w-full resize-none bg-transparent px-4 py-3 text-sm text-text-strong outline-none placeholder:text-text-weaker"
          />
          <div className="relative z-[3] flex items-center justify-between px-2.5 pb-2.5">
            <span className="inline-flex size-7 items-center justify-center rounded-full text-icon-base">
              <PlusIcon className="size-3.5" />
            </span>
            <button
              type="submit"
              aria-label="Send"
              className="inline-flex size-7 items-center justify-center rounded-full bg-surface-interactive-base text-text-on-interactive-base transition-colors hover:opacity-90"
            >
              <ArrowUpIcon className="size-4" />
            </button>
          </div>
        </form>
      </div>
      <div ref={layerRef} className="pointer-events-none absolute inset-0 z-20" />
    </div>
  )
}

export function SentMessageMotionEasel() {
  const [motionID, setMotionID] = useState<MotionID>("spring")
  const [speed, setSpeed] = useState<Speed>("1")
  const [length, setLength] = useState<MessageLength>("short")
  const [view, setView] = useState<View>("one")
  const [play, setPlay] = useState<PlayRequest>({ signal: 0, text: "" })
  const motion = MOTIONS.find((candidate) => candidate.id === motionID) ?? MOTIONS[0]
  const sample = SAMPLE_MESSAGES[length]
  const scale = Number(speed)

  const replay = (text = sample) => setPlay((current) => ({ signal: current.signal + 1, text }))

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border-weaker-base px-4 py-2.5">
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={view}
          onValueChange={(value) => {
            const next = findSelectValue(value, VIEWS)
            if (next) setView(next)
          }}
        >
          <ToggleGroupItem value="one" className="text-xs">
            One at a time
          </ToggleGroupItem>
          <ToggleGroupItem value="all" className="text-xs">
            All seven
          </ToggleGroupItem>
        </ToggleGroup>
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={length}
          onValueChange={(value) => {
            const next = findSelectValue(value, LENGTHS)
            if (next) setLength(next)
          }}
        >
          {LENGTHS.map((option) => (
            <ToggleGroupItem key={option} value={option} className="text-xs">
              {LENGTH_LABEL[option]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={speed}
          onValueChange={(value) => {
            const next = findSelectValue(value, SPEEDS)
            if (next) setSpeed(next)
          }}
        >
          {SPEEDS.map((option) => (
            <ToggleGroupItem key={option} value={option} className="text-xs tabular-nums">
              {SPEED_LABEL[option]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Button size="sm" onClick={() => replay()}>
          <PlayIcon className="size-3.5" />
          {view === "all" ? "Send to all" : "Send sample"}
        </Button>
      </div>

      {view === "one" ? (
        <div className="flex min-h-0 flex-1">
          <div className="flex w-80 shrink-0 flex-col gap-1.5 overflow-y-auto border-r border-border-weaker-base p-3">
            {MOTIONS.map((candidate, index) => (
              <button
                key={candidate.id}
                type="button"
                onClick={() => {
                  setMotionID(candidate.id)
                  replay()
                }}
                className={cn(
                  "flex flex-col gap-1 rounded-lg border px-3 py-2.5 text-left transition-colors",
                  candidate.id === motionID
                    ? "border-border-base bg-surface-weak"
                    : "border-transparent hover:bg-surface-base-hover",
                )}
              >
                <span className="flex items-baseline gap-2 text-xs font-medium text-text-strong">
                  <span className="tabular-nums text-text-weaker">{index + 1}</span>
                  {candidate.label}
                </span>
                <span className="text-xs leading-relaxed text-text-weak">{candidate.summary}</span>
                <span className="font-mono text-[10px] leading-relaxed text-text-weaker">
                  {candidate.spec}
                </span>
              </button>
            ))}
            <div className="mt-3 flex flex-col gap-2 border-t border-border-weaker-base px-3 pt-4">
              <span className="text-xs font-medium text-text-strong">
                Why the corner zoom read as strange
              </span>
              {PREVIOUS_PROBLEMS.map((problem) => (
                <p key={problem} className="text-xs leading-relaxed text-text-weak">
                  {problem}
                </p>
              ))}
            </div>
          </div>
          <div className="min-h-0 min-w-0 flex-1">
            <SendStage motion={motion} scale={scale} play={play} sample={sample} />
          </div>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 auto-rows-[minmax(22rem,1fr)] grid-cols-2 gap-px overflow-y-auto bg-border-weaker-base xl:grid-cols-4">
          {MOTIONS.map((candidate, index) => (
            <div key={candidate.id} className="flex min-h-0 flex-col bg-background-base">
              <div className="flex shrink-0 items-baseline gap-2 px-3 pt-2.5 text-xs font-medium text-text-strong">
                <span className="tabular-nums text-text-weaker">{index + 1}</span>
                {candidate.label}
              </div>
              <div className="min-h-0 flex-1">
                <SendStage motion={candidate} scale={scale} play={play} sample={sample} compact />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
