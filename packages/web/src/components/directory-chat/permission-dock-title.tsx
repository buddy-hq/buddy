import { CardTitle } from "@buddy/ui"
import { ScanText, ShieldAlert, SquarePen, Terminal } from "@/icons/app-icons"
import { language } from "@/context/language"
import type { PermissionRequest } from "@/state/permission-types"

type TPermissionDockTitleIcon = "read" | "edit" | "command" | "shield"

type TPermissionDockHeadline = { icon: TPermissionDockTitleIcon; title: string }

export function getPermissionDockHeadline(request: PermissionRequest): TPermissionDockHeadline {
  const resource = request.resources[0]
  const filename = resource?.replace(/[\\/]+$/, "").split(/[\\/]/).at(-1)
  const prefix = language.t("chat.permissionDock.permissionNeeded")
  switch (request.action) {
    case "read": return { icon: "read", title: `${prefix}: ${filename ? language.t("chat.permissionDock.action.read", { path: filename }) : language.t("chat.permissionDock.action.readGeneric")}` }
    case "edit": return { icon: "edit", title: `${prefix}: ${filename ? language.t("chat.permissionDock.action.edit", { path: filename }) : language.t("chat.permissionDock.action.editGeneric")}` }
    case "shell": return { icon: "command", title: `${prefix}: ${language.t("chat.permissionDock.action.bash")}` }
    case "outside_notebook": return { icon: "shield", title: `${prefix}: ${language.t("chat.permissionDock.action.externalDirectory")}` }
    case "subagent": return { icon: "shield", title: `${prefix}: Ask another Buddy to help` }
    case "skill": return { icon: "shield", title: `${prefix}: Use a skill` }
    case "glob": return { icon: "read", title: `${prefix}: Find files` }
    case "grep": return { icon: "read", title: `${prefix}: Search file contents` }
    case "webfetch": return { icon: "shield", title: `${prefix}: Read a web page` }
    case "websearch": return { icon: "shield", title: `${prefix}: Search the web` }
    case "question": return { icon: "shield", title: `${prefix}: Ask you a question` }
    case "list_mcp_resources": return { icon: "read", title: `${prefix}: List connected resources` }
    case "read_mcp_resource": return { icon: "read", title: `${prefix}: Read a connected resource` }
    default: return { icon: "shield", title: `${prefix}: ${request.action.replaceAll("_", " ")}` }
  }
}

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
