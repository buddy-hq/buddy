import { Button, Card, CardContent, CardFooter, CardHeader, CardTitle, Switch } from "@buddy/ui"
import { Loader2Icon } from "lucide-react"
import { language } from "@/context/language"
import type { SkillLibraryEntry } from "@/state/skills-actions"
import {
  skillLibraryAction,
  skillLibraryButtonVariant,
  type SkillLibraryAction,
} from "./skill-library-actions"

export type SkillTileStatus =
  | {
      kind: "toggle"
      active: boolean
      statusLabel: string
      ariaLabel: string
      pending?: boolean
      onToggle: (next: boolean) => void
    }
  | {
      kind: "library"
      skill: SkillLibraryEntry
      busyAction?: SkillLibraryAction
      disabled?: boolean
      onInstall: () => void
      onRemove: () => void
    }

function skillLibraryActionLabel(action: SkillLibraryAction): string {
  if (action === "install") return language.t("skills.install")
  if (action === "update") return language.t("skills.update")
  if (action === "remove") return language.t("skills.detail.remove")
  return language.t("skills.installed")
}

function skillLibraryBusyLabel(action: SkillLibraryAction): string {
  if (action === "install") return language.t("skills.installing")
  if (action === "update") return language.t("skills.updating")
  if (action === "remove") return language.t("skills.removing")
  return language.t("skills.installed")
}

export function LibraryActionButton(props: {
  skill: SkillLibraryEntry
  disabled?: boolean
  busyAction?: SkillLibraryAction
  compact?: boolean
  onInstall: () => void
  onRemove: () => void
}) {
  const action = skillLibraryAction(props.skill.state)
  const displayAction = props.busyAction ?? action
  const variant = skillLibraryButtonVariant(displayAction)
  const busy = props.busyAction !== undefined

  return (
    <Button
      type="button"
      variant={variant}
      size={props.compact ? "sm" : "default"}
      className={props.compact ? "h-8 min-w-28 text-xs" : "h-10 min-w-[132px]"}
      disabled={props.disabled || busy || action === "installed"}
      onClick={(event) => {
        event.stopPropagation()
        if (action === "remove") {
          props.onRemove()
          return
        }
        props.onInstall()
      }}
    >
      {busy ? <Loader2Icon className="size-3.5 animate-spin" aria-hidden /> : null}
      {busy ? skillLibraryBusyLabel(displayAction) : skillLibraryActionLabel(displayAction)}
    </Button>
  )
}

function SkillTileStatusControl(props: { status: SkillTileStatus }) {
  if (props.status.kind === "library") {
    return (
      <LibraryActionButton
        skill={props.status.skill}
        compact
        busyAction={props.status.busyAction}
        disabled={props.status.disabled}
        onInstall={props.status.onInstall}
        onRemove={props.status.onRemove}
      />
    )
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium text-text-weaker">{props.status.statusLabel}</span>
      <Switch
        size="sm"
        checked={props.status.active}
        onCheckedChange={props.status.onToggle}
        disabled={props.status.pending}
        aria-label={props.status.ariaLabel}
      />
    </div>
  )
}

export function SkillTileCard(props: {
  title: string
  description: string
  meta: string
  status: SkillTileStatus
  onSelect: () => void
}) {
  return (
    <Card
      onClick={props.onSelect}
      className="cursor-pointer border-border-base/60 bg-surface-raised-base/60 transition-colors hover:border-border-base active:scale-[0.985]"
    >
      <CardHeader className="p-3 pb-0">
        <CardTitle className="truncate text-sm font-semibold leading-snug text-text-base">
          {props.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 p-3 pt-1.5">
        <p className="line-clamp-2 text-sm leading-relaxed text-text-weak">{props.description}</p>
      </CardContent>
      <CardFooter className="justify-between gap-3 px-3 py-2.5">
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-text-weaker">
          {props.meta}
        </span>
        <div className="shrink-0" onClick={(event) => event.stopPropagation()}>
          <SkillTileStatusControl status={props.status} />
        </div>
      </CardFooter>
    </Card>
  )
}

export function SkillTileCardSkeleton() {
  return (
    <Card className="border-border-base/60 bg-surface-raised-base/50">
      <CardHeader className="p-3 pb-0">
        <div className="h-4 w-32 rounded-md bg-surface-weak/60" />
      </CardHeader>
      <CardContent className="flex-1 space-y-1.5 p-3 pt-1.5">
        <div className="h-3 w-full rounded-md bg-surface-weak/30" />
        <div className="h-3 w-3/4 rounded-md bg-surface-weak/30" />
      </CardContent>
      <CardFooter className="justify-between gap-3 px-3 py-2.5">
        <div className="h-3 w-20 rounded-md bg-surface-weak/30" />
        <div className="h-7 w-16 rounded-md bg-surface-weak/40" />
      </CardFooter>
    </Card>
  )
}
