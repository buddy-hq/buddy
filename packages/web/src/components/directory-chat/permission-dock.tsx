import { useState } from "react"
import {
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@buddy/ui"
import { language } from "@/context/language"
import { PermissionDockPathValue } from "@/components/directory-chat/permission-dock-path-value"
import { PermissionDockTitle } from "@/components/directory-chat/permission-dock-title"
import { getPermissionDockBody } from "@/lib/permission-dock-locations"
import { getPermissionDockHeadline } from "@/lib/permission-dock-headline"
import type { PermissionRequest } from "@/state/chat-types"
import type { PermissionReply } from "@/state/permission-types"

type PermissionDockProps = {
  request: PermissionRequest
  pendingCount?: number
  onReply: (reply: PermissionReply) => Promise<void>
}

const PERMISSION_ACTION_TOOLTIP_DELAY_MS = 700
const PERMISSION_DOCK_PATH_WIDTH_CLASS = "min-w-0 max-w-[80%] flex-1 basis-0"
const PERMISSION_DOCK_COMMAND_CLASS =
  "min-w-0 w-full cursor-default select-none whitespace-pre-wrap break-all text-xs text-text-weak"

function permissionValueClassName(highlightPath: boolean | undefined, scope: string): string {
  if (highlightPath) {
    return `${PERMISSION_DOCK_PATH_WIDTH_CLASS} block cursor-default select-none text-xs`
  }
  if (scope === "command") {
    return PERMISSION_DOCK_COMMAND_CLASS
  }
  return `${PERMISSION_DOCK_PATH_WIDTH_CLASS} whitespace-pre-wrap break-words text-xs text-text-weak`
}

type PermissionActionProps = {
  description: string
  disabled: boolean
  label: string
  onClick: () => void
  variant?: "default" | "outline" | "secondary"
}

type PermissionLabeledValueProps = {
  highlightPath?: boolean
  label: string
  requestID: string
  scope: string
  value: string
}

type PermissionPathListProps = {
  paths: readonly string[]
  requestID: string
  scope: string
}

function PermissionLabeledValue(props: PermissionLabeledValueProps) {
  return (
    <div className="flex min-w-0 gap-2">
      <span className="w-16 shrink-0 text-xs text-text-weaker">{props.label}</span>
      <code
        className={permissionValueClassName(props.highlightPath, props.scope)}
        data-scope={props.scope}
        data-request-id={props.requestID}
      >
        {props.highlightPath ? <PermissionDockPathValue path={props.value} /> : props.value}
      </code>
    </div>
  )
}

function PermissionPathList(props: PermissionPathListProps) {
  return (
    <div className="flex flex-col gap-0.5">
      {props.paths.map((path) => (
        <code
          key={`${props.requestID}:${props.scope}:${path}`}
          className="block w-[80%] min-w-0 cursor-default select-none text-xs"
        >
          <PermissionDockPathValue path={path} />
        </code>
      ))}
    </div>
  )
}

function PermissionAction(props: PermissionActionProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={props.variant ?? "default"}
          size="sm"
          disabled={props.disabled}
          onClick={props.onClick}
          className="shrink-0"
        >
          {props.label}
        </Button>
      </TooltipTrigger>
      <TooltipContent className="max-w-64 text-pretty">{props.description}</TooltipContent>
    </Tooltip>
  )
}

export function PermissionDock(props: PermissionDockProps) {
  const [responding, setResponding] = useState(false)
  const headline = getPermissionDockHeadline(props.request)
  const body = getPermissionDockBody(props.request)
  const hasBodyContent = body.kind !== "none" || (props.pendingCount ?? 0) > 0

  async function onDecide(reply: PermissionReply) {
    if (responding) return
    setResponding(true)
    try {
      await props.onReply(reply)
    } finally {
      setResponding(false)
    }
  }

  return (
    <TooltipProvider delayDuration={PERMISSION_ACTION_TOOLTIP_DELAY_MS}>
      <Card role="alert" aria-live="assertive" className="gap-0 py-0">
        <CardHeader className={hasBodyContent ? "pb-4 pt-4" : "py-4"}>
          <PermissionDockTitle icon={headline.icon} title={headline.title} />
        </CardHeader>

        {hasBodyContent ? (
          <CardContent className="flex flex-col gap-2 px-4 pb-4 pt-0">
            {body.kind === "external_directory" ? (
              <div className="flex flex-col gap-2">
                {body.file ? (
                  <PermissionLabeledValue
                    highlightPath
                    label={language.t("chat.permissionDock.label.file")}
                    value={body.file}
                    requestID={props.request.id}
                    scope="file"
                  />
                ) : null}
                {body.command ? (
                  <PermissionLabeledValue
                    label={language.t("chat.permissionDock.label.command")}
                    value={body.command}
                    requestID={props.request.id}
                    scope="command"
                  />
                ) : null}
                {body.folders.map((folder) => (
                  <PermissionLabeledValue
                    key={`${props.request.id}:folder:${folder}`}
                    highlightPath
                    label={language.t("chat.permissionDock.label.folder")}
                    value={folder}
                    requestID={props.request.id}
                    scope="folder"
                  />
                ))}
              </div>
            ) : null}

            {body.kind === "command" ? (
              <code className={PERMISSION_DOCK_COMMAND_CLASS}>{body.command}</code>
            ) : null}

            {body.kind === "detail" ? (
              <PermissionPathList paths={body.lines} requestID={props.request.id} scope="detail" />
            ) : null}

            {(props.pendingCount ?? 0) > 0 ? (
              <p className="text-xs text-text-weak">
                {language.t(
                  (props.pendingCount ?? 0) === 1
                    ? "chat.permissionDock.pendingRequests.one"
                    : "chat.permissionDock.pendingRequests.other",
                  { count: props.pendingCount ?? 0 },
                )}
              </p>
            ) : null}
          </CardContent>
        ) : null}

        <CardFooter className="justify-end gap-2">
          <PermissionAction
            variant="outline"
            disabled={responding}
            onClick={() => void onDecide("reject")}
            label={language.t("chat.permissionDock.reject")}
            description={language.t("chat.permissionDock.rejectDescription")}
          />
          <PermissionAction
            variant="secondary"
            disabled={responding}
            onClick={() => void onDecide("always")}
            label={language.t("chat.permissionDock.allowAlways")}
            description={language.t("chat.permissionDock.allowAlwaysDescription")}
          />
          <PermissionAction
            disabled={responding}
            onClick={() => void onDecide("once")}
            label={language.t("chat.permissionDock.allowOnce")}
            description={language.t("chat.permissionDock.allowOnceDescription")}
          />
        </CardFooter>
      </Card>
    </TooltipProvider>
  )
}
