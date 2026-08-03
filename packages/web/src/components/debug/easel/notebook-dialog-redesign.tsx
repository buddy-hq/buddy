import { useState, type ReactNode } from "react"
import { Badge, Button, Input, cn } from "@buddy/ui"
import { XIcon } from "@/icons/app-icons"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@buddy/ui/components/ui/input-group"

/**
 * Easel · Create-notebook dialog
 *
 * Four things exist, and nothing else is allowed in:
 *
 *   name  ·  create  ·  open existing folder  ·  cancel
 *
 * No icons, no path, no key caps. The shipped dialog's medallion, description
 * and reassurance caption are cut for the same reason.
 *
 * With ornament off the table there is exactly one open question left — where
 * the "open existing folder" escape hatch goes without competing with Create —
 * so that is what these three differ on, and the only other axis is whether the
 * dialog needs a title at all.
 *
 *   A · Split footer   open-existing at the far left of the footer
 *   B · Under field    footer is Cancel/Create only; escape hatch sits below the field
 *   C · Attached       Create rides the field; two rows total, no footer block
 */

// ── Domain ────────────────────────────────────────────────────────────────

const NAME_PLACEHOLDER = "Notebook name"

const LABEL = {
  title: "New notebook",
  create: "Create",
  cancel: "Cancel",
  close: "Close",
  openExisting: "Open existing folder",
} as const

// ── Shell ─────────────────────────────────────────────────────────────────

/**
 * Keeps the real `DialogContent` fill, ring and radius, but not its `p-4` /
 * `sm:max-w-sm` — those are sized for dense multi-row dialogs. One field in a
 * 400px box on 16px padding is what reads as packed, so the box gets 24px of
 * air and enough width that the field is a field rather than a slot.
 */
const MODAL_WIDTH = 440

/**
 * The close X lives in a real header row rather than being absolutely
 * positioned on the corner. Absolute placement can only be tuned for one
 * variant: at the offset that centres it against an 18px title it lands on top
 * of variant C's field, which has no title above it. In flow, the row centres
 * the X against whatever is beside it, and gives C a top strip for free.
 */
function ModalShell(props: { children: ReactNode; label: string; title?: string }) {
  return (
    <section
      aria-label={props.label}
      style={{ width: MODAL_WIDTH }}
      className="bg-surface-raised-stronger-non-alpha ring-border-weak-base max-w-full rounded-xl p-6 text-sm ring-1"
    >
      <div className={cn("flex items-center justify-between gap-3", props.title ? "pb-5" : "pb-3")}>
        {props.title ? (
          <h2 className="text-text-strong text-lg font-semibold">{props.title}</h2>
        ) : (
          <span aria-hidden="true" />
        )}
        <CloseButton />
      </div>
      {props.children}
    </section>
  )
}

/**
 * `-mr-2` so the 32px hit box overhangs the content edge and the glyph's own
 * right edge lands on it — the same vertical as the field's right border.
 * Aligning the box instead would float the X visibly inward. `text-weaker`:
 * it is an exit, not a step.
 */
function CloseButton() {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={LABEL.close}
      className="text-text-weaker hover:text-text-base -mr-2 shrink-0"
    >
      <XIcon className="size-4" />
    </Button>
  )
}

/**
 * The scale. Everything was 14px before, which is why the dialog read flat —
 * five elements all shouting at the same volume, so the eye had no entry
 * point. Ranked by what the user needs, in gaze order:
 *
 *   title              18 / semibold / text-strong   what this is
 *   field              14 / regular  / inherited     where you act
 *   Create             14 / medium   / filled        the commit
 *   Cancel             14 / regular  / text-weak     the exit
 *   open existing      13 / regular  / text-weaker   the rare other mode
 *
 * The field would rather be 16, but `text-base` is not usable as a size class
 * in this codebase: `--color-text-base` resolves to `var(--text-base)`, which
 * `index.css` also declares in the font-size namespace, so `text-base` is both
 * a colour and a size and the input renders with the UA's black `fieldtext`.
 * `text-sm` and no colour override is what every other input here does, so the
 * field takes its presence from height instead.
 *
 * Size, colour and spacing all move together — the quietest action is also the
 * smallest and the dimmest, rather than being demoted by colour alone.
 *
 *   title → field   20   heading and its input are one group
 *   field → actions 24   the actions are another
 *
 * 44px on the field — it carries the dialog, so it gets the height.
 */
