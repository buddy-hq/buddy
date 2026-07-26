import { useState } from "react"
import { Badge, Switch, ToggleGroup, ToggleGroupItem, cn } from "@buddy/ui"
import { WhiteboardOpeningAnimation } from "@/components/whiteboard/whiteboard-opening-animation"
import {
  WHITEBOARD_OPENING_VARIANTS,
  type WhiteboardOpeningSelection,
} from "@/components/whiteboard/whiteboard-opening-animation-data"

type TintOption = {
  id: string
  label: string
  className: string
  token: string
}

/** `interactive` is what the whiteboard pane ships; the rest are here for comparison. */
const TINT_OPTIONS: TintOption[] = [
  {
    id: "interactive",
    label: "Interactive",
    className: "text-icon-interactive-base",
    token: "--icon-interactive-base",
  },
  { id: "weaker", label: "Weaker", className: "text-text-weaker", token: "--text-weaker" },
  { id: "weak", label: "Weak", className: "text-text-weak", token: "--text-weak" },
  {
    id: "primary",
    label: "Theme primary",
    className: "text-theme-primary-base",
    token: "--theme-primary-base",
  },
]

const SEQUENCE_SELECTION = "sequence" satisfies WhiteboardOpeningSelection

function asSelection(value: string): WhiteboardOpeningSelection | undefined {
  if (value === SEQUENCE_SELECTION) return value
  return WHITEBOARD_OPENING_VARIANTS.find((variant) => variant.id === value)?.id
}

export function WhiteboardOpeningLottieEasel() {
  const [tintID, setTintID] = useState(TINT_OPTIONS[0].id)
  const [showCaption, setShowCaption] = useState(false)
  const [focused, setFocused] = useState<WhiteboardOpeningSelection>(SEQUENCE_SELECTION)

  const tint = TINT_OPTIONS.find((option) => option.id === tintID) ?? TINT_OPTIONS[0]
  const focusedVariant = WHITEBOARD_OPENING_VARIANTS.find((variant) => variant.id === focused)

  return (
    <section className="flex size-full min-h-0 flex-col overflow-auto bg-background-base p-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <header className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-text-strong">
              Whiteboard opening · diagram assembling
            </h2>
            <Badge variant="outline">Shipped</Badge>
          </div>
          <p className="max-w-3xl text-xs leading-relaxed text-text-weak">
            Live in the whiteboard bench pane, in the interactive colour and with no copy — it
            replaced the “Opening whiteboard...” line. All three compositions play in turn on a single
            timeline, Flow then Branch then Curve, with the same empty beat between each and before
            the loop restarts. Rounded cards, curved bezier connectors, everything drawn with eased
            trim paths. Hand-authored bodymovin in pure white, tinted through{" "}
            <span className="font-mono text-[11px]">currentColor</span>: one asset, every theme.
          </p>
        </header>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-border-weaker-base bg-surface-base px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-text-weaker">Ink</span>
            <ToggleGroup
              type="single"
              size="sm"
              value={tintID}
              onValueChange={(next) => {
                if (next) setTintID(next)
              }}
            >
              {TINT_OPTIONS.map((option) => (
                <ToggleGroupItem key={option.id} value={option.id} className="px-2 text-[11px]">
                  {option.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          <label className="flex items-center gap-2 text-[11px] font-medium text-text-weaker">
            <Switch checked={showCaption} onCheckedChange={setShowCaption} />
            Show a caption anyway
          </label>

          <span className="ml-auto font-mono text-[10px] text-text-weaker">{tint.token}</span>
        </div>

        {/* Pane-sized stage first: this is the size the decision actually gets made at. */}
        <article className="flex min-w-0 flex-col gap-3 rounded-xl border border-border-weaker-base bg-surface-base p-3 shadow-sm">
          <header className="flex flex-wrap items-start justify-between gap-3 px-1">
            <div className="flex min-w-0 flex-col gap-1">
              <h3 className="text-xs font-medium text-text-strong">
                Bench pane scale · {focusedVariant ? focusedVariant.title : "Full sequence"}
              </h3>
              <p className="max-w-2xl text-[11px] leading-relaxed text-text-weaker">
                {focusedVariant
                  ? focusedVariant.concept
                  : "What ships: Flow, Branch, then Curve back to back, each separated by the same empty beat."}
              </p>
            </div>
            <ToggleGroup
              type="single"
              size="sm"
              value={focused}
              onValueChange={(next) => {
                const selection = asSelection(next)
                if (selection) setFocused(selection)
              }}
            >
              <ToggleGroupItem value={SEQUENCE_SELECTION} className="px-2 text-[11px]">
                Sequence
              </ToggleGroupItem>
              {WHITEBOARD_OPENING_VARIANTS.map((variant) => (
                <ToggleGroupItem key={variant.id} value={variant.id} className="px-2 text-[11px]">
                  {variant.title}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </header>
          <div className="relative h-[32rem] overflow-hidden rounded-lg border border-border-weaker-base bg-background-base">
            <WhiteboardOpeningAnimation
              key={focused}
              selection={focused}
              className={cn("h-full", tint.className)}
            />
            {showCaption ? (
              <p className="absolute inset-x-0 bottom-6 text-center text-sm text-text-weaker">
                Buddy is drawing
              </p>
            ) : null}
          </div>
        </article>

        <div className="grid gap-4 xl:grid-cols-3">
          {WHITEBOARD_OPENING_VARIANTS.map((variant, index) => (
            <article
              key={variant.id}
              className="flex min-w-0 flex-col gap-3 rounded-xl border border-border-weaker-base bg-surface-base p-3 shadow-sm"
            >
              <header className="flex items-center justify-between gap-2 px-1">
                <h3 className="text-xs font-medium text-text-strong">
                  {index + 1}. {variant.title}
                </h3>
                <Badge variant="secondary" className="font-mono text-[10px]">
                  {variant.id}
                </Badge>
              </header>
              <div className="h-56 overflow-hidden rounded-lg border border-border-weaker-base bg-background-base">
                <WhiteboardOpeningAnimation
                  selection={variant.id}
                  className={cn("h-full", tint.className)}
                />
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
