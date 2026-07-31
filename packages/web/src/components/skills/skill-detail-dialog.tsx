import type { ReactNode } from "react"
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Spinner,
  Switch,
} from "@buddy/ui"
import { language } from "@/context/language"
import { SKILL_VISUAL_SIZE_LG, SkillVisual } from "./skill-visual"

/**
 * The detail dialog for one skill.
 *
 * It reads top to bottom in order of what you came for: who this is (mark,
 * name, summary), the one thing you can change about it (the switch), what it
 * is made of (reference fields), and only then the way out of it (remove).
 * Nothing here is a box inside a box — the switch band is full-bleed and
 * hairline-bounded, the fields are bare label-over-value, so the surface has
 * exactly one edge: the dialog's own.
 */

export const SKILL_DETAIL_FIELD_TEXT = "text"
export const SKILL_DETAIL_FIELD_CHIPS = "chips"

export type SkillDetailFieldKind = typeof SKILL_DETAIL_FIELD_TEXT | typeof SKILL_DETAIL_FIELD_CHIPS

export type SkillDetailField = {
  label: string
  kind: SkillDetailFieldKind
  values: readonly string[]
}

export type SkillDetailActivation = {
  active: boolean
  pending: boolean
  ariaLabel: string
  onToggle: (checked: boolean) => void
}

export type SkillDetailRemoval = {
  disabled: boolean
  onRemove: () => void
}

export type SkillDetail = {
  /** Identity for the mark and its fallback colour — stable per skill. */
  id: string
  title: string
  description: string
  icon?: string
  /** Fields with no values are dropped, so no label ever sits over nothing. */
  fields: readonly SkillDetailField[]
  activation?: SkillDetailActivation
  removal?: SkillDetailRemoval
  /** Install or update. Absent when there is nothing left to do to this skill. */
  primaryAction?: ReactNode
}

function SkillActivationBand(props: { activation: SkillDetailActivation }) {
  return (
    <div
      className="-mx-4 flex items-center justify-between gap-4 border-y border-border-weaker-base px-4 py-3"
      aria-busy={props.activation.pending}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-medium text-text-base">{language.t("skills.active")}</span>
        <span className="text-xs text-text-weaker">{language.t("skills.activeDescription")}</span>
      </div>
      <div className="flex items-center gap-2">
        {props.activation.pending ? <Spinner className="size-3.5" /> : null}
        <Switch
          checked={props.activation.active}
          disabled={props.activation.pending}
          aria-label={props.activation.ariaLabel}
          onCheckedChange={props.activation.onToggle}
        />
      </div>
    </div>
  )
}

/**
 * Label over value, not label beside value: a fixed label column has to be wide
 * enough for the longest label and then every value starts inset from nothing,
 * which is what made a repo path and a list of tags look like the same
 * substance. Stacked, the micro-label recedes and the value owns the full width.
 */
function SkillDetailFields(props: { fields: readonly SkillDetailField[] }) {
  return (
    <dl className="flex flex-col gap-4">
      {props.fields.map((field) => (
        <div key={field.label} className="flex flex-col gap-1.5">
          <dt className="text-[11px] font-medium uppercase tracking-wider text-text-weaker">
            {field.label}
          </dt>
          <dd className="min-w-0">
            {field.kind === SKILL_DETAIL_FIELD_CHIPS ? (
              <div className="flex flex-wrap gap-1.5">
                {field.values.map((value) => (
                  <Badge key={value} variant="outline" className="font-normal text-text-weak">
                    {value}
                  </Badge>
                ))}
              </div>
            ) : (
              <span className="break-words text-sm text-text-weak">{field.values.join(", ")}</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  )
}

export function SkillDetailDialog(props: {
  detail?: SkillDetail
  iconRetryToken?: number
  onOpenChange: (open: boolean) => void
}) {
  const detail = props.detail
  const hasFooter = detail?.removal !== undefined || detail?.primaryAction !== undefined

  return (
    <Dialog open={detail !== undefined} onOpenChange={props.onOpenChange}>
      <DialogContent className="gap-5 sm:max-w-md">
        {detail ? (
          <>
            {/* The close button sits at the top right, so the header keeps its
                hands off that corner. */}
            <DialogHeader className="gap-0 pr-7">
              <div className="flex items-start gap-3.5">
                <SkillVisual
                  id={detail.id}
                  title={detail.title}
                  {...(detail.icon ? { icon: detail.icon } : {})}
                  {...(props.iconRetryToken !== undefined
                    ? { retryToken: props.iconRetryToken }
                    : {})}
                  size={SKILL_VISUAL_SIZE_LG}
                />
                <div className="flex min-w-0 flex-col gap-1.5">
                  <DialogTitle className="text-lg font-semibold leading-tight">
                    {detail.title}
                  </DialogTitle>
                  <DialogDescription className="leading-snug">
                    {detail.description}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            {detail.activation ? <SkillActivationBand activation={detail.activation} /> : null}

            {detail.fields.length > 0 ? <SkillDetailFields fields={detail.fields} /> : null}

            {/* Remove is recessive on purpose. It was the loudest thing in the
                dialog, which pointed the eye at the one action you are least
                likely to want. */}
            {hasFooter ? (
              <DialogFooter>
                {detail.removal ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-text-critical-base hover:bg-surface-critical-weak hover:text-text-on-critical-weak sm:mr-auto"
                    disabled={detail.removal.disabled}
                    onClick={detail.removal.onRemove}
                  >
                    {language.t("skills.detail.remove")}
                  </Button>
                ) : null}
                {detail.primaryAction}
              </DialogFooter>
            ) : null}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