function NameField(props: { value: string; onChange: (value: string) => void }) {
  return (
    <Input
      autoFocus
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
      placeholder={NAME_PLACEHOLDER}
      aria-label={NAME_PLACEHOLDER}
      autoComplete="off"
      className="h-11 px-3.5 text-sm"
    />
  )
}

/**
 * The escape hatch cannot be a `Button`. Every button variant carries
 * horizontal padding, so its label lands 14px inside its own box while the
 * title and the field's border-box both start at 0 — the left rail breaks, and
 * no margin fixes it without also breaking the hover pill. `px-3.5` aligned it
 * to the placeholder instead, which is an inset *inside* another container and
 * so not a rail at all.
 *
 * A bare text control has no box, so the label itself sits at 0, on the same
 * vertical as the title above it and the field's left edge. It also drops the
 * hover fill, which this action should not have had — it is the quietest thing
 * in the dialog, and a pill on hover made it the loudest.
 *
 * Left rail, top to bottom:  title · field edge · open existing.
 */
function OpenExistingAction(props: { className?: string }) {
  return (
    <button
      type="button"
      className={cn(
        "text-text-weaker hover:text-text-base focus-visible:ring-border-interactive-base/50 rounded-xs text-xs transition-colors outline-none focus-visible:ring-2",
        props.className,
      )}
    >
      {LABEL.openExisting}
    </button>
  )
}

/**
 * Stays a real button — it is paired with Create, and a pair reads as a pair
 * only if both halves have the same box.
 */
function CancelAction() {
  return (
    <Button type="button" variant="ghost" className="text-text-weak px-4">
      {LABEL.cancel}
    </Button>
  )
}

function CreateAction(props: { disabled: boolean }) {
  return (
    <Button type="button" disabled={props.disabled} className="px-5">
      {LABEL.create}
    </Button>
  )
}

// ── A · Split footer ──────────────────────────────────────────────────────

/**
 * The conventional shape, weighted correctly. Title, field, one footer row —
 * escape hatch pinned to the far left so the gap itself does the separating,
 * which is the job the shipped "or" rule was doing badly.
 */
function SplitFooterVariant() {
  const [name, setName] = useState("")

  return (
    <ModalShell label={LABEL.title} title={LABEL.title}>
      <NameField value={name} onChange={setName} />
      <div className="flex items-center justify-between gap-3 pt-6">
        <OpenExistingAction />
        <div className="flex items-center gap-2">
          <CancelAction />
          <CreateAction disabled={name.trim().length === 0} />
        </div>
      </div>
    </ModalShell>
  )
}

// ── B · Under field ───────────────────────────────────────────────────────

/**
 * Splits the footer's two jobs apart. "Open existing" is an alternative to the
 * field, not a third footer button, so it sits directly under the field at the
 * field's own left edge — and the footer is left holding only the pair that
 * actually belongs together.
 */
function UnderFieldVariant() {
  const [name, setName] = useState("")

  return (
    <ModalShell label={LABEL.title} title={LABEL.title}>
      <NameField value={name} onChange={setName} />
      {/* Belongs to the field, so it stays closer to it than the footer does. */}
      <div className="pt-2.5">
        <OpenExistingAction />
      </div>
      <div className="flex items-center justify-end gap-2 pt-5">
        <CancelAction />
        <CreateAction disabled={name.trim().length === 0} />
      </div>
    </ModalShell>
  )
}

// ── C · Attached ──────────────────────────────────────────────────────────

/**
 * Two rows, no footer block. Create rides the field it acts on, which also
 * removes the need for a title — a field placeholdered "Notebook name" with
 * Create attached says what the dialog is. The remaining line carries the two
 * quiet actions, one at each end.
 */
