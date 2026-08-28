import { Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Switch, cn } from "@buddy/ui"
import { GalleryStory, GallerySection, Specimen, SpecimenGrid, TokenTag } from "./gallery-primitives"
import { useTokenSamples, contrastRatio, type TokenSample } from "./use-token-samples"

/**
 * Tokens that participate in vertical stacking. Ordered by the elevation they
 * are *intended* to express, so a reading that breaks the order is a bug.
 */
const ELEVATION_TOKENS = [
  "background-base",
  "surface-raised-base",
  "surface-raised-base-hover",
  "input-base",
  "input-hover",
  "surface-inset-base",
  "surface-inset-base-hover",
  "surface-raised-stronger-non-alpha",
  "surface-weak",
  "border-base",
] as const

/**
 * `input-base` carries alpha, so reading it over the page background measures a stack that
 * never renders. The specimen below sits on a card — sample it there, or the check can neither
 * catch a real inversion nor avoid reporting a false one.
 */
const CARD_TOKEN = "surface-raised-base"
const INPUT_ON_CARD_TOKEN = `input-base>${CARD_TOKEN}`
const CONTROL_ON_CARD_TOKENS = [INPUT_ON_CARD_TOKEN, CARD_TOKEN] as const

function formatLuminance(value: number): string {
  return value.toFixed(4)
}

function SampleBar(props: { sample: TokenSample; maxLuminance: number }) {
  const width = props.maxLuminance > 0 ? (props.sample.luminance / props.maxLuminance) * 100 : 0

  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span
        className="size-6 shrink-0 rounded-md border border-border-weaker-base"
        style={{ backgroundColor: props.sample.css }}
      />
      <code className="w-56 shrink-0 truncate font-mono text-[10px] text-text-base">
        {props.sample.token}
      </code>
      <code className="w-16 shrink-0 font-mono text-[10px] text-text-weak">{props.sample.hex}</code>
      <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-weak">
        <div
          className="h-full rounded-full bg-surface-interactive-base"
          style={{ width: `${Math.min(100, Math.max(0, width))}%` }}
        />
      </div>
      <code className="w-14 shrink-0 text-right font-mono text-[10px] tabular-nums text-text-weak">
        {formatLuminance(props.sample.luminance)}
      </code>
    </div>
  )
}

export function SurfacesStory() {
  const samples = useTokenSamples(ELEVATION_TOKENS)
  const maxLuminance = samples.reduce((max, sample) => Math.max(max, sample.luminance), 0)
  const byToken = new Map(samples.map((sample) => [sample.token, sample]))
  const onCard = useTokenSamples(CONTROL_ON_CARD_TOKENS)
  const byOnCardToken = new Map(onCard.map((sample) => [sample.token, sample]))
  const card = byOnCardToken.get(CARD_TOKEN)
  const input = byOnCardToken.get(INPUT_ON_CARD_TOKEN)
  const inverted = card && input ? input.luminance < card.luminance : false

  return (
    <GalleryStory>
      <GallerySection
        title="Elevation ladder"
        description="Every stacking token, sampled live from the applied theme and composited over the page background. In a dark theme each rung should read brighter than the one it sits on; in a light theme the order inverts."
      >
        <div className="flex flex-col gap-2 rounded-lg border border-border-weaker-base/70 p-3">
          {samples.map((sample) => (
            <SampleBar key={sample.token} sample={sample} maxLuminance={maxLuminance} />
          ))}
        </div>
      </GallerySection>

      <GallerySection
        title="Control on card"
        description="A control painted on a raised card. If the control reads darker than the card behind it, the elevation has inverted and the control will look punched out rather than raised."
      >
        <div className="rounded-2xl border border-border-base/50 bg-surface-raised-base p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Input className="h-8 w-40 text-xs" defaultValue="14" aria-label="Sample input" />
            <Select defaultValue="dark">
              <SelectTrigger size="sm" className="w-32 text-xs" aria-label="Sample select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dark">Dark</SelectItem>
                <SelectItem value="light">Light</SelectItem>
              </SelectContent>
            </Select>
            <Switch defaultChecked aria-label="Sample switch" />
            <Switch aria-label="Sample switch off" />
          </div>
          {card && input ? (
            <p
              className={cn(
                "mt-3 text-[11px]",
                inverted ? "text-text-critical-base" : "text-text-weak",
              )}
            >
              {inverted
                ? `Inverted: input-base (${formatLuminance(input.luminance)}) sits below surface-raised-base (${formatLuminance(card.luminance)}).`
                : `Correct: input-base (${formatLuminance(input.luminance)}) sits above surface-raised-base (${formatLuminance(card.luminance)}).`}
              {" Contrast "}
              {contrastRatio(input.luminance, card.luminance).toFixed(2)}
              {":1"}
            </p>
          ) : null}
        </div>
      </GallerySection>

      <GallerySection
        title="Surface swatches"
        description="The same neutral swatch rendered with each surface token, for eyeballing the gaps between adjacent rungs."
      >
        <SpecimenGrid dense>
          {ELEVATION_TOKENS.map((token) => {
            const sample = byToken.get(token)
            return (
              <Specimen key={token} label={token} note={sample?.hex}>
                <span
                  className="h-9 w-full rounded-md border border-border-weaker-base"
                  style={{ backgroundColor: sample?.css }}
                />
              </Specimen>
            )
          })}
        </SpecimenGrid>
      </GallerySection>

      <GallerySection title="Reading the numbers">
        <p className="text-[11px] leading-relaxed text-text-weak">
          Luminance is WCAG relative luminance of the composited color, so it is directly comparable
          across tokens and themes. Alpha tokens are painted over{" "}
          <TokenTag>background-base</TokenTag> before sampling, which is what the eye sees on the
          page but not necessarily what a control sees on a raised parent.
        </p>
      </GallerySection>
    </GalleryStory>
  )
}
