import { useState, type ReactNode } from "react"
import { Separator, ToggleGroup, ToggleGroupItem, cn } from "@buddy/ui"

/**
 * Easel · Why a selected segment does not look selected
 *
 * FIXED — the change described here has landed in toggleVariants. This page is
 * kept as the record of what was wrong and the proof that it no longer is.
 *
 * `toggleVariants` in packages/ui/src/components/ui/toggle.tsx used to paint
 * three different states with one token:
 *
 *     hover:bg-surface-weak
 *     aria-pressed:bg-surface-weak
 *     data-[state=on]:bg-surface-weak
 *
 * So "selected" and "the pointer happens to be here" were the same pixel value,
 * with no second signal at all — the text colour, the weight and the border
 * were identical in both states. The only way to know which segment was on was
 * to move the pointer away and remember what changed.
 *
 * It was worst where these controls actually live. Every reader preferences
 * segment sits in a popover on `surface-raised-stronger-non-alpha`, and
 * `surface-weak` is close to that fill in dark mode, so the selected segment
 * was nearly invisible against its own container.
 *
 * PROVENANCE — not a Buddy regression. `git diff 22c907d327` on this file shows
 * the only substantive change Buddy ever made to it is the token rename:
 * muted → surface-weak, ring → border-interactive-base, and so on. The upstream
 * string already read `hover:bg-muted` … `data-[state=on]:bg-muted`. The
 * collapse arrived with the component, so there is nothing to revert to. Per
 * packages/ui/AGENTS.md — shadcn is the foundation, the Buddy token layer is
 * the theme — overriding it here is the intended move.
 *
 * SCOPE — `toggleVariants` is consumed by `Toggle` and by `ToggleGroupItem`,
 * but packages/ui/src/index.ts exports only ToggleGroup and ToggleGroupItem, so
 * `Toggle` is unreachable from the app and there is no second surface to mock.
 * One string, one consumer. Everything below is the real ToggleGroup from
 * @buddy/ui — its real variants, its real sizes. The audit for other components
 * carrying the same class of defect is in
 * docs/known-issues/state-collapsed-into-hover.md.
 */

// ── Domain ────────────────────────────────────────────────────────────────

type Surface = "page" | "raised"

const SURFACE_CLASS = {
  page: "bg-background-base",
  raised: "bg-surface-raised-stronger-non-alpha",
} satisfies Record<Surface, string>

const SURFACE_LABEL = {
  page: "on the page · background-base",
  raised: "in a popover · surface-raised-stronger-non-alpha",
} satisfies Record<Surface, string>

const SURFACES: Surface[] = ["page", "raised"]

/** Exactly the variants and sizes toggleVariants defines. Nothing invented. */
const VARIANTS = ["default", "outline"] as const
type ToggleVariant = (typeof VARIANTS)[number]

const SIZES = ["sm", "default", "lg"] as const
type ToggleSize = (typeof SIZES)[number]

/**
 * The OLD on-state, reconstructed.
 *
 * The fix has landed in toggleVariants, so the shipped component now paints the
 * on-state correctly and the "after" column below needs no override at all —
 * it is the component as it is. The "before" column is the one that now has to
 * be reproduced by hand, by overriding the fix back to what it replaced.
 *
 * Two reasons it cannot be assembled from parts at runtime:
 *
 *   Specificity. `data-[state=on]:bg-…` compiles to a class plus an attribute
 *   selector, so a bare `bg-…` passed through className loses to the shipped
 *   on-state wherever it lands in the cascade. Prefixed, tailwind-merge sees
 *   the two as one declaration and the later one wins.
 *
 *   Extraction. Tailwind scans source text; a class name built by string
 *   concatenation is never generated at all.
 *
 * The `data-[state=on]:hover:` companion is the part most easily forgotten. An
 * attribute selector and `:hover` have equal specificity, so without it,
 * hovering the selected segment hands it straight back to the hover colour —
 * the bug, reintroduced in the one case anyone tests by hand.
 */
const REGRESSED_ON_STATE =
  "data-[state=on]:bg-surface-weak data-[state=on]:text-text-base data-[state=on]:hover:bg-surface-weak"

const SEGMENTS = [
  { id: "serif", label: "Serif" },
  { id: "sans", label: "Sans" },
  { id: "publisher", label: "Publisher" },
]

// ── The collision, without a pointer ──────────────────────────────────────

/**
 * The core claim, static: ON and HOVER were the same declaration. You could not
 * catch this by hovering, because to hover the selected segment you have to
 * stop looking at the unselected one — which is why it survived review for as
 * long as it did.
 */
