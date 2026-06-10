import { CardTitle } from "@buddy/ui"
import { ScanText, ShieldAlert, SquarePen, Terminal } from "lucide-react"
import type { TPermissionDockTitleIcon } from "@/lib/permission-dock-headline"

const PERMISSION_DOCK_TITLE_ICONS = {
  read: ScanText,
  edit: SquarePen,
  command: Terminal,
  shield: ShieldAlert,
} as const

type PermissionDockTitleProps = {
  icon: TPermissionDockTitleIcon
  title: string
}

export function PermissionDockTitle(props: PermissionDockTitleProps) {
  const Icon = PERMISSION_DOCK_TITLE_ICONS[props.icon]

  return (
    <CardTitle className="flex items-center gap-2 text-text-warning-base">
      <Icon className="size-4 shrink-0" />
      {props.title}
    </CardTitle>
  )
}