function AttachedVariant() {
  const [name, setName] = useState("")

  return (
    <ModalShell label={LABEL.title}>
      {/* Taller than the plain field — it carries a button, and with no title
          above it this row is the whole top half of the dialog. */}
      <InputGroup className="h-13 rounded-lg">
        <InputGroupInput
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={NAME_PLACEHOLDER}
          aria-label={NAME_PLACEHOLDER}
          autoComplete="off"
          className="h-13 pl-3.5 text-sm"
        />
        <InputGroupAddon align="inline-end" className="pr-2">
          <InputGroupButton
            variant="default"
            size="sm"
            disabled={name.trim().length === 0}
            className="h-9 px-4 text-sm"
          >
            {LABEL.create}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      <div className="flex items-center justify-between gap-3 pt-3">
        <OpenExistingAction />
        <CancelAction />
      </div>
    </ModalShell>
  )
}

// ── Easel harness ─────────────────────────────────────────────────────────

const VARIANTS = ["split-footer", "under-field", "attached", "compare"] as const
type Variant = (typeof VARIANTS)[number]

type DialogVariant = Exclude<Variant, "compare">

const DIALOG_VARIANTS = [
  "split-footer",
  "under-field",
  "attached",
] as const satisfies readonly DialogVariant[]

const VARIANT_LABEL: Record<Variant, string> = {
  "split-footer": "A · Split footer",
  "under-field": "B · Under field",
  attached: "C · Attached",
  compare: "Compare",
}

const VARIANT_NOTE: Record<Variant, string> = {
  "split-footer": "Conventional shape, correct weights — escape hatch pinned far left of the footer",
  "under-field": "Escape hatch belongs to the field, not the footer — footer keeps only Cancel/Create",
  attached: "Create rides the field, so the title goes — two rows, quiet actions at each end",
  compare: "All three at real size, on the same scrim",
}

const VARIANT_COMPONENT: Record<DialogVariant, () => ReactNode> = {
  "split-footer": SplitFooterVariant,
  "under-field": UnderFieldVariant,
  attached: AttachedVariant,
}

/** Keyed so switching variants remounts rather than reusing hook slots. */
function ActiveVariant(props: { variant: DialogVariant }) {
  const Component = VARIANT_COMPONENT[props.variant]
  return <Component key={props.variant} />
}

function ScrimStage(props: { children: ReactNode }) {
  return (
    <div className="bg-background-base/60 flex w-full items-center justify-center rounded-xl p-12">
      {props.children}
    </div>
  )
}

export function NotebookDialogRedesignEasel() {
  const [variant, setVariant] = useState<Variant>("split-footer")

  return (
    <div className="bg-surface-inset-base flex h-full min-h-0 w-full flex-col overflow-hidden">
      <div className="border-border-weaker-base flex shrink-0 items-center justify-between gap-3 border-b px-4 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <p className="text-text-base shrink-0 text-xs font-medium">Create notebook · dialog</p>
          <div className="bg-surface-inset-strong flex items-center gap-0.5 rounded-lg p-0.5">
            {VARIANTS.map((candidate) => (
              <button
                key={candidate}
                type="button"
                onClick={() => setVariant(candidate)}
                className={cn(
                  "h-6 rounded-md px-2 text-[11px] font-medium transition-colors",
                  variant === candidate
                    ? "bg-surface-raised-base text-text-strong shadow-xs"
                    : "text-text-weak hover:text-text-base",
                )}
              >
                {VARIANT_LABEL[candidate]}
              </button>
            ))}
          </div>
        </div>
        <Badge variant="outline">Easel</Badge>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4 px-6 py-6">
          <p className="text-text-weaker text-[11px] leading-relaxed">{VARIANT_NOTE[variant]}</p>

          {variant === "compare" ? (
            <div className="flex flex-col gap-6">
              {DIALOG_VARIANTS.map((candidate) => (
                <div key={candidate} className="flex flex-col gap-2">
                  <p className="text-text-weak px-0.5 text-[11px] font-medium">
                    {VARIANT_LABEL[candidate]}
                  </p>
                  <ScrimStage>
                    <ActiveVariant variant={candidate} />
                  </ScrimStage>
                </div>
              ))}
            </div>
          ) : (
            <ScrimStage>
              <ActiveVariant variant={variant} />
            </ScrimStage>
          )}
        </div>
      </div>
    </div>
  )
}
