import { Badge, Button, Input, Separator, Switch } from "@buddy/ui"
import type { McpStatusMap } from "@/state/chat-types"
import { formatMcpError, getMcpStatusLabel, type McpConfig } from "./mcp-config-schema"

type McpListPanelProps = {
  allNames: string[]
  entries: string[]
  showSearch: boolean
  loading: boolean
  query: string
  setQuery: (value: string) => void
  pendingName: string | null
  statusByName: McpStatusMap
  configByName: Record<string, McpConfig>
  onAddMcp: () => void
  onEditMcp: (name: string) => void
  onToggleMcp: (name: string) => Promise<void>
  onConnectMcp: (name: string) => Promise<void>
}

export function McpListPanel(props: McpListPanelProps) {
  return (
    <>
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 px-3 py-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">MCP definitions</p>
          <p className="text-xs text-muted-foreground">
            {props.allNames.length > 0
              ? "Manage saved MCPs here. Use search below to filter the list."
              : "Add an MCP to save it to this notebook's buddy.jsonc."}
          </p>
        </div>
        <Button type="button" size="sm" className="shrink-0" onClick={props.onAddMcp}>
          Add MCP
        </Button>
      </div>

      {props.showSearch ? (
        <Input
          value={props.query}
          onChange={(event) => props.setQuery(event.target.value)}
          placeholder="Filter MCPs"
          autoFocus
        />
      ) : null}

      <div className="max-h-[min(24rem,calc(100vh-12rem))] overflow-y-auto rounded-xl border">
        {props.entries.length > 0 ? (
          props.entries.map((name, index) => {
            const status = props.statusByName[name]
            const config = props.configByName[name]
            const enabled = status?.status === "connected"
            const label = status ? getMcpStatusLabel(status.status) : config?.enabled === false ? "Disabled" : "Configured"
            const isPending = props.pendingName === name
            const pendingLabel =
              status?.status === "connected"
                ? "Disconnecting..."
                : status?.status === "needs_auth"
                  ? "Signing in..."
                  : "Connecting..."

            return (
              <div key={name}>
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium text-foreground">{name}</p>
                      <Badge variant="outline" className="h-5">
                        {label}
                      </Badge>
                      {config ? (
                        <Badge variant="secondary" className="h-5">
                          {config.type}
                        </Badge>
                      ) : null}
                      {isPending ? <span className="text-xs text-muted-foreground">{pendingLabel}</span> : null}
                    </div>
                    {status?.error ? (
                      <p className="mt-1 truncate text-xs text-muted-foreground">{formatMcpError(status.error)}</p>
                    ) : config ? (
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {config.type === "remote" ? config.url : config.command.join(" ")}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {config ? (
                      <Button type="button" size="xs" variant="outline" onClick={() => props.onEditMcp(name)}>
                        Edit details
                      </Button>
                    ) : null}
                    {status?.status === "needs_auth" ? (
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        disabled={isPending}
                        onClick={() => {
                          void props.onConnectMcp(name)
                        }}
                      >
                        Connect
                      </Button>
                    ) : null}
                    <Switch
                      checked={enabled}
                      disabled={isPending}
                      aria-label={`${enabled ? "Disable" : "Enable"} ${name}`}
                      onCheckedChange={() => {
                        void props.onToggleMcp(name)
                      }}
                    />
                  </div>
                </div>
                {index === props.entries.length - 1 ? null : <Separator />}
              </div>
            )
          })
        ) : (
          <div className="flex flex-col items-start gap-3 px-4 py-8 text-sm text-muted-foreground">
            <p>
              {props.loading
                ? "Loading MCPs..."
                : props.showSearch
                  ? "No MCPs match your current filter."
                  : "No MCPs configured yet."}
            </p>
            {!props.loading && !props.showSearch ? (
              <Button type="button" size="sm" variant="outline" onClick={props.onAddMcp}>
                Add your first MCP
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </>
  )
}