function CollisionRow(props: { title: string; onClass: string; caption: string }) {
  return (
    <div className="flex min-w-[18rem] flex-1 flex-col gap-1.5">
      <p className="text-xs font-medium text-text-strong">{props.title}</p>
      <div className="flex items-center gap-2 rounded-lg bg-surface-raised-stronger-non-alpha p-2 ring-1 ring-border-weak-base">
        <span
          className={cn(
            "inline-flex h-8 items-center rounded-lg px-3 text-sm font-medium text-text-base",
            props.onClass,
          )}
        >
          selected
        </span>
        <span className="inline-flex h-8 items-center rounded-lg bg-surface-weak px-3 text-sm font-medium text-text-base">
          hovered
        </span>
        <span className="inline-flex h-8 items-center rounded-lg px-3 text-sm font-medium text-text-weak">
          idle
        </span>
      </div>
      <p className="text-xs leading-relaxed text-text-weak">{props.caption}</p>
    </div>
  )
}

// ── The live shared component ─────────────────────────────────────────────

/**
 * The real primitive, so whatever toggle.tsx currently ships is what renders.
 * The only difference between the two columns is one className on the item —
 * and it is the BEFORE column that carries it now.
 */
function LiveToggleGroup(props: {
  variant: ToggleVariant
  size: ToggleSize
  itemClassName?: string
}) {
  const [value, setValue] = useState("sans")

  return (
    <ToggleGroup
      type="single"
      variant={props.variant}
      size={props.size}
      value={value}
      aria-label="Typeface"
      onValueChange={(next) => {
        if (next) setValue(next)
      }}
    >
      {SEGMENTS.map((segment) => (
        <ToggleGroupItem key={segment.id} value={segment.id} className={props.itemClassName}>
          {segment.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

/** Every real variant × every real size, on one surface. */
function VariantMatrix(props: { surface: Surface; itemClassName?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg p-3 ring-1 ring-border-weak-base",
        SURFACE_CLASS[props.surface],
      )}
    >
      <span className="font-mono text-[10px] uppercase tracking-widest text-text-weaker">
        {SURFACE_LABEL[props.surface]}
      </span>
      {VARIANTS.map((variant) => (
        <div key={variant} className="flex flex-col gap-1.5">
          <span className="font-mono text-[10px] text-text-weaker">variant={variant}</span>
          <div className="flex flex-wrap items-center gap-3">
            {SIZES.map((size) => (
              <LiveToggleGroup
                key={size}
                variant={variant}
                size={size}
                itemClassName={props.itemClassName}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function Column(props: { title: string; note: string; children: ReactNode }) {
  return (
    <section className="flex min-w-[20rem] flex-1 flex-col gap-2">
      <header className="flex flex-col gap-0.5">
        <h3 className="text-sm font-medium text-text-strong">{props.title}</h3>
        <p className="text-xs leading-relaxed text-text-weak">{props.note}</p>
      </header>
      {props.children}
    </section>
  )
}

function SectionHeading(props: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-sm font-semibold text-text-strong">{props.title}</h3>
      <p className="max-w-3xl text-xs leading-relaxed text-text-weak">{props.children}</p>
    </div>
  )
}

// ── Easel ─────────────────────────────────────────────────────────────────

export function SegmentedActiveStateEasel() {
  return (
    <div className="h-full min-h-0 w-full overflow-y-auto bg-background-base">
      <div className="flex w-full flex-col gap-6 p-6">
        <header className="flex flex-col gap-2">
          <h1 className="text-lg font-semibold text-text-strong">
            Segmented active state · the on-state that is also the hover state
          </h1>
          <p className="max-w-3xl text-xs leading-relaxed text-text-weak">
            <code className="text-text-base">toggleVariants</code> in{" "}
            <code className="text-text-base">packages/ui/src/components/ui/toggle.tsx</code> used to
            declare <code className="text-text-base">hover:bg-surface-weak</code>,{" "}
            <code className="text-text-base">aria-pressed:bg-surface-weak</code> and{" "}
            <code className="text-text-base">data-[state=on]:bg-surface-weak</code> — three states,
            one token, and no other difference between them. Selection was tracked correctly and
            painted in a colour that said nothing. Fixed; the before/after below is the record.
          </p>
          <p className="max-w-3xl text-xs leading-relaxed text-text-weak">
            This is the real <code className="text-text-base">ToggleGroup</code> from{" "}
            <code className="text-text-base">@buddy/ui</code> throughout — every variant and size
            the component actually defines. The fix has landed, so the "after" columns are the plain
            component and the "before" columns are the old behaviour put back by hand. Click through
            them and hover across them.
          </p>
        </header>

        <div className="rounded-lg border border-border-weak-base bg-surface-raised-base p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-text-strong">
            Where it came from
          </h3>
          <p className="mt-1.5 max-w-3xl text-xs leading-relaxed text-text-weak">
            Not a Buddy regression.{" "}
            <code className="text-text-base">git diff 22c907d327 -- .../toggle.tsx</code> shows the
            only substantive change Buddy ever made to this file is the token rename —{" "}
            <code className="text-text-base">muted → surface-weak</code>,{" "}
            <code className="text-text-base">ring → border-interactive-base</code>. The upstream
            string already read <code className="text-text-base">hover:bg-muted</code> …{" "}
            <code className="text-text-base">data-[state=on]:bg-muted</code>, so the collapse
            arrived with the component and there is nothing to revert to. Per{" "}
            <code className="text-text-base">packages/ui/AGENTS.md</code> — shadcn is the
            foundation, the Buddy token layer is the theme — overriding it here is the intended
            move.
          </p>
          <p className="mt-2 max-w-3xl text-xs leading-relaxed text-text-weak">
            <span className="font-medium text-text-base">Scope:</span>{" "}
            <code className="text-text-base">toggleVariants</code> is consumed by{" "}
            <code className="text-text-base">Toggle</code> and by{" "}
            <code className="text-text-base">ToggleGroupItem</code>, but{" "}
            <code className="text-text-base">packages/ui/src/index.ts</code> exports only{" "}
            <code className="text-text-base">ToggleGroup</code> and{" "}
            <code className="text-text-base">ToggleGroupItem</code> — bare{" "}
            <code className="text-text-base">Toggle</code> is unreachable from the app. One string,
            one consumer, so there is no second component to mock beside this one.
          </p>
        </div>

        <Separator />

        <SectionHeading title="1 · The collision, without moving a pointer">
          Both swatches are the literal tokens from{" "}
          <code className="text-text-base">toggleVariants</code>. On the left, "selected" and
          "hovered" are the same declaration, so the row is one flat colour with three labels on it.
          On the right, the proposed on-state has to clear two bars — separate from the surface, and
          separate from the hovered peer beside it.
        </SectionHeading>

        <div className="flex flex-wrap gap-6">
          <CollisionRow
            title="Before"
            onClass="bg-surface-weak"
            caption="data-[state=on]:bg-surface-weak, which was also hover:bg-surface-weak."
          />
          <CollisionRow
            title="After"
            onClass="bg-surface-raised-strong text-text-strong"
            caption="One step up, plus a text-colour signal that hover never touches."
          />
        </div>

        <Separator />

        <SectionHeading title="2 · Before and after, on the real component">
          Two variants and three sizes — everything{" "}
          <code className="text-text-base">toggleVariants</code> defines, nothing invented. The only
          difference between the columns is one <code className="text-text-base">className</code> on{" "}
          <code className="text-text-base">ToggleGroupItem</code>. Compare the popover rows rather
          than the page rows: the page rows nearly work today, which is how this survived review.
        </SectionHeading>

        <div className="flex flex-wrap gap-6">
          <Column
            title="Before · what it used to do"
            note="data-[state=on]:bg-surface-weak — the same token as hover, with no second signal. Reconstructed by overriding the fix back, since the component no longer does this."
          >
            <div className="flex flex-col gap-3">
              {SURFACES.map((surface) => (
                <VariantMatrix key={surface} surface={surface} itemClassName={REGRESSED_ON_STATE} />
              ))}
            </div>
          </Column>

          <Column
            title="After · the component as it now ships"
            note="No override at all — this is toggleVariants after the fix. Neutral rather than accented, so a panel with five selected segments does not turn into a colour field."
          >
            <div className="flex flex-col gap-3">
              {SURFACES.map((surface) => (
                <VariantMatrix key={surface} surface={surface} />
              ))}
            </div>
          </Column>
        </div>

        <Separator />

        <SectionHeading title="3 · The change, as applied">
          One string in <code className="text-text-base">toggleVariants</code>. The explicit{" "}
          <code className="text-text-base">data-[state=on]:hover:</code> is load-bearing: an
          attribute selector and <code className="text-text-base">:hover</code> have equal
          specificity, so without it, hovering a selected segment hands it back to the hover colour
          and reintroduces the bug in the one case people test by hand.
        </SectionHeading>

        <div className="overflow-x-auto rounded-lg border border-border-weak-base bg-surface-raised-base p-4">
          <pre className="min-w-0 font-mono text-[11px] leading-relaxed text-text-weak">
            {`  packages/ui/src/components/ui/toggle.tsx

- aria-pressed:bg-surface-weak
- data-[state=on]:bg-surface-weak
  hover:bg-surface-weak

+ aria-pressed:bg-surface-raised-strong
+ data-[state=on]:bg-surface-raised-strong
+ data-[state=on]:text-text-strong
+ data-[state=on]:hover:bg-surface-raised-strong
  hover:bg-surface-weak`}
          </pre>
        </div>

        <p className="max-w-3xl pb-4 text-xs leading-relaxed text-text-weaker">
          Consumers that change with it:{" "}
          <code className="text-text-base">foliate-preferences-panel.tsx</code>,{" "}
          <code className="text-text-base">pdf-reader.tsx</code>,{" "}
          <code className="text-text-base">reader-preferences-panel.tsx</code>,{" "}
          <code className="text-text-base">reader-annotation-dialog.tsx</code>, and every easel
          using a ToggleGroup. That breadth is the argument for fixing the variant rather than one
          panel — and the argument for the neutral on-state over an accented one.
        </p>
      </div>
    </div>
  )
}
